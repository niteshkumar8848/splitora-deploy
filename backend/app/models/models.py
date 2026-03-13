import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class SplitType(str, enum.Enum):
    EQUAL = "EQUAL"
    PERCENTAGE = "PERCENTAGE"
    CUSTOM = "CUSTOM"


class ExpenseStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REVERSED = "REVERSED"


class SettlementStatus(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    upi_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    groups_created = relationship("Group", back_populates="creator")
    group_memberships = relationship("GroupMember", back_populates="user", cascade="all, delete-orphan")
    expenses_paid = relationship("Expense", back_populates="payer", foreign_keys="Expense.paid_by")
    expense_splits = relationship("ExpenseSplit", back_populates="user", cascade="all, delete-orphan")
    settlements_from = relationship("Settlement", back_populates="from_user_ref", foreign_keys="Settlement.from_user")
    settlements_to = relationship("Settlement", back_populates="to_user_ref", foreign_keys="Settlement.to_user")


class Group(Base):
    __tablename__ = "groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    invite_code = Column(String(20), unique=True, nullable=False, index=True)
    budget = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    creator = relationship("User", back_populates="groups_created")
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="group", cascade="all, delete-orphan")
    settlements = relationship("Settlement", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    group = relationship("Group", back_populates="members")
    user = relationship("User", back_populates="group_memberships")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False)
    paid_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    total_amount = Column(Float, nullable=False)
    split_type = Column(Enum(SplitType), nullable=False)
    category = Column(String(50), nullable=False, default="Other")
    is_reversal = Column(Boolean, nullable=False, default=False)
    reversed_by = Column(UUID(as_uuid=True), ForeignKey("expenses.id"), nullable=True)
    status = Column(Enum(ExpenseStatus), nullable=False, default=ExpenseStatus.ACTIVE)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    group = relationship("Group", back_populates="expenses")
    payer = relationship("User", back_populates="expenses_paid", foreign_keys=[paid_by])
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")
    original_expense = relationship("Expense", remote_side=[id], uselist=False)


class ExpenseSplit(Base):
    __tablename__ = "expense_splits"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    share_amount = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    expense = relationship("Expense", back_populates="splits")
    user = relationship("User", back_populates="expense_splits")


class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("groups.id"), nullable=False)
    from_user = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    to_user = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(Enum(SettlementStatus), nullable=False, default=SettlementStatus.PENDING)
    razorpay_order_id = Column(String(100), nullable=True)
    razorpay_payment_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)

    group = relationship("Group", back_populates="settlements")
    from_user_ref = relationship("User", back_populates="settlements_from", foreign_keys=[from_user])
    to_user_ref = relationship("User", back_populates="settlements_to", foreign_keys=[to_user])
