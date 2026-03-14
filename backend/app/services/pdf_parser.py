import pdfplumber
import re
import io
from datetime import datetime
from typing import List


def parse_gpay_statement(pdf_bytes: bytes) -> List[dict]:
    """
    Parses Google Pay PDF statement.
    Extracts ONLY sent (Paid to) transactions.
    Handles all possible ₹ symbol encodings.
    """

    transactions = []

    # Step 1: Extract raw text from all pages
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            all_lines = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    for line in text.split('\n'):
                        stripped = line.strip()
                        if stripped:
                            all_lines.append(stripped)
    except Exception as e:
        raise ValueError(f"Cannot read PDF: {str(e)}")

    if not all_lines:
        raise ValueError(
            "PDF appears to be empty or unreadable"
        )

    # ── DEBUG: print first 30 lines to Render logs ──
    # This helps diagnose what the PDF actually contains
    print("=== GPay PDF Parser Debug ===")
    print(f"Total lines extracted: {len(all_lines)}")
    for i, line in enumerate(all_lines[:30]):
        print(f"Line {i:02d}: {repr(line)}")
    print("=== End Debug ===")

    # Step 2: Normalize ₹ symbol variations
    # pdfplumber may extract ₹ as any of these:
    normalized_lines = []
    for line in all_lines:
        normalized = line
        # Replace all known ₹ symbol variants with
        # a standard placeholder "RUPEE"
        normalized = normalized.replace('\u20b9', 'RUPEE')
        normalized = normalized.replace('₹',      'RUPEE')
        normalized = normalized.replace('Rs.',     'RUPEE')
        normalized = normalized.replace('Rs ',     'RUPEE')
        normalized = normalized.replace('INR ',    'RUPEE')
        normalized_lines.append(normalized)

    # Step 3: Try multiple regex strategies
    transactions = _strategy_single_line(
        normalized_lines, all_lines
    )

    if not transactions:
        print("Strategy 1 failed, trying strategy 2...")
        transactions = _strategy_multiline(
            normalized_lines, all_lines
        )

    if not transactions:
        print("Strategy 2 failed, trying strategy 3...")
        transactions = _strategy_flexible(
            normalized_lines, all_lines
        )

    print(f"Total transactions found: {len(transactions)}")

    # Sort by date
    transactions.sort(key=lambda x: x["date"])
    return transactions


def _strategy_single_line(
    normalized_lines: list,
    original_lines: list
) -> list:
    """
    Strategy 1: Each transaction is on ONE line.
    Format: "04 Feb, 2026 07:26 PM Paid to NAME RUPEEAMOUNT"
    This is the most common GPay PDF format.
    """
    transactions = []
    upi_pattern = re.compile(
        r'UPI\s*Transaction\s*ID[:\s]+(\d+)',
        re.IGNORECASE
    )

    # Pattern: date time "Paid to" name amount
    sent_pattern = re.compile(
        r'(\d{1,2}\s+\w{3},?\s+\d{4})'   # date
        r'\s+'
        r'(\d{1,2}:\d{2}\s*[AP]M)'        # time
        r'\s+'
        r'Paid\s+to\s+'                    # "Paid to"
        r'(.+?)'                           # recipient
        r'\s+RUPEE([\d,]+)',               # amount
        re.IGNORECASE
    )

    bank_keywords = [
        "kalupur", "cooperative", "bank", "hdfc",
        "sbi", "icici", "axis", "kotak", "paytm",
        "yes bank", "nsdl", "ppi", "wallet",
        "airtel", "fino", "equitas", "ltd"
    ]

    for i, line in enumerate(normalized_lines):
        match = sent_pattern.search(line)
        if not match:
            continue

        raw_date  = match.group(1).strip()
        raw_time  = match.group(2).strip()
        recipient = match.group(3).strip()
        raw_amt   = match.group(4).strip()

        # Skip bank transfers
        if any(
            kw in recipient.lower()
            for kw in bank_keywords
        ):
            continue

        # Parse date
        iso_date = _parse_date(raw_date)
        if not iso_date:
            continue

        # Parse amount
        try:
            amount = float(raw_amt.replace(",", ""))
        except ValueError:
            continue

        if amount <= 0:
            continue

        # Find UPI ID on next lines
        upi_id = _find_upi_id(
            normalized_lines, i, upi_pattern
        )
        unique_key = upi_id or f"{iso_date}_{i}"

        transactions.append({
            "date":               iso_date,
            "time":               raw_time,
            "recipient":          recipient,
            "amount":             amount,
            "upi_transaction_id": unique_key,
            "raw_text":           original_lines[i]
        })

    return _deduplicate(transactions)


def _strategy_multiline(
    normalized_lines: list,
    original_lines: list
) -> list:
    """
    Strategy 2: Transaction spans multiple lines.
    Line N:   "04 Feb, 2026"
    Line N+1: "07:26 PM"
    Line N+2: "Paid to MR FITNESS"
    Line N+3: "UPI Transaction ID: xxx"
    Line N+4: "Paid by bank..."
    Line N+5: "RUPEE2,000"
    """
    transactions = []
    bank_keywords = [
        "kalupur", "cooperative", "bank", "hdfc",
        "sbi", "icici", "axis", "kotak", "paytm",
        "ltd", "nsdl", "ppi", "wallet"
    ]

    date_pattern = re.compile(
        r'^(\d{1,2}\s+\w{3},?\s+\d{4})$'
    )
    time_pattern = re.compile(
        r'^(\d{1,2}:\d{2}\s*[AP]M)$'
    )
    paid_to_pattern = re.compile(
        r'^Paid\s+to\s+(.+)$',
        re.IGNORECASE
    )
    amount_pattern = re.compile(
        r'^RUPEE([\d,]+)$'
    )
    upi_pattern = re.compile(
        r'UPI\s*Transaction\s*ID[:\s]+(\d+)',
        re.IGNORECASE
    )

    i = 0
    while i < len(normalized_lines):
        line = normalized_lines[i]

        date_match = date_pattern.match(line)
        if not date_match:
            i += 1
            continue

        # Look ahead for time, direction, amount
        if i + 4 >= len(normalized_lines):
            i += 1
            continue

        time_match = time_pattern.match(
            normalized_lines[i + 1]
        )
        if not time_match:
            i += 1
            continue

        paid_match = paid_to_pattern.match(
            normalized_lines[i + 2]
        )
        if not paid_match:
            i += 1
            continue

        recipient = paid_match.group(1).strip()
        if any(
            kw in recipient.lower()
            for kw in bank_keywords
        ):
            i += 1
            continue

        # Find amount in next few lines
        amount    = None
        upi_id    = ""
        for j in range(i + 3, min(i + 8,
                                   len(normalized_lines))):
            upi_m = upi_pattern.search(normalized_lines[j])
            if upi_m:
                upi_id = upi_m.group(1)

            amt_m = amount_pattern.match(normalized_lines[j])
            if amt_m:
                try:
                    amount = float(
                        amt_m.group(1).replace(",", "")
                    )
                except ValueError:
                    pass

        if amount is None or amount <= 0:
            i += 1
            continue

        iso_date = _parse_date(date_match.group(1))
        if not iso_date:
            i += 1
            continue

        unique_key = upi_id or f"{iso_date}_{i}"
        transactions.append({
            "date":               iso_date,
            "time":               time_match.group(1),
            "recipient":          recipient,
            "amount":             amount,
            "upi_transaction_id": unique_key,
            "raw_text":           original_lines[i]
        })
        i += 1

    return _deduplicate(transactions)


def _strategy_flexible(
    normalized_lines: list,
    original_lines: list
) -> list:
    """
    Strategy 3: Most flexible — search for any line
    containing both 'Paid to' and a RUPEE amount.
    Does not require date/time on same line.
    Last resort fallback.
    """
    transactions = []
    bank_keywords = [
        "kalupur", "cooperative", "bank", "hdfc",
        "sbi", "icici", "axis", "kotak", "paytm",
        "ltd", "nsdl", "ppi", "wallet"
    ]

    # Match any line with "Paid to NAME RUPEEAMOUNT"
    flexible_pattern = re.compile(
        r'Paid\s+to\s+(.+?)\s+RUPEE([\d,]+)',
        re.IGNORECASE
    )
    date_pattern = re.compile(
        r'(\d{1,2}\s+\w{3},?\s+\d{4})'
    )
    time_pattern = re.compile(
        r'(\d{1,2}:\d{2}\s*[AP]M)'
    )
    upi_pattern = re.compile(
        r'UPI\s*Transaction\s*ID[:\s]+(\d+)',
        re.IGNORECASE
    )

    last_date = "2026-01-01"
    last_time = "12:00 PM"

    for i, line in enumerate(normalized_lines):
        # Track most recent date seen
        date_match = date_pattern.search(line)
        if date_match:
            parsed = _parse_date(date_match.group(1))
            if parsed:
                last_date = parsed

        time_match = time_pattern.search(line)
        if time_match:
            last_time = time_match.group(1)

        # Look for Paid to transaction
        match = flexible_pattern.search(line)
        if not match:
            continue

        recipient = match.group(1).strip()
        raw_amt   = match.group(2).strip()

        if any(
            kw in recipient.lower()
            for kw in bank_keywords
        ):
            continue

        try:
            amount = float(raw_amt.replace(",", ""))
        except ValueError:
            continue

        if amount <= 0:
            continue

        upi_id = _find_upi_id(
            normalized_lines, i, upi_pattern
        )
        unique_key = upi_id or f"{last_date}_{i}"

        transactions.append({
            "date":               last_date,
            "time":               last_time,
            "recipient":          recipient,
            "amount":             amount,
            "upi_transaction_id": unique_key,
            "raw_text":           original_lines[i]
        })

    return _deduplicate(transactions)


def _parse_date(raw_date: str) -> str:
    """
    Converts GPay date string to ISO format YYYY-MM-DD.
    Handles: "04 Feb, 2026" and "4 Feb, 2026"
    and "04 Feb 2026" (without comma)
    """
    cleaned = re.sub(r'\s+', ' ', raw_date.strip())
    formats = [
        "%d %b, %Y",
        "%d %b %Y",
        "%-d %b, %Y",
        "%-d %b %Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Last resort: try with zero-padded day
    try:
        parts = cleaned.replace(",", "").split()
        if len(parts) == 3:
            day   = parts[0].zfill(2)
            month = parts[1]
            year  = parts[2]
            dt = datetime.strptime(
                f"{day} {month} {year}", "%d %b %Y"
            )
            return dt.strftime("%Y-%m-%d")
    except Exception:
        pass

    return ""


def _find_upi_id(
    lines: list,
    start_idx: int,
    pattern: re.Pattern
) -> str:
    """
    Looks for UPI Transaction ID in the next 3 lines
    after a transaction line.
    """
    for j in range(start_idx + 1,
                   min(start_idx + 4, len(lines))):
        match = pattern.search(lines[j])
        if match:
            return match.group(1).strip()
    return ""


def _deduplicate(transactions: list) -> list:
    """
    Removes duplicate transactions by UPI ID.
    Keeps first occurrence.
    """
    seen = set()
    unique = []
    for t in transactions:
        key = t["upi_transaction_id"]
        if key not in seen:
            seen.add(key)
            unique.append(t)
    return unique


def filter_by_date_range(
    transactions: List[dict],
    from_date: str,
    to_date: str
) -> List[dict]:
    """
    Filters transactions to inclusive date range.
    Dates must be YYYY-MM-DD format.
    """
    try:
        start = datetime.strptime(from_date, "%Y-%m-%d")
        end   = datetime.strptime(to_date,   "%Y-%m-%d")
    except ValueError:
        return transactions

    return [
        t for t in transactions
        if start <= datetime.strptime(
            t["date"], "%Y-%m-%d"
        ) <= end
    ]
