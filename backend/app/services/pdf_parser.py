import io
import re
from datetime import datetime

import pdfplumber


def parse_gpay_statement(pdf_bytes: bytes) -> list:
    """
    Parses a Google Pay transaction PDF statement.
    Extracts ONLY sent (Paid to) transactions.
    Ignores all received transactions.

    Returns list of:
    {
      "date": "2026-02-04",        (ISO format YYYY-MM-DD)
      "time": "07:26 PM",
      "recipient": "MR FITNESS",
      "amount": 2000.0,            (float, no ₹ symbol)
      "upi_transaction_id": "603587276743",
      "raw_text": "original line from PDF"
    }
    """

    transactions = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = ""
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            full_text += page_text + "\n"

    lines = full_text.split("\n")
    lines = [line.strip() for line in lines if line and line.strip()]

    i = 0
    date_pattern = re.compile(r"(\d{2}\s+\w+,\s+\d{4})")
    time_pattern = re.compile(r"(\d{1,2}:\d{2}\s+[AP]M)")
    paid_to_pattern = re.compile(r"^Paid to\s+(.+)$", re.IGNORECASE)
    upi_pattern = re.compile(r"UPI Transaction ID:\s*(\d+)")
    amount_pattern = re.compile(r"₹([\d,]+)")

    while i < len(lines):
        line = lines[i]

        date_match = date_pattern.search(line)
        if date_match and i + 5 < len(lines):
            raw_date = date_match.group(1)

            try:
                dt = datetime.strptime(raw_date.strip(), "%d %b, %Y")
                iso_date = dt.strftime("%Y-%m-%d")
            except Exception:
                i += 1
                continue

            time_match = time_pattern.search(lines[i + 1])
            if not time_match:
                i += 1
                continue
            tx_time = time_match.group(1)

            direction_line = lines[i + 2]
            paid_match = paid_to_pattern.match(direction_line)

            if not paid_match:
                i += 1
                continue

            recipient = paid_match.group(1).strip()

            bank_keywords = [
                "kalupur",
                "cooperative",
                "bank",
                "hdfc",
                "sbi",
                "icici",
                "axis",
                "kotak",
                "yes bank",
                "paytm bank",
            ]
            if any(kw in recipient.lower() for kw in bank_keywords):
                i += 1
                continue

            upi_id = ""
            amount = 0.0

            for j in range(i + 3, min(i + 8, len(lines))):
                upi_match = upi_pattern.search(lines[j])
                if upi_match:
                    upi_id = upi_match.group(1)

                amount_match = amount_pattern.search(lines[j])
                if amount_match:
                    amount_str = amount_match.group(1)
                    amount = float(amount_str.replace(",", ""))

            if amount > 0:
                transactions.append(
                    {
                        "date": iso_date,
                        "time": tx_time,
                        "recipient": recipient,
                        "amount": amount,
                        "upi_transaction_id": upi_id,
                        "raw_text": direction_line,
                    }
                )

        i += 1

    transactions.sort(key=lambda x: x["date"])
    return transactions


def filter_by_date_range(transactions: list, from_date: str, to_date: str) -> list:
    """
    Filters transactions by date range.
    from_date and to_date are in YYYY-MM-DD format.
    Both dates are inclusive.
    """
    start = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d")

    return [
        t
        for t in transactions
        if start <= datetime.strptime(t["date"], "%Y-%m-%d") <= end
    ]
