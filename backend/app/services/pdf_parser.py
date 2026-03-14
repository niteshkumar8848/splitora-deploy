import pdfplumber
import re
import io
from datetime import datetime
from typing import List


# Month name mapping for merged text like "Feb" "February"
MONTH_MAP = {
    "jan": "01", "feb": "02", "mar": "03",
    "apr": "04", "may": "05", "jun": "06",
    "jul": "07", "aug": "08", "sep": "09",
    "oct": "10", "nov": "11", "dec": "12",
    "january": "01", "february": "02", "march": "03",
    "april": "04", "june": "06", "july": "07",
    "august": "08", "september": "09", "october": "10",
    "november": "11", "december": "12"
}


def parse_gpay_statement(pdf_bytes: bytes) -> List[dict]:
    """
    Parses Google Pay PDF statement.
    Handles merged text format where pdfplumber
    joins words without spaces.
    Uses multiple extraction methods and strategies.
    """

    # ── Extract text using ALL available methods ──────
    all_lines_set = []

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages):

                # Method 1: default extract_text
                t1 = page.extract_text() or ""

                # Method 2: layout=True preserves spaces
                try:
                    t2 = page.extract_text(
                        layout=True
                    ) or ""
                except:
                    t2 = ""

                # Method 3: extract_words and rejoin
                try:
                    words = page.extract_words(
                        x_tolerance=5,
                        y_tolerance=5
                    )
                    # Group by Y position
                    y_groups = {}
                    for w in words:
                        y = round(w["top"] / 5) * 5
                        if y not in y_groups:
                            y_groups[y] = []
                        y_groups[y].append(w["text"])
                    t3 = "\n".join(
                        " ".join(words)
                        for words in sorted(
                            y_groups.values(),
                            key=lambda x: x
                        )
                    )
                except:
                    t3 = ""

                # Collect all unique lines from all methods
                for text in [t1, t2, t3]:
                    for line in text.split('\n'):
                        s = line.strip()
                        if s and s not in all_lines_set:
                            all_lines_set.append(s)

    except Exception as e:
        raise ValueError(f"Cannot read PDF: {str(e)}")

    if not all_lines_set:
        raise ValueError("PDF is empty or unreadable")

    # Print ALL lines for debugging
    print("=" * 60)
    print(f"PARSER: Total unique lines: {len(all_lines_set)}")
    for i, l in enumerate(all_lines_set[:50]):
        print(f"  [{i:03d}] {repr(l)}")
    print("=" * 60)

    # ── Normalize currency ────────────────────────────
    def norm(line):
        # Replace ₹ variants with " RUPEE "
        line = line.replace('\u20b9', ' RUPEE ')
        line = line.replace('₹',      ' RUPEE ')
        line = line.replace('Rs.',    ' RUPEE ')
        line = re.sub(r'\s+', ' ', line).strip()
        return line

    norm_lines = [norm(l) for l in all_lines_set]

    # ── Bank filter ───────────────────────────────────
    BANKS = [
        "kalupur", "cooperative", "bank",
        "hdfc", "sbi", "icici", "axis",
        "kotak", "paytm", "nsdl", "ppi",
        "ltd", "airtel", "fino", "equitas"
    ]

    def is_bank(name):
        n = name.lower()
        return any(b in n for b in BANKS)

    # ── Date parser for merged text ───────────────────
    def parse_date(text):
        """
        Handles both spaced and merged date formats:
          "04 Feb, 2026"  → spaced (after word extraction)
          "04Feb,2026"    → merged (after extract_text)
          "04February2026"→ fully merged
        """
        # Try spaced format first
        m = re.search(
            r'(\d{1,2})\s+([A-Za-z]{3,}),?\s*(\d{4})',
            text
        )
        if m:
            day   = m.group(1).zfill(2)
            month = MONTH_MAP.get(m.group(2).lower(), "")
            year  = m.group(3)
            if month:
                return f"{year}-{month}-{day}"

        # Try merged format: "04Feb,2026" or "04Feb2026"
        m = re.search(
            r'(\d{1,2})([A-Za-z]{3,}),?\s*(\d{4})',
            text
        )
        if m:
            day   = m.group(1).zfill(2)
            month = MONTH_MAP.get(m.group(2).lower(), "")
            year  = m.group(3)
            if month:
                return f"{year}-{month}-{day}"

        return None

    def parse_time(text):
        m = re.search(
            r'(\d{1,2}:\d{2})\s*([AP]M)',
            text, re.IGNORECASE
        )
        if m:
            return f"{m.group(1)} {m.group(2).upper()}"
        return "12:00 PM"

    def parse_amount(text):
        m = re.search(r'RUPEE\s*([\d,]+)', text)
        if m:
            try:
                return float(m.group(1).replace(',', ''))
            except:
                pass
        return None

    def find_upi(lines, start):
        for j in range(start, min(start+4, len(lines))):
            m = re.search(
                r'UPI\s*Transaction\s*ID\s*[:\s]*(\d+)',
                lines[j], re.IGNORECASE
            )
            if m:
                return m.group(1)
        return ""

    # ── STRATEGY 1: Find "Paidto" or "Paid to" ────────
    # Handles both merged and spaced versions
    transactions = []
    seen_keys    = set()

    paid_patterns = [
        # Spaced: "Paid to NAME"
        re.compile(r'Paid\s+to\s+(.+)', re.IGNORECASE),
        # Merged: "PaidtoNAME"
        re.compile(r'Paidto([A-Z][^\s].+)', re.IGNORECASE),
        # With preceding text: "PMPaidtoNAME"
        re.compile(
            r'[AP]M\s*Paid\s*to\s*(.+)',
            re.IGNORECASE
        ),
    ]

    last_date = None
    last_time = "12:00 PM"

    for i, line in enumerate(norm_lines):
        # Track date and time
        d = parse_date(line)
        if d:
            last_date = d
        t = parse_time(line)
        if t != "12:00 PM":
            last_time = t

        # Try each paid pattern
        matched = None
        for pat in paid_patterns:
            m = pat.search(line)
            if m:
                matched = m
                break

        if not matched:
            continue

        after = matched.group(1).strip()

        # Split recipient from amount
        if 'RUPEE' in after:
            parts     = re.split(r'\s*RUPEE\s*', after, 1)
            recipient = parts[0].strip()
            try:
                amount = float(
                    parts[1].strip()
                    .replace(',','')
                    .split()[0]
                )
            except:
                amount = None
        else:
            recipient = after.strip()
            amount    = None

        # Clean recipient name
        # Remove anything after time pattern or RUPEE
        recipient = re.split(
            r'\s+RUPEE|\s+UPI|\s+Paid\s*[bt]',
            recipient, flags=re.IGNORECASE
        )[0].strip()

        # Remove trailing numbers that might be part
        # of a merged next field
        recipient = re.sub(r'\d{10,}$', '', recipient)
        recipient = recipient.strip()

        if not recipient or len(recipient) < 2:
            continue
        if is_bank(recipient):
            continue

        # Find amount if not found yet
        if not amount:
            for j in range(i, min(i+5, len(norm_lines))):
                amount = parse_amount(norm_lines[j])
                if amount:
                    break

        if not amount or amount <= 0:
            continue

        # Get date
        iso_date = parse_date(line) or last_date
        tx_time  = parse_time(line)
        if tx_time == "12:00 PM":
            tx_time = last_time
        if not iso_date:
            iso_date = "2026-02-01"

        # Get UPI
        upi_id     = find_upi(norm_lines, i)
        unique_key = (
            upi_id or
            f"{iso_date}_{recipient}_{int(amount)}"
        )

        if unique_key in seen_keys:
            continue
        seen_keys.add(unique_key)

        transactions.append({
            "date":               iso_date,
            "time":               tx_time,
            "recipient":          recipient,
            "amount":             round(amount, 2),
            "upi_transaction_id": unique_key,
            "raw_text":           all_lines_set[i]
                                  if i < len(all_lines_set)
                                  else line
        })

    # ── STRATEGY 2: Parse from merged date lines ──────
    # Lines like "04Feb,202607:26PMPaidtoMRFITNESS₹2000"
    if not transactions:
        print("Strategy 1 found nothing, trying Strategy 2")
        transactions = _parse_merged_lines(
            all_lines_set, norm_lines
        )

    print(f"FINAL: {len(transactions)} transactions found")
    for t in transactions:
        print(
            f"  {t['date']} | "
            f"{t['recipient']} | "
            f"₹{t['amount']}"
        )

    transactions.sort(key=lambda x: x["date"])
    return transactions


def _parse_merged_lines(
    original: list,
    normalized: list
) -> list:
    """
    Strategy 2: Handles fully merged lines like:
    "04Feb,202607:26PMPaidtoMRFITNESS RUPEE 2,000"
    Uses character-level parsing.
    """
    transactions = []
    seen         = set()
    BANKS        = [
        "kalupur", "cooperative", "bank",
        "hdfc", "sbi", "icici", "axis",
        "kotak", "paytm", "nsdl", "ltd"
    ]

    MONTH_MAP = {
        "jan":"01","feb":"02","mar":"03",
        "apr":"04","may":"05","jun":"06",
        "jul":"07","aug":"08","sep":"09",
        "oct":"10","nov":"11","dec":"12",
        "january":"01","february":"02","march":"03",
        "april":"04","june":"06","july":"07",
        "august":"08","september":"09","october":"10",
        "november":"11","december":"12"
    }

    # Pattern for fully merged transaction:
    # DD + Month + , + YYYY + HH:MM + AM/PM +
    # Paidto + NAME + RUPEE + AMOUNT
    full_pattern = re.compile(
        r'(\d{1,2})'              # day
        r'([A-Za-z]+)'            # month
        r',?\s*'
        r'(\d{4})'                # year
        r'(\d{1,2}:\d{2})'       # time
        r'([AP]M)'                # am/pm
        r'Paid\s*to\s*'           # "Paidto" or "Paid to"
        r'(.+?)'                  # recipient (lazy)
        r'\s*RUPEE\s*'            # currency
        r'([\d,]+)',              # amount
        re.IGNORECASE
    )

    for i, line in enumerate(normalized):
        m = full_pattern.search(line)
        if not m:
            continue

        day       = m.group(1).zfill(2)
        month_str = m.group(2).lower()
        year      = m.group(3)
        time_str  = f"{m.group(4)} {m.group(5).upper()}"
        recipient = m.group(6).strip()
        amt_str   = m.group(7).strip()

        month = MONTH_MAP.get(month_str, "")
        if not month:
            # Try 3-letter prefix
            month = MONTH_MAP.get(month_str[:3], "")
        if not month:
            continue

        iso_date = f"{year}-{month}-{day}"

        if any(b in recipient.lower() for b in BANKS):
            continue

        try:
            amount = float(amt_str.replace(',', ''))
        except:
            continue

        if amount <= 0:
            continue

        # Find UPI ID
        upi_id = ""
        for j in range(i, min(i+4, len(normalized))):
            um = re.search(
                r'UPI\s*Transaction\s*ID\s*[:\s]*(\d+)',
                normalized[j], re.IGNORECASE
            )
            if um:
                upi_id = um.group(1)
                break

        key = upi_id or f"{iso_date}_{recipient}_{int(amount)}"
        if key in seen:
            continue
        seen.add(key)

        transactions.append({
            "date":               iso_date,
            "time":               time_str,
            "recipient":          recipient,
            "amount":             round(amount, 2),
            "upi_transaction_id": key,
            "raw_text":           original[i]
                                  if i < len(original)
                                  else line
        })

    return transactions


def filter_by_date_range(
    transactions: List[dict],
    from_date: str,
    to_date: str
) -> List[dict]:
    """Filter by inclusive date range (YYYY-MM-DD)"""
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
