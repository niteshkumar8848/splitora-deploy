import os
import uuid
from datetime import datetime

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.models import Expense, ExpenseSplit, Group, GroupMember, Settlement, User
from app.schemas.settlement import (
    OptimizationStats,
    SettlementCreate,
    SettlementOut,
    SettlementSuggestion,
    SuggestedSettlementsResponse,
)
from app.services.settlement_engine import combined_settlement

router = APIRouter()


# Compute paid-minus-owed balance for each group member.
def get_net_balances(group_id: str, db: Session) -> dict:
    """
    Calculate net balance for every group member.
    balance = total_paid - total_share_owed
    positive = creditor, negative = debtor
    """
    members = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()

    balances = {}
    for member in members:
        user_id = member.user_id

        # Total this user paid (non-reversal expenses).
        paid = (
            db.query(func.sum(Expense.total_amount))
            .filter(
                Expense.group_id == group_id,
                Expense.paid_by == user_id,
                Expense.is_reversal.is_(False),
            )
            .scalar()
            or 0.0
        )

        # Total this user owes (sum of their splits).
        owed = (
            db.query(func.sum(ExpenseSplit.share_amount))
            .join(Expense, ExpenseSplit.expense_id == Expense.id)
            .filter(
                Expense.group_id == group_id,
                ExpenseSplit.user_id == user_id,
            )
            .scalar()
            or 0.0
        )

        balances[str(user_id)] = round(float(paid) - float(owed), 2)

    return balances


# Return combined-algorithm settlement suggestions with optimization stats.
@router.get("/groups/{group_id}/settlements/suggested", response_model=SuggestedSettlementsResponse)
def get_suggested_settlements(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns optimized settlement suggestions using the
    Combined Approach (Phase 1: Mutual Netting +
    Phase 2: Greedy Min Cash Flow).
    Also returns full optimization statistics.
    """

    # Verify user is group member.
    member = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(403, "Not a group member")

    # Get net balances for all members.
    balances = get_net_balances(group_id, db)

    # All balances zero = nothing to settle.
    if all(abs(v) <= 0.01 for v in balances.values()):
        return SuggestedSettlementsResponse(
            suggestions=[],
            stats=OptimizationStats(
                without_optimization=0,
                with_optimization=0,
                reduction_percentage=0.0,
                phase1_eliminated=0,
                phase2_resolved=0,
                algorithm_used="Combined: Mutual Netting + Greedy MCF",
            ),
            message="All settled up! No pending payments.",
        )

    # Run combined settlement algorithm.
    result = combined_settlement(balances)

    # Enrich transactions with user names and UPI IDs.
    suggestions = []
    for txn in result["transactions"]:
        from_user = db.query(User).filter(User.id == txn["from_user_id"]).first()
        to_user = db.query(User).filter(User.id == txn["to_user_id"]).first()

        if from_user and to_user:
            suggestions.append(
                SettlementSuggestion(
                    from_user_id=str(txn["from_user_id"]),
                    from_user_name=from_user.name,
                    to_user_id=str(txn["to_user_id"]),
                    to_user_name=to_user.name,
                    to_upi_id=to_user.upi_id,
                    amount=round(float(txn["amount"]), 2),
                )
            )

    # Build optimization stats.
    stats = OptimizationStats(
        without_optimization=result["without_optimization"],
        with_optimization=result["count"],
        reduction_percentage=result["reduction_percentage"],
        phase1_eliminated=result["phase1_eliminated"],
        phase2_resolved=result["phase2_resolved"],
        algorithm_used="Combined: Mutual Netting + Greedy MCF",
    )

    # Build a concise human-readable optimization summary.
    saved = result["without_optimization"] - result["count"]
    message = (
        f"Optimized {result['without_optimization']} debts "
        f"into {result['count']} transactions "
        f"({result['reduction_percentage']}% reduction). "
        f"Phase 1 eliminated {result['phase1_eliminated']} "
        f"mutual debts. "
        f"You save {saved} unnecessary payment(s)."
    )

    return SuggestedSettlementsResponse(
        suggestions=suggestions,
        stats=stats,
        message=message,
    )


# Create a pending settlement record and corresponding Razorpay order.
@router.post("/settlements", response_model=SettlementOut)
def create_settlement(
    data: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a settlement record and Razorpay payment order.
    Status starts as PENDING until webhook confirms payment.
    """

    # Verify from_user is current user.
    if data.from_user_id != str(current_user.id):
        raise HTTPException(403, "Can only create settlement for yourself")

    # Create settlement record.
    settlement = Settlement(
        id=str(uuid.uuid4()),
        group_id=data.group_id,
        from_user=data.from_user_id,
        to_user=data.to_user_id,
        amount=round(float(data.amount), 2),
        status="PENDING",
        created_at=datetime.utcnow(),
    )
    db.add(settlement)
    db.flush()

    # Create Razorpay order.
    try:
        client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET")))
        order = client.order.create(
            {
                "amount": int(round(float(data.amount), 2) * 100),
                "currency": "INR",
                "receipt": f"settle_{str(settlement.id)[:8]}",
            }
        )
        settlement.razorpay_order_id = order["id"]
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Payment order failed: {str(e)}")

    db.commit()
    db.refresh(settlement)

    # Resolve sender and receiver names for response payload.
    from_user = db.query(User).filter(User.id == data.from_user_id).first()
    to_user = db.query(User).filter(User.id == data.to_user_id).first()

    status_value = settlement.status.value if hasattr(settlement.status, "value") else str(settlement.status)

    return SettlementOut(
        id=str(settlement.id),
        from_user_id=str(settlement.from_user),
        from_user_name=from_user.name if from_user else "Unknown",
        to_user_id=str(settlement.to_user),
        to_user_name=to_user.name if to_user else "Unknown",
        to_upi_id=to_user.upi_id if to_user else None,
        amount=round(float(settlement.amount), 2),
        status=status_value,
        razorpay_order_id=settlement.razorpay_order_id,
        created_at=settlement.created_at,
    )


# Return confirmed settlements for the group to power ledger payment history.
@router.get("/groups/{group_id}/settlements/history", response_model=list[SettlementOut])
def get_settlement_history(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all confirmed settlements for a group.
    Used in Ledger screen to show payment history.
    """
    member = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not member:
        raise HTTPException(403, "Not a group member")

    settlements = (
        db.query(Settlement)
        .filter(
            Settlement.group_id == group_id,
            Settlement.status == "CONFIRMED",
        )
        .order_by(Settlement.confirmed_at.desc())
        .all()
    )

    result = []
    for s in settlements:
        from_user = db.query(User).filter(User.id == s.from_user).first()
        to_user = db.query(User).filter(User.id == s.to_user).first()
        status_value = s.status.value if hasattr(s.status, "value") else str(s.status)
        result.append(
            SettlementOut(
                id=str(s.id),
                from_user_id=str(s.from_user),
                from_user_name=from_user.name if from_user else "Unknown",
                to_user_id=str(s.to_user),
                to_user_name=to_user.name if to_user else "Unknown",
                to_upi_id=to_user.upi_id if to_user else None,
                amount=round(float(s.amount), 2),
                status=status_value,
                razorpay_order_id=s.razorpay_order_id,
                created_at=s.confirmed_at or s.created_at,
            )
        )
    return result
