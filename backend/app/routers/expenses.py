from typing import Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.models import Expense, ExpenseSplit, ExpenseStatus, GroupMember, SplitType, User
from app.schemas.expense import ExpenseCreate, ExpenseOut, SplitItemOut
from app.services.balance_engine import calculate_group_balances, get_group_member_ids

router = APIRouter()


# Validate that requester belongs to the target group.
def _assert_group_member(db: Session, group_id: UUID, user_id: UUID) -> None:
    membership = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")


# Convert Expense ORM object to API response model.
def _to_expense_out(expense: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=expense.id,
        title=expense.title,
        total_amount=round(float(expense.total_amount), 2),
        split_type=expense.split_type.value,
        paid_by_name=expense.payer.name if expense.payer else "Unknown",
        category=expense.category,
        is_reversal=expense.is_reversal,
        created_at=expense.created_at,
        splits=[
            SplitItemOut(
                user_id=split.user_id,
                user_name=split.user.name if split.user else "Unknown",
                share_amount=round(float(split.share_amount), 2),
            )
            for split in expense.splits
        ],
    )


# Create a group expense and split entries.
@router.post("/groups/{group_id}/expenses", response_model=ExpenseOut)
def create_expense(
    group_id: UUID,
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_group_member(db, group_id, current_user.id)
    group_member_ids = set(get_group_member_ids(db, group_id))

    if str(payload.paid_by) not in group_member_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payer must be a group member")

    split_total = round(sum(round(float(item.share_amount), 2) for item in payload.splits), 2)
    total_amount = round(float(payload.total_amount), 2)
    if abs(split_total - total_amount) > 0.01:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Split amounts must equal total amount")

    try:
        split_type = SplitType[payload.split_type.upper()]
    except KeyError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid split type")

    for split in payload.splits:
        if str(split.user_id) not in group_member_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Each split user must be a group member",
            )

    expense = Expense(
        group_id=group_id,
        paid_by=payload.paid_by,
        title=payload.title.strip(),
        total_amount=total_amount,
        split_type=split_type,
        category=payload.category.strip() if payload.category else "Other",
    )

    try:
        db.add(expense)
        db.flush()
        for split in payload.splits:
            db.add(
                ExpenseSplit(
                    expense_id=expense.id,
                    user_id=split.user_id,
                    share_amount=round(float(split.share_amount), 2),
                )
            )
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create expense")

    created = (
        db.query(Expense)
        .options(joinedload(Expense.splits).joinedload(ExpenseSplit.user), joinedload(Expense.payer))
        .filter(Expense.id == expense.id)
        .first()
    )
    return _to_expense_out(created)


# Reverse an existing expense with contra entries and negative splits.
@router.post("/expenses/{expense_id}/reverse", response_model=ExpenseOut)
def reverse_expense(
    expense_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    original = (
        db.query(Expense)
        .options(joinedload(Expense.splits), joinedload(Expense.payer))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not original:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    _assert_group_member(db, original.group_id, current_user.id)

    if original.is_reversal or original.status == ExpenseStatus.REVERSED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expense already reversed")

    try:
        reversal = Expense(
            group_id=original.group_id,
            paid_by=original.paid_by,
            title=f"Reversal: {original.title}",
            total_amount=round(float(original.total_amount), 2),
            split_type=original.split_type,
            category=original.category,
            is_reversal=True,
            reversed_by=original.id,
            status=ExpenseStatus.ACTIVE,
        )
        db.add(reversal)
        db.flush()

        for split in original.splits:
            db.add(
                ExpenseSplit(
                    expense_id=reversal.id,
                    user_id=split.user_id,
                    share_amount=round(-float(split.share_amount), 2),
                )
            )

        original.status = ExpenseStatus.REVERSED
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to reverse expense")

    created = (
        db.query(Expense)
        .options(joinedload(Expense.splits).joinedload(ExpenseSplit.user), joinedload(Expense.payer))
        .filter(Expense.id == reversal.id)
        .first()
    )
    return _to_expense_out(created)


# Return all expenses with payer and split details for a group.
@router.get("/groups/{group_id}/expenses", response_model=List[ExpenseOut])
def list_expenses(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_group_member(db, group_id, current_user.id)

    expenses = (
        db.query(Expense)
        .options(joinedload(Expense.splits).joinedload(ExpenseSplit.user), joinedload(Expense.payer))
        .filter(Expense.group_id == group_id)
        .order_by(Expense.created_at.desc())
        .all()
    )
    return [_to_expense_out(item) for item in expenses]


# Return per-member balances for a group.
@router.get("/groups/{group_id}/balances")
def group_balances(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_group_member(db, group_id, current_user.id)
    members = (
        db.query(User.id, User.name)
        .join(GroupMember, GroupMember.user_id == User.id)
        .filter(GroupMember.group_id == group_id)
        .all()
    )
    balance_map = calculate_group_balances(db, group_id, paid_non_reversal_only=True)
    return [
        {"user_id": str(member.id), "name": member.name, "balance": round(balance_map.get(str(member.id), 0.0), 2)}
        for member in members
    ]
