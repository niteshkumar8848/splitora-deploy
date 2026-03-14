from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


# Represents a member-wise share entry for split calculations.
class SplitItem(BaseModel):
    user_id: str
    share_amount: float


# Payload used to create a settlement payment intent.
class SettlementCreate(BaseModel):
    group_id: str
    from_user_id: str
    to_user_id: str
    amount: float


# Response schema for persisted settlement records.
class SettlementOut(BaseModel):
    id: str
    from_user_id: str
    from_user_name: str
    to_user_id: str
    to_user_name: str
    to_upi_id: Optional[str]
    amount: float
    status: str
    razorpay_order_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# Represents one optimized settlement suggestion row.
class SettlementSuggestion(BaseModel):
    from_user_id: str
    from_user_name: str
    to_user_id: str
    to_user_name: str
    to_upi_id: Optional[str]
    amount: float


# Carries detailed optimization breakdown for combined algorithm output.
class OptimizationStats(BaseModel):
    without_optimization: int
    with_optimization: int
    reduction_percentage: float
    phase1_eliminated: int
    phase2_resolved: int
    algorithm_used: str


# Full response for optimized settlement suggestion endpoint.
class SuggestedSettlementsResponse(BaseModel):
    suggestions: List[SettlementSuggestion]
    stats: OptimizationStats
    message: str
