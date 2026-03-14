from collections import defaultdict
from typing import Dict, List, Tuple


# Phase 1: safely cancel only exact opposite balances that net to zero.
def net_mutual_debts(balances: Dict[str, float]) -> Dict[str, float]:
    """
    PHASE 1: Cancel mutual debts between any two people.
    If A owes B and B owes A, net them into one direction.
    Modifies and returns the balances dict.
    """
    users = list(balances.keys())
    used = set()
    for i in range(len(users)):
        if users[i] in used:
            continue
        for j in range(i + 1, len(users)):
            if users[j] in used:
                continue
            a = users[i]
            b = users[j]
            bal_a = round(float(balances.get(a, 0.0)), 2)
            bal_b = round(float(balances.get(b, 0.0)), 2)

            # Exact opposite balances can be cancelled safely.
            if bal_a * bal_b < 0 and abs(bal_a + bal_b) < 0.01:
                balances[a] = 0.0
                balances[b] = 0.0
                used.add(a)
                used.add(b)
                break
    return balances


# Phase 2: greedily match max creditor with max debtor until settled.
def greedy_min_cash_flow(balances: Dict[str, float]) -> List[dict]:
    """
    PHASE 2: Greedy algorithm to settle remaining balances.
    Repeatedly matches largest creditor with largest debtor.
    Returns list of transaction dicts.
    """
    transactions = []

    while True:
        # Get all non-zero balances.
        active = {k: v for k, v in balances.items() if abs(v) > 0.01}
        if not active:
            break

        # Find biggest creditor and biggest debtor.
        creditor = max(active, key=active.get)
        debtor = min(active, key=active.get)

        # Stop if no valid creditor-debtor pair.
        if active[creditor] <= 0 or active[debtor] >= 0:
            break

        # Settle the minimum of the two.
        amount = round(min(active[creditor], abs(active[debtor])), 2)

        transactions.append(
            {
                "from_user_id": debtor,
                "to_user_id": creditor,
                "amount": amount,
            }
        )

        # Update balances.
        balances[creditor] = round(balances[creditor] - amount, 2)
        balances[debtor] = round(balances[debtor] + amount, 2)

    return transactions


# Run the combined algorithm and return full optimization stats.
def combined_settlement(balances: Dict[str, float]) -> dict:
    """
    MAIN FUNCTION — runs Phase 1 then Phase 2.

    Input:
      balances = {user_id: net_balance}
      positive balance = creditor (owed money)
      negative balance = debtor (owes money)

    Output:
      {
        "transactions": [...],
        "count": int,
        "without_optimization": int,
        "reduction_percentage": float,
        "phase1_eliminated": int,
        "phase2_resolved": int
      }
    """

    # Deep copy so we don't modify the original.
    working = {k: round(v, 2) for k, v in balances.items()}

    # Count non-zero balances before (for stats).
    non_zero_before = sum(1 for v in working.values() if abs(v) > 0.01)
    # Theoretical max transactions without optimization = number of debtors.
    debtors_count = sum(1 for v in working.values() if v < -0.01)
    without_optimization = debtors_count

    # Phase 1: net mutual debts.
    working = net_mutual_debts(working)
    non_zero_after_phase1 = sum(1 for v in working.values() if abs(v) > 0.01)
    phase1_eliminated = non_zero_before - non_zero_after_phase1

    # Phase 2: greedy min cash flow.
    transactions = greedy_min_cash_flow(working)

    # Calculate reduction stats.
    count = len(transactions)
    reduction = round((1 - count / max(without_optimization, 1)) * 100, 1) if without_optimization > 0 else 0.0

    return {
        "transactions": transactions,
        "count": count,
        "without_optimization": without_optimization,
        "reduction_percentage": max(0.0, reduction),
        "phase1_eliminated": phase1_eliminated,
        "phase2_resolved": count,
    }


# Backward-compatible alias for old callers expecting tuple rows.
def min_cash_flow(balances: dict) -> list:
    """
    Legacy wrapper — calls combined_settlement.
    Returns just the transactions list.
    """
    result = combined_settlement(balances)
    return [(t["from_user_id"], t["to_user_id"], t["amount"]) for t in result["transactions"]]
