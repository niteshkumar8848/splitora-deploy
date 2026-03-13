import math
from typing import Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Expense, GroupMember, User


# Compute fairness score and contribution insights for a group.
def calculate_fairness(group_id, db: Session) -> Dict:
    members = (
        db.query(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .filter(GroupMember.group_id == group_id)
        .all()
    )
    member_count = len(members)
    if member_count == 0:
        return {"score": 0.0, "label": "Poor", "members": [], "next_payer_suggestion": "N/A"}

    paid_map = {
        str(user_id): round(float(total or 0.0), 2)
        for user_id, total in (
            db.query(Expense.paid_by, func.sum(Expense.total_amount))
            .filter(Expense.group_id == group_id, Expense.is_reversal.is_(False))
            .group_by(Expense.paid_by)
            .all()
        )
    }
    total_spent = round(sum(paid_map.values()), 2)
    expected_pct = round(100.0 / member_count, 2)

    contribution_values: List[float] = []
    member_rows: List[Dict] = []

    for member in members:
        paid_amount = paid_map.get(str(member.id), 0.0)
        paid_pct = round((paid_amount / total_spent) * 100.0, 2) if total_spent > 0 else 0.0
        deviation = round(paid_pct - expected_pct, 2)
        suggestion = "Well balanced" if abs(deviation) <= 5 else "Pay next expense" if deviation < 0 else "Skip next expense"

        contribution_values.append(paid_pct)
        member_rows.append(
            {
                "user_id": str(member.id),
                "name": member.name,
                "paid_percentage": paid_pct,
                "expected_percentage": expected_pct,
                "deviation": deviation,
                "suggestion": suggestion,
                "paid_amount": paid_amount,
            }
        )

    mean_val = sum(contribution_values) / member_count
    variance = sum((val - mean_val) ** 2 for val in contribution_values) / member_count
    deviation_std = math.sqrt(variance)
    score = round(max(0.0, 100.0 - (deviation_std * 2.0)), 2)

    if score > 80:
        label = "Excellent"
    elif score >= 60:
        label = "Good"
    elif score >= 40:
        label = "Fair"
    else:
        label = "Poor"

    next_payer = min(member_rows, key=lambda item: item["paid_percentage"]) if member_rows else None

    for item in member_rows:
        item.pop("paid_amount", None)

    return {
        "score": score,
        "label": label,
        "members": member_rows,
        "next_payer_suggestion": next_payer["name"] if next_payer else "N/A",
    }
