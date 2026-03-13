from typing import Dict, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.models import Expense, GroupMember, Settlement, SettlementStatus, User
from app.services.anomaly_detector import detect
from app.services.fairness_engine import calculate_fairness

router = APIRouter()


# Ensure authenticated user is part of the group.
def _assert_member(db: Session, group_id: UUID, user_id: UUID) -> None:
    if not db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id).first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")


# Return category-wise spending analytics.
@router.get("/groups/{group_id}/analytics/spending")
def spending_by_category(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_member(db, group_id, current_user.id)
    rows = (
        db.query(
            Expense.category,
            func.coalesce(func.sum(Expense.total_amount), 0.0),
            func.count(Expense.id),
        )
        .filter(Expense.group_id == group_id, Expense.is_reversal.is_(False))
        .group_by(Expense.category)
        .all()
    )
    if not rows:
        return []

    total_spent = round(sum(float(total or 0.0) for _, total, _ in rows), 2)

    output = []
    for category, total_amount, expense_count in rows:
        amount = round(float(total_amount or 0.0), 2)
        percentage = round((amount / total_spent) * 100.0, 2) if total_spent > 0 else 0.0
        output.append(
            {
                "category": category,
                "total_amount": amount,
                "percentage": percentage,
                "expense_count": int(expense_count),
            }
        )
    return sorted(output, key=lambda row: row["total_amount"], reverse=True)


# Return fairness score and contribution breakdown.
@router.get("/groups/{group_id}/analytics/fairness")
def fairness(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_member(db, group_id, current_user.id)
    return calculate_fairness(group_id, db)


# Return monthly spending, settled amount, and outstanding totals.
@router.get("/groups/{group_id}/analytics/trends")
def monthly_trends(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_member(db, group_id, current_user.id)

    spent_rows = (
        db.query(
            func.to_char(func.date_trunc("month", Expense.created_at), "YYYY-MM"),
            func.coalesce(func.sum(Expense.total_amount), 0.0),
        )
        .filter(Expense.group_id == group_id, Expense.is_reversal.is_(False))
        .group_by(func.date_trunc("month", Expense.created_at))
        .all()
    )
    spent_by_month: Dict[str, float] = {month: round(float(total or 0.0), 2) for month, total in spent_rows if month}

    settled_rows = (
        db.query(Settlement)
        .with_entities(
            func.to_char(func.date_trunc("month", func.coalesce(Settlement.confirmed_at, Settlement.created_at)), "YYYY-MM"),
            func.coalesce(func.sum(Settlement.amount), 0.0),
        )
        .filter(Settlement.group_id == group_id, Settlement.status == SettlementStatus.CONFIRMED)
        .group_by(func.date_trunc("month", func.coalesce(Settlement.confirmed_at, Settlement.created_at)))
        .all()
    )
    settled_by_month: Dict[str, float] = {month: round(float(total or 0.0), 2) for month, total in settled_rows if month}

    months = sorted(set(spent_by_month.keys()) | set(settled_by_month.keys()))
    output: List[Dict] = []
    for month in months:
        total_spent = round(spent_by_month.get(month, 0.0), 2)
        total_settled = round(settled_by_month.get(month, 0.0), 2)
        outstanding = round(total_spent - total_settled, 2)
        output.append(
            {
                "month": month,
                "total_spent": total_spent,
                "total_settled": total_settled,
                "outstanding": outstanding,
            }
        )
    return output


# Return suspicious expenses flagged by anomaly detector.
@router.get("/groups/{group_id}/analytics/anomalies")
def anomalies(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_member(db, group_id, current_user.id)
    return detect(group_id, db)
