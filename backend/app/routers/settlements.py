import os
from typing import List
from uuid import UUID

import razorpay
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.models import GroupMember, Settlement, SettlementStatus, User
from app.schemas.settlement import SettlementCreate, SettlementOut, SettlementSuggestion
from app.services.balance_engine import calculate_group_balances, get_group_member_ids
from app.services.settlement_engine import min_cash_flow

load_dotenv()

router = APIRouter()


# Assert requester is part of group before settlement operations.
def _assert_member(db: Session, group_id: UUID, user_id: UUID) -> None:
    if not db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id).first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")


# Suggest optimized settlements using minimum cash flow algorithm.
@router.get("/groups/{group_id}/settlements/suggested", response_model=List[SettlementSuggestion])
def suggested_settlements(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_member(db, group_id, current_user.id)
    balances = calculate_group_balances(db, group_id, paid_non_reversal_only=True)
    optimized = min_cash_flow(balances)

    users = {
        str(user.id): user
        for user in (
            db.query(User)
            .join(GroupMember, GroupMember.user_id == User.id)
            .filter(GroupMember.group_id == group_id)
            .all()
        )
    }

    output: List[SettlementSuggestion] = []
    for debtor_id, creditor_id, amount in optimized:
        debtor = users.get(str(debtor_id))
        creditor = users.get(str(creditor_id))
        if debtor and creditor and amount > 0:
            output.append(
                SettlementSuggestion(
                    from_user_id=debtor.id,
                    from_user_name=debtor.name,
                    to_user_id=creditor.id,
                    to_user_name=creditor.name,
                    to_upi_id=creditor.upi_id,
                    amount=round(float(amount), 2),
                )
            )
    return output


# Create a pending settlement and Razorpay order.
@router.post("/settlements", response_model=SettlementOut)
def create_settlement(
    payload: SettlementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group_member_ids = set(get_group_member_ids(db, payload.group_id))
    if str(current_user.id) not in group_member_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")
    if str(payload.from_user_id) not in group_member_ids or str(payload.to_user_id) not in group_member_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Settlement users must be group members")

    if payload.amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount must be greater than zero")
    if payload.from_user_id == payload.to_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sender and receiver cannot be same")

    settlement = Settlement(
        group_id=payload.group_id,
        from_user=payload.from_user_id,
        to_user=payload.to_user_id,
        amount=round(float(payload.amount), 2),
        status=SettlementStatus.PENDING,
    )
    db.add(settlement)
    db.flush()

    key_id = os.getenv("RAZORPAY_KEY_ID", "")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Razorpay keys are not configured")

    client = razorpay.Client(auth=(key_id, key_secret))

    try:
        order = client.order.create(
            {
                "amount": int(round(settlement.amount * 100)),
                "currency": "INR",
                "receipt": f"settle_{settlement.id}",
            }
        )
        settlement.razorpay_order_id = order.get("id")
        db.commit()
        db.refresh(settlement)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Razorpay order creation failed: {str(exc)}")

    parties = db.query(User.id, User.name, User.upi_id).filter(User.id.in_([settlement.from_user, settlement.to_user])).all()
    party_map = {str(user.id): user for user in parties}
    from_user = party_map.get(str(settlement.from_user))
    to_user = party_map.get(str(settlement.to_user))

    return SettlementOut(
        id=settlement.id,
        from_user_name=from_user.name if from_user else "Unknown",
        to_user_name=to_user.name if to_user else "Unknown",
        to_upi_id=to_user.upi_id if to_user else None,
        amount=round(float(settlement.amount), 2),
        status=settlement.status.value,
        razorpay_order_id=settlement.razorpay_order_id,
    )
