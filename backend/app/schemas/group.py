from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    budget: Optional[float] = None


class GroupOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    invite_code: str
    member_count: int
    my_balance: float
    budget: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class JoinGroupRequest(BaseModel):
    invite_code: str
