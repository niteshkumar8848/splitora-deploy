import io
import re
from datetime import datetime
from typing import List

import pdfplumber


def parse_gpay_statement(pdf_bytes: bytes) -> List[dict]:
    """
    Parses Google Pay PDF statement.
    Extracts ONLY 'Paid to' (sent) transactions.
    Ignores 'Received from' transactions.

    GPay PDF actual format per transaction (ONE LINE):
    "04 Feb, 2026 07:26 PM Paid to MR FITNESS ₹2,000"
    Followed by:
    "UPI Transaction ID: 603587276743"
    Followed by:
    "Paid by The Kalupur Commercial Cooperative Bank Ltd"

    Returns list of:
    {
        "date": "2026-02-04",
        "time": "07:26 PM",
        "recipient": "MR FITNESS",
        "amount": 2000.0,
        "upi_transaction_id": "603587276743",
        "raw_text": "04 Feb, 2026 07:26 PM Paid to MR FITNESS ₹2,000"
    }
    """

    transactions = []

    # Step 1: Extract all text from all PDF pages
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            all_lines = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    for line in text.split("\n"):
                        stripped = line.strip()
                        if stripped:
                            all_lines.append(stripped)
    except Exception as e:
        raise ValueError(f"Cannot read PDF: {str(e)}")

    if not all_lines:
        raise ValueError("PDF appears to be empty or unreadable")

    # Step 2: Regex to match SENT transaction lines
    # Pattern matches: "04 Feb, 2026 07:26 PM Paid to NAME ₹2,000"
    # The ₹ symbol is Unicode \u20b9 — use both forms
    sent_pattern = re.compile(
        r"(\d{1,2}\s+\w{3},\s+\d{4})"  # date: "04 Feb, 2026"
        r"\s+"
        r"(\d{1,2}:\d{2}\s+[AP]M)"  # time: "07:26 PM"
        r"\s+"
        r"Paid to\s+"  # direction: "Paid to "
        r"(.+?)"  # recipient name (lazy)
        r"\s+[₹\u20b9]([\d,]+)"  # amount: "₹2,000"
        r"\s*$",  # end of line
        re.IGNORECASE,
    )

    # UPI ID pattern for the line after a transaction
    upi_pattern = re.compile(r"UPI Transaction ID[:\s]+(\d+)", re.IGNORECASE)

    # Bank keywords to skip (internal transfers)
    bank_keywords = [
        "kalupur",
        "cooperative",
        "bank",
        "hdfc",
        "sbi",
        "icici",
        "axis",
        "kotak",
        "paytm",
        "yes bank",
        "nsdl",
        "ppi",
        "wallet",
        "airtel",
        "jio",
        "fino",
        "equitas",
    ]

    # Step 3: Process each line
    for i, line in enumerate(all_lines):
        match = sent_pattern.search(line)
        if not match:
            continue

        raw_date = match.group(1).strip()
        raw_time = match.group(2).strip()
        recipient = match.group(3).strip()
        raw_amount = match.group(4).strip()

        # Skip bank/internal transfers
        recipient_lower = recipient.lower()
        if any(kw in recipient_lower for kw in bank_keywords):
            continue

        # Convert date to ISO format
        try:
            # Handle both "4 Feb, 2026" and "04 Feb, 2026"
            # Normalize spaces in date
            normalized_date = re.sub(r"\s+", " ", raw_date)
            dt = datetime.strptime(normalized_date, "%d %b, %Y")
            iso_date = dt.strftime("%Y-%m-%d")
        except ValueError:
            try:
                # Try alternative format
                dt = datetime.strptime(raw_date, "%d %b, %Y")
                iso_date = dt.strftime("%Y-%m-%d")
            except ValueError:
                continue  # Skip if date cannot be parsed

        # Convert amount to float
        try:
            amount = float(raw_amount.replace(",", ""))
        except ValueError:
            continue  # Skip if amount cannot be parsed

        # Skip zero or negative amounts
        if amount <= 0:
            continue

        # Look for UPI Transaction ID on next 1-2 lines
        upi_id = ""
        for j in range(i + 1, min(i + 3, len(all_lines))):
            upi_match = upi_pattern.search(all_lines[j])
            if upi_match:
                upi_id = upi_match.group(1).strip()
                break

        # Use UPI ID as unique key, fallback to index
        unique_key = upi_id if upi_id else f"{iso_date}_{i}"

        transactions.append(
            {
                "date": iso_date,
                "time": raw_time,
                "recipient": recipient,
                "amount": amount,
                "upi_transaction_id": unique_key,
                "raw_text": line,
            }
        )

    # Step 4: Remove duplicates by UPI ID
    seen_upi = set()
    unique_transactions = []
    for txn in transactions:
        key = txn["upi_transaction_id"]
        if key not in seen_upi:
            seen_upi.add(key)
            unique_transactions.append(txn)

    # Step 5: Sort by date ascending
    unique_transactions.sort(key=lambda x: x["date"])

    return unique_transactions


def filter_by_date_range(
    transactions: List[dict],
    from_date: str,
    to_date: str,
) -> List[dict]:
    """
    Filters transactions to a date range.
    Both from_date and to_date are inclusive.
    Format: YYYY-MM-DD
    """
    try:
        start = datetime.strptime(from_date, "%Y-%m-%d")
        end = datetime.strptime(to_date, "%Y-%m-%d")
    except ValueError:
        return transactions  # Return all if dates invalid

    return [
        t
        for t in transactions
        if start <= datetime.strptime(t["date"], "%Y-%m-%d") <= end
    ]
