from datetime import datetime
from typing import List
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SplitItem(BaseModel):
    user_id: UUID
    share_amount: float


class ExpenseCreate(BaseModel):
    title: str
    total_amount: float
    split_type: str
    paid_by: UUID
    category: str = "Other"
    splits: List[SplitItem]


class SplitItemOut(BaseModel):
    user_id: UUID
    user_name: str
    share_amount: float

    model_config = ConfigDict(from_attributes=True)


class ExpenseOut(BaseModel):
    id: UUID
    title: str
    total_amount: float
    split_type: str
    paid_by_name: str
    category: str
    is_reversal: bool
    created_at: datetime
    splits: List[SplitItemOut]

    model_config = ConfigDict(from_attributes=True)
