from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SettlementCreate(BaseModel):
    group_id: UUID
    from_user_id: UUID
    to_user_id: UUID
    amount: float


class SettlementOut(BaseModel):
    id: UUID
    from_user_name: str
    to_user_name: str
    to_upi_id: Optional[str] = None
    amount: float
    status: str
    razorpay_order_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SettlementSuggestion(BaseModel):
    from_user_id: UUID
    from_user_name: str
    to_user_id: UUID
    to_user_name: str
    to_upi_id: Optional[str] = None
    amount: float
