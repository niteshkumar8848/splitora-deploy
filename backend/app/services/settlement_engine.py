from typing import Dict, List


def net_mutual_debts(
    balances: Dict[str, float]
) -> Dict[str, float]:
    """
    Phase 1: No-op on net balance dicts.
    Net balances are already simplified -
    each person is either creditor OR debtor.
    True mutual debts cannot exist in a net dict.
    Returns balances unchanged.
    """
    return dict(balances)


def greedy_min_cash_flow(
    balances: Dict[str, float]
) -> List[dict]:
    """
    Phase 2: Greedy minimum cash flow.
    Repeatedly matches largest creditor with
    largest debtor until all balances = zero.
    Guarantees at most N-1 transactions for N people.
    """
    transactions = []
    working = {
        k: round(v, 2)
        for k, v in balances.items()
    }

    while True:
        active = {
            k: v for k, v in working.items()
            if abs(v) > 0.01
        }
        if not active:
            break

        creditor = max(active, key=active.get)
        debtor = min(active, key=active.get)

        if active[creditor] <= 0 or active[debtor] >= 0:
            break

        amount = round(
            min(active[creditor], abs(active[debtor])),
            2
        )

        transactions.append({
            "from_user_id": debtor,
            "to_user_id": creditor,
            "amount": amount
        })

        working[creditor] = round(
            working[creditor] - amount, 2
        )
        working[debtor] = round(
            working[debtor] + amount, 2
        )

    return transactions


def combined_settlement(
    balances: Dict[str, float]
) -> dict:
    """
    Main function. Runs Phase 1 then Phase 2.
    Returns transactions + optimization stats.
    """
    working = {
        k: round(v, 2)
        for k, v in balances.items()
    }

    debtors_before = sum(
        1 for v in working.values() if v < -0.01
    )
    without_opt = debtors_before
    after_p1 = net_mutual_debts(working)
    debtors_after_p1 = sum(
        1 for v in after_p1.values() if v < -0.01
    )
    phase1_eliminated = debtors_before - debtors_after_p1

    transactions = greedy_min_cash_flow(after_p1)
    count = len(transactions)

    reduction = round(
        (1 - count / max(without_opt, 1)) * 100, 1
    ) if without_opt > 0 else 0.0

    return {
        "transactions": transactions,
        "count": count,
        "without_optimization": without_opt,
        "reduction_percentage": max(0.0, reduction),
        "phase1_eliminated": phase1_eliminated,
        "phase2_resolved": count
    }


def min_cash_flow(balances: dict) -> list:
    """Legacy alias for backward compatibility."""
    result = combined_settlement(balances)
    return [
        (t["from_user_id"], t["to_user_id"], t["amount"])
        for t in result["transactions"]
    ]
