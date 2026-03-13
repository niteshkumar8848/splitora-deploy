import hashlib
import hmac
import json
import os
from datetime import datetime

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Settlement, SettlementStatus

load_dotenv()

router = APIRouter()


# Verify Razorpay webhook signature and update settlement state.
@router.post("/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(default=""),
    db: Session = Depends(get_db),
):
    webhook_secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Webhook secret not configured")

    body = await request.body()
    expected = hmac.new(webhook_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    event = payload.get("event")
    if event == "payment.captured":
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = entity.get("order_id")
        payment_id = entity.get("id")
        if order_id:
            settlement = db.query(Settlement).filter(Settlement.razorpay_order_id == order_id).first()
            if settlement:
                settlement.status = SettlementStatus.CONFIRMED
                settlement.razorpay_payment_id = payment_id
                settlement.confirmed_at = datetime.utcnow()
                db.commit()

    return {"status": "ok"}
