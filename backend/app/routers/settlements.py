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

    # Apply already confirmed settlements so paid items do not reappear
    # in pending suggestions.
    confirmed_settlements = (
        db.query(
            Settlement.from_user,
            Settlement.to_user,
            func.coalesce(func.sum(Settlement.amount), 0.0),
        )
        .filter(
            Settlement.group_id == group_id,
            Settlement.status == "CONFIRMED",
        )
        .group_by(Settlement.from_user, Settlement.to_user)
        .all()
    )
    for from_user, to_user, amount in confirmed_settlements:
        amount_value = round(float(amount or 0.0), 2)
        from_key = str(from_user)
        to_key = str(to_user)
        balances[from_key] = round(float(balances.get(from_key, 0.0)) + amount_value, 2)
        balances[to_key] = round(float(balances.get(to_key, 0.0)) - amount_value, 2)

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


@router.post("/settlements/{settlement_id}/confirm-manual")
def confirm_settlement_manually(
    settlement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manually confirms a settlement after payment
    via static Razorpay link.
    Used when dynamic checkout is not available.
    Updates settlement status to CONFIRMED.
    """

    # Find the settlement.
    settlement = db.query(Settlement).filter(Settlement.id == settlement_id).first()

    if not settlement:
        raise HTTPException(404, "Settlement not found")

    # Verify current user is the one paying.
    if str(settlement.from_user) != str(current_user.id):
        raise HTTPException(403, "Only the payer can confirm this settlement")

    # Verify payer still belongs to this group.
    member = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == settlement.group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(403, "Not a group member")

    # Only pending settlements can be confirmed manually.
    current_status = settlement.status.value if hasattr(settlement.status, "value") else str(settlement.status)
    if current_status == "CONFIRMED":
        raise HTTPException(400, "Settlement already confirmed")
    if current_status != "PENDING":
        raise HTTPException(400, f"Cannot confirm settlement in {current_status} state")

    # Update to CONFIRMED.
    settlement.status = "CONFIRMED"
    settlement.confirmed_at = datetime.utcnow()
    settlement.razorpay_payment_id = f"manual_{settlement_id[:8]}"

    db.commit()
    db.refresh(settlement)

    # Get user names for response.
    from_user = db.query(User).filter(User.id == settlement.from_user).first()
    to_user = db.query(User).filter(User.id == settlement.to_user).first()

    return {
        "id": str(settlement.id),
        "status": "CONFIRMED",
        "amount": settlement.amount,
        "from_user_name": from_user.name if from_user else "",
        "to_user_name": to_user.name if to_user else "",
        "confirmed_at": settlement.confirmed_at.isoformat() if settlement.confirmed_at else None,
        "message": f"Settlement of ₹{float(settlement.amount):.2f} confirmed successfully!",
    }


@router.post("/settlements/create-with-link")
def create_settlement_with_static_link(
    data: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a settlement record and returns the
    static Razorpay payment link for testing.
    No dynamic order creation needed.
    """

    # Verify from_user is current user.
    if data.from_user_id != str(current_user.id):
        raise HTTPException(403, "Can only create settlement for yourself")

    if str(data.from_user_id) == str(data.to_user_id):
        raise HTTPException(400, "Payer and receiver cannot be the same")

    amount_value = round(float(data.amount or 0), 2)
    if amount_value <= 0:
        raise HTTPException(400, "Amount must be greater than 0")

    # Ensure group exists.
    group = db.query(Group).filter(Group.id == data.group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")

    # Ensure both payer and receiver belong to group.
    payer_member = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == data.group_id, GroupMember.user_id == data.from_user_id)
        .first()
    )
    receiver_member = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == data.group_id, GroupMember.user_id == data.to_user_id)
        .first()
    )
    if not payer_member or not receiver_member:
        raise HTTPException(400, "Both users must be members of the group")

    # Create settlement with PENDING status.
    settlement = Settlement(
        id=str(uuid.uuid4()),
        group_id=data.group_id,
        from_user=data.from_user_id,
        to_user=data.to_user_id,
        amount=amount_value,
        status="PENDING",
        created_at=datetime.utcnow(),
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)

    return {
        "settlement_id": str(settlement.id),
        "amount": settlement.amount,
        "status": "PENDING",
        "payment_link": "https://rzp.io/rzp/WJbwPea",
        "message": f"Pay ₹{float(settlement.amount):.2f} using the payment link. Come back after payment to confirm.",
    }
