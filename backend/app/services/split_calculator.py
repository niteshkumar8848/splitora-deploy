from typing import Dict, List


# Calculate participant splits based on equal, percentage, or custom mode.
def calculate_splits(total_amount: float, split_type: str, participants: List[str], custom_data: List[Dict]) -> List[Dict]:
    total_amount = round(float(total_amount), 2)
    if total_amount <= 0:
        raise ValueError("Total amount must be greater than 0")
    if not participants:
        raise ValueError("At least one participant is required")

    mode = split_type.upper()
    result = []

    if mode == "EQUAL":
        base = round(total_amount / len(participants), 2)
        remainder = round(total_amount - (base * len(participants)), 2)
        for idx, user_id in enumerate(participants):
            share = base + (remainder if idx == 0 else 0)
            result.append({"user_id": user_id, "share_amount": round(share, 2)})

    elif mode == "PERCENTAGE":
        if len(custom_data) != len(participants):
            raise ValueError("Percentage data is required for each participant")
        pct_sum = round(sum(float(item.get("percentage", 0)) for item in custom_data), 2)
        if abs(pct_sum - 100.0) > 0.01:
            raise ValueError("Percentage split must total 100")

        running = 0.0
        for idx, item in enumerate(custom_data):
            user_id = item["user_id"]
            pct = float(item["percentage"])
            if idx == len(custom_data) - 1:
                share = round(total_amount - running, 2)
            else:
                share = round((total_amount * pct) / 100.0, 2)
                running = round(running + share, 2)
            result.append({"user_id": user_id, "share_amount": share})

    elif mode == "CUSTOM":
        if len(custom_data) != len(participants):
            raise ValueError("Custom split amounts are required for each participant")
        amount_sum = round(sum(float(item.get("share_amount", 0)) for item in custom_data), 2)
        if abs(amount_sum - total_amount) > 0.01:
            raise ValueError("Custom split must sum to total amount")
        for item in custom_data:
            result.append({"user_id": item["user_id"], "share_amount": round(float(item["share_amount"]), 2)})

    else:
        raise ValueError("Invalid split type")

    fixed_total = round(sum(item["share_amount"] for item in result), 2)
    if abs(fixed_total - total_amount) > 0.01:
        raise ValueError("Calculated splits do not match total amount")
    return result
