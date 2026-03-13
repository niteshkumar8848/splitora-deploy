import secrets
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.models import Group, GroupMember, User
from app.schemas.group import GroupCreate, GroupOut, JoinGroupRequest
from app.schemas.user import UserOut
from app.services.balance_engine import calculate_user_balances_for_groups

router = APIRouter()


# Check whether a user is a member of a group.
def _is_group_member(db: Session, group_id: UUID, user_id: UUID) -> bool:
    return (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        .first()
        is not None
    )


# Create a new expense group and add creator as first member.
@router.post("", response_model=GroupOut)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite_code = secrets.token_urlsafe(6).upper()[:20]
    while db.query(Group).filter(Group.invite_code == invite_code).first():
        invite_code = secrets.token_urlsafe(6).upper()[:20]

    group = Group(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        created_by=current_user.id,
        invite_code=invite_code,
        budget=round(payload.budget, 2) if payload.budget is not None else None,
    )
    db.add(group)
    db.flush()

    db.add(GroupMember(group_id=group.id, user_id=current_user.id))
    db.commit()
    db.refresh(group)

    return GroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        invite_code=group.invite_code,
        member_count=1,
        my_balance=0.0,
        budget=group.budget,
        created_at=group.created_at,
    )


# Join a group using an invite code.
@router.post("/join")
def join_group(
    payload: JoinGroupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = db.query(Group).filter(Group.invite_code == payload.invite_code.strip().upper()).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if _is_group_member(db, group.id, current_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already joined this group")

    db.add(GroupMember(group_id=group.id, user_id=current_user.id))
    db.commit()
    return {"message": "Joined successfully"}


# List all groups the current user belongs to with balances.
@router.get("", response_model=List[GroupOut])
def list_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    memberships = db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    group_ids = [item.group_id for item in memberships]
    if not group_ids:
        return []

    groups = db.query(Group).filter(Group.id.in_(group_ids)).order_by(Group.created_at.desc()).all()
    member_count_rows = (
        db.query(GroupMember.group_id, func.count(GroupMember.user_id))
        .filter(GroupMember.group_id.in_(group_ids))
        .group_by(GroupMember.group_id)
        .all()
    )
    member_count_map = {str(group_id): int(count) for group_id, count in member_count_rows}
    my_balance_map = calculate_user_balances_for_groups(
        db,
        current_user.id,
        group_ids,
        paid_non_reversal_only=False,
    )

    output: List[GroupOut] = []
    for group in groups:
        output.append(
            GroupOut(
                id=group.id,
                name=group.name,
                description=group.description,
                invite_code=group.invite_code,
                member_count=member_count_map.get(str(group.id), 0),
                my_balance=my_balance_map.get(str(group.id), 0.0),
                budget=group.budget,
                created_at=group.created_at,
            )
        )
    return output


# List all members for a group if requester is part of the group.
@router.get("/{group_id}/members", response_model=List[UserOut])
def list_members(
    group_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_group_member(db, group_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")

    members = (
        db.query(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .filter(GroupMember.group_id == group_id)
        .order_by(User.name.asc())
        .all()
    )
    return members
