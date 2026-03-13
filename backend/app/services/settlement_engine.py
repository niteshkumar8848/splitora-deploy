from typing import Dict, List, Tuple


# Compute minimum transfers required to settle all balances.
def min_cash_flow(balances: Dict[str, float]) -> List[Tuple[str, str, float]]:
    transactions: List[Tuple[str, str, float]] = []
    normalized = {k: round(v, 2) for k, v in balances.items()}

    while True:
        non_zero = {k: v for k, v in normalized.items() if abs(v) > 0.01}
        if not non_zero:
            break

        creditor = max(non_zero, key=non_zero.get)
        debtor = min(non_zero, key=non_zero.get)
        settle = round(min(non_zero[creditor], abs(non_zero[debtor])), 2)

        transactions.append((debtor, creditor, settle))
        normalized[creditor] = round(normalized[creditor] - settle, 2)
        normalized[debtor] = round(normalized[debtor] + settle, 2)

    return transactions
