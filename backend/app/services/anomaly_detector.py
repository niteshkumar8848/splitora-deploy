from collections import defaultdict
from datetime import timedelta
from typing import Dict, List

from sqlalchemy.orm import Session

from app.models.models import Expense


# Flag unusual expenses based on category deviation and burst activity.
def detect(group_id, db: Session) -> List[Dict]:
    expenses = (
        db.query(Expense)
        .filter(Expense.group_id == group_id)
        .order_by(Expense.created_at.asc())
        .all()
    )
    active_expenses = [item for item in expenses if not item.is_reversal]
    if not active_expenses:
        return []

    category_totals = defaultdict(float)
    category_counts = defaultdict(int)
    for item in active_expenses:
        category_totals[item.category] += float(item.total_amount)
        category_counts[item.category] += 1

    category_avg = {
        cat: round(category_totals[cat] / category_counts[cat], 2) for cat in category_totals
    }

    anomalies: List[Dict] = []

    for item in active_expenses:
        avg = category_avg.get(item.category, 0.0)
        amount = round(float(item.total_amount), 2)
        if avg > 0 and amount > round(avg * 2.5, 2):
            deviation_pct = round(((amount - avg) / avg) * 100.0, 2)
            severity = "HIGH" if deviation_pct >= 250 else "MEDIUM" if deviation_pct >= 150 else "LOW"
            anomalies.append(
                {
                    "expense_id": str(item.id),
                    "title": item.title,
                    "amount": amount,
                    "category_average": avg,
                    "deviation_percentage": deviation_pct,
                    "reason": f"{deviation_pct:.0f}% above average for {item.category}",
                    "severity": severity,
                }
            )

    by_user: Dict[str, List[Expense]] = defaultdict(list)
    for item in active_expenses:
        by_user[str(item.paid_by)].append(item)

    seen_burst_ids = set()
    for user_expenses in by_user.values():
        for idx, item in enumerate(user_expenses):
            window_count = 1
            for jdx in range(idx + 1, len(user_expenses)):
                if user_expenses[jdx].created_at - item.created_at <= timedelta(hours=1):
                    window_count += 1
                else:
                    break
            if window_count >= 3:
                for k in range(idx, idx + window_count):
                    target = user_expenses[k]
                    if str(target.id) in seen_burst_ids:
                        continue
                    seen_burst_ids.add(str(target.id))
                    anomalies.append(
                        {
                            "expense_id": str(target.id),
                            "title": target.title,
                            "amount": round(float(target.total_amount), 2),
                            "category_average": category_avg.get(target.category, 0.0),
                            "deviation_percentage": 0.0,
                            "reason": "3+ expenses added by same person within 1 hour",
                            "severity": "MEDIUM",
                        }
                    )

    return anomalies


# Backward-compatible alias for anomaly detection.
def detect_anomalies(group_id, db: Session) -> List[Dict]:
    return detect(group_id, db)
