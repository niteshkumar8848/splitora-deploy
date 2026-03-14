from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.models import (
    Expense,
    ExpenseSplit,
    Group,
    GroupMember,
    Settlement,
    User,
)
from app.schemas.settlement import (
    OptimizationStats,
    SettlementCreate,
    SettlementOut,
    SettlementSuggestion,
    SuggestedSettlementsResponse,
)
from app.services.settlement_engine import combined_settlement

router = APIRouter()


def get_net_balances(
    group_id: str,
    db: Session
) -> dict:
    """
    Calculates net balance for every group member.
    balance = total_paid - total_share_owed
    positive = creditor, negative = debtor
    EXCLUDES already confirmed settlements from balance.
    """
    members = db.query(GroupMember).filter(
        GroupMember.group_id == group_id
    ).all()

    balances = {}
    for member in members:
        uid = member.user_id

        paid = db.query(
            func.sum(Expense.total_amount)
        ).filter(
            Expense.group_id == group_id,
            Expense.paid_by == uid,
            Expense.is_reversal == False
        ).scalar() or 0.0

        owed = db.query(
            func.sum(ExpenseSplit.share_amount)
        ).join(
            Expense,
            ExpenseSplit.expense_id == Expense.id
        ).filter(
            Expense.group_id == group_id,
            ExpenseSplit.user_id == uid
        ).scalar() or 0.0

        settled_paid = db.query(
            func.sum(Settlement.amount)
        ).filter(
            Settlement.group_id == group_id,
            Settlement.from_user == uid,
            Settlement.status == "CONFIRMED"
        ).scalar() or 0.0

        settled_received = db.query(
            func.sum(Settlement.amount)
        ).filter(
            Settlement.group_id == group_id,
            Settlement.to_user == uid,
            Settlement.status == "CONFIRMED"
        ).scalar() or 0.0

        raw_balance = round(paid - owed, 2)
        net_balance = round(
            raw_balance + settled_paid - settled_received,
            2
        )
        balances[str(uid)] = net_balance

    return balances


@router.get(
    "/groups/{group_id}/settlements/suggested",
    response_model=SuggestedSettlementsResponse
)
def get_suggested_settlements(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns optimized settlement suggestions.
    Uses Combined Mutual Netting + Greedy MCF.
    Accounts for already confirmed settlements.
    """
    member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(403, "Not a group member")

    balances = get_net_balances(group_id, db)

    if all(abs(v) <= 0.01 for v in balances.values()):
        return SuggestedSettlementsResponse(
            suggestions=[],
            stats=OptimizationStats(
                without_optimization=0,
                with_optimization=0,
                reduction_percentage=0.0,
                phase1_eliminated=0,
                phase2_resolved=0,
                algorithm_used=(
                    "Combined: Mutual Netting + Greedy MCF"
                )
            ),
            message="All settled up! No pending payments."
        )

    result = combined_settlement(balances)

    suggestions = []
    for txn in result["transactions"]:
        from_user = db.query(User).filter(
            User.id == txn["from_user_id"]
        ).first()
        to_user = db.query(User).filter(
            User.id == txn["to_user_id"]
        ).first()
        if from_user and to_user:
            suggestions.append(SettlementSuggestion(
                from_user_id=txn["from_user_id"],
                from_user_name=from_user.name,
                to_user_id=txn["to_user_id"],
                to_user_name=to_user.name,
                to_upi_id=to_user.upi_id,
                amount=txn["amount"]
            ))

    stats = OptimizationStats(
        without_optimization=result["without_optimization"],
        with_optimization=result["count"],
        reduction_percentage=result["reduction_percentage"],
        phase1_eliminated=result["phase1_eliminated"],
        phase2_resolved=result["phase2_resolved"],
        algorithm_used=(
            "Combined: Mutual Netting + Greedy MCF"
        )
    )

    saved = (
        result["without_optimization"] - result["count"]
    )
    message = (
        f"Optimized {result['without_optimization']} "
        f"debt(s) into {result['count']} transaction(s). "
        f"You save {saved} unnecessary payment(s)."
        if result["count"] > 0
        else "All settled up!"
    )

    return SuggestedSettlementsResponse(
        suggestions=suggestions,
        stats=stats,
        message=message
    )


@router.post("/settlements/create-with-link")
def create_settlement_with_link(
    data: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Creates a PENDING settlement record and returns
    the static Razorpay payment link.
    """
    if data.from_user_id != str(current_user.id):
        raise HTTPException(
            403, "Can only create for yourself"
        )

    settlement = Settlement(
        id=str(uuid.uuid4()),
        group_id=data.group_id,
        from_user=data.from_user_id,
        to_user=data.to_user_id,
        amount=data.amount,
        status="PENDING",
        created_at=datetime.utcnow()
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)

    return {
        "settlement_id": settlement.id,
        "amount": settlement.amount,
        "status": "PENDING",
        "payment_link": "https://rzp.io/rzp/WJbwPea",
        "message": (
            f"Pay ₹{settlement.amount} via Razorpay"
        )
    }


@router.post(
    "/settlements/{settlement_id}/confirm-manual"
)
def confirm_settlement_manually(
    settlement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Confirms settlement as paid after static
    Razorpay link payment. Updates status to CONFIRMED.
    """
    settlement = db.query(Settlement).filter(
        Settlement.id == settlement_id
    ).first()

    if not settlement:
        raise HTTPException(404, "Settlement not found")

    if str(settlement.from_user) != str(current_user.id):
        raise HTTPException(403, "Only payer can confirm")

    if settlement.status == "CONFIRMED":
        return {
            "id": settlement.id,
            "status": "CONFIRMED",
            "message": "Already confirmed"
        }

    settlement.status = "CONFIRMED"
    settlement.confirmed_at = datetime.utcnow()
    settlement.razorpay_payment_id = (
        f"rzp_static_{settlement_id[:8].upper()}"
    )

    db.commit()
    db.refresh(settlement)

    from_user = db.query(User).filter(
        User.id == settlement.from_user
    ).first()
    to_user = db.query(User).filter(
        User.id == settlement.to_user
    ).first()

    return {
        "id": settlement.id,
        "status": "CONFIRMED",
        "amount": settlement.amount,
        "from_user_name": from_user.name
        if from_user else "Unknown",
        "to_user_name": to_user.name
        if to_user else "Unknown",
        "confirmed_at": settlement.confirmed_at
        .isoformat(),
        "payment_ref": settlement.razorpay_payment_id,
        "message": (
            f"✅ ₹{settlement.amount} confirmed!"
        )
    }


@router.get(
    "/groups/{group_id}/settlements/history"
)
def get_settlement_history(
    group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns ALL confirmed settlements for a group.
    Shows complete payment history with details.
    """
    member = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == current_user.id
    ).first()
    if not member:
        raise HTTPException(403, "Not a group member")

    settlements = db.query(Settlement).filter(
        Settlement.group_id == group_id,
        Settlement.status == "CONFIRMED"
    ).order_by(
        Settlement.confirmed_at.desc()
    ).all()

    history = []
    for s in settlements:
        from_user = db.query(User).filter(
            User.id == s.from_user
        ).first()
        to_user = db.query(User).filter(
            User.id == s.to_user
        ).first()

        history.append({
            "id": s.id,
            "from_user_id": s.from_user,
            "from_user_name": from_user.name
            if from_user else "Unknown",
            "to_user_id": s.to_user,
            "to_user_name": to_user.name
            if to_user else "Unknown",
            "amount": s.amount,
            "status": s.status,
            "payment_ref": s.razorpay_payment_id
            or "-",
            "confirmed_at": s.confirmed_at.isoformat()
            if s.confirmed_at else None,
            "created_at": s.created_at.isoformat()
        })

    total_settled = sum(s["amount"] for s in history)

    total_expenses = db.query(
        func.sum(Expense.total_amount)
    ).filter(
        Expense.group_id == group_id,
        Expense.is_reversal == False
    ).scalar() or 0.0

    return {
        "history": history,
        "total_settled": round(total_settled, 2),
        "total_expenses": round(total_expenses, 2),
        "pending": round(
            total_expenses - total_settled, 2
        ),
        "count": len(history)
    }
