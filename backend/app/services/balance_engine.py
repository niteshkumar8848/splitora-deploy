from typing import Dict, Iterable, List
from uuid import UUID

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.models import Expense, ExpenseSplit, GroupMember


# Normalize any UUID-like value to string key.
def _key(value) -> str:
    return str(value)


# Return all member ids for a specific group.
def get_group_member_ids(db: Session, group_id: UUID) -> List[str]:
    return [_key(item.user_id) for item in db.query(GroupMember.user_id).filter(GroupMember.group_id == group_id).all()]


# Calculate per-member balances for a group using aggregate SQL.
def calculate_group_balances(db: Session, group_id: UUID, paid_non_reversal_only: bool = True) -> Dict[str, float]:
    member_ids = get_group_member_ids(db, group_id)
    if not member_ids:
        return {}

    if paid_non_reversal_only:
        paid_rows = (
            db.query(Expense.paid_by, func.coalesce(func.sum(Expense.total_amount), 0.0))
            .filter(Expense.group_id == group_id, Expense.is_reversal.is_(False))
            .group_by(Expense.paid_by)
            .all()
        )
    else:
        paid_rows = (
            db.query(
                Expense.paid_by,
                func.coalesce(
                    func.sum(
                        case(
                            (Expense.is_reversal.is_(True), -Expense.total_amount),
                            else_=Expense.total_amount,
                        )
                    ),
                    0.0,
                ),
            )
            .filter(Expense.group_id == group_id)
            .group_by(Expense.paid_by)
            .all()
        )

    owed_rows = (
        db.query(ExpenseSplit.user_id, func.coalesce(func.sum(ExpenseSplit.share_amount), 0.0))
        .join(Expense, Expense.id == ExpenseSplit.expense_id)
        .filter(Expense.group_id == group_id)
        .group_by(ExpenseSplit.user_id)
        .all()
    )

    paid_map = {_key(user_id): round(float(total or 0.0), 2) for user_id, total in paid_rows}
    owed_map = {_key(user_id): round(float(total or 0.0), 2) for user_id, total in owed_rows}

    return {
        user_id: round(paid_map.get(user_id, 0.0) - owed_map.get(user_id, 0.0), 2)
        for user_id in member_ids
    }


# Calculate a specific user's balance for one group.
def calculate_user_balance_for_group(
    db: Session,
    group_id: UUID,
    user_id: UUID,
    paid_non_reversal_only: bool = True,
) -> float:
    balances = calculate_group_balances(db, group_id, paid_non_reversal_only=paid_non_reversal_only)
    return round(float(balances.get(_key(user_id), 0.0)), 2)


# Calculate one user's balances across multiple groups in bulk.
def calculate_user_balances_for_groups(
    db: Session,
    user_id: UUID,
    group_ids: Iterable[UUID],
    paid_non_reversal_only: bool = True,
) -> Dict[str, float]:
    groups = [gid for gid in group_ids]
    if not groups:
        return {}

    if paid_non_reversal_only:
        paid_rows = (
            db.query(Expense.group_id, func.coalesce(func.sum(Expense.total_amount), 0.0))
            .filter(Expense.group_id.in_(groups), Expense.paid_by == user_id, Expense.is_reversal.is_(False))
            .group_by(Expense.group_id)
            .all()
        )
    else:
        paid_rows = (
            db.query(
                Expense.group_id,
                func.coalesce(
                    func.sum(
                        case(
                            (Expense.is_reversal.is_(True), -Expense.total_amount),
                            else_=Expense.total_amount,
                        )
                    ),
                    0.0,
                ),
            )
            .filter(Expense.group_id.in_(groups), Expense.paid_by == user_id)
            .group_by(Expense.group_id)
            .all()
        )

    owed_rows = (
        db.query(Expense.group_id, func.coalesce(func.sum(ExpenseSplit.share_amount), 0.0))
        .join(ExpenseSplit, Expense.id == ExpenseSplit.expense_id)
        .filter(Expense.group_id.in_(groups), ExpenseSplit.user_id == user_id)
        .group_by(Expense.group_id)
        .all()
    )

    paid_map = {_key(group_id): round(float(total or 0.0), 2) for group_id, total in paid_rows}
    owed_map = {_key(group_id): round(float(total or 0.0), 2) for group_id, total in owed_rows}

    return {
        _key(group_id): round(paid_map.get(_key(group_id), 0.0) - owed_map.get(_key(group_id), 0.0), 2)
        for group_id in groups
    }
