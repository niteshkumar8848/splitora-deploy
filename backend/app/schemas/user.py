from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    upi_id: Optional[str] = None


class UserOut(BaseModel):
    id: UUID
    name: str
    email: EmailStr
    phone: str
    upi_id: Optional[str] = None
    profile_image_url: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserProfileUpdate(BaseModel):
    name: str
    phone: str
    upi_id: Optional[str] = None
    profile_image_url: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
