import pdfplumber
import re
import io
from datetime import datetime
from typing import List


def parse_gpay_statement(pdf_bytes: bytes) -> List[dict]:
    """
    Parses Google Pay PDF using word-level extraction.
    Uses extract_words() instead of extract_text()
    to handle PDFs where text has no spaces.
    Groups words by Y position to reconstruct lines.
    """

    # ── STEP 1: Extract words with positions ──────────
    all_words_by_page = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages):

                # extract_words gives [{text, x0, top, ...}]
                words = page.extract_words(
                    x_tolerance=3,
                    y_tolerance=3,
                    keep_blank_chars=False,
                    use_text_flow=True,
                    extra_attrs=["size"]
                )
                all_words_by_page.append({
                    "page":  page_num + 1,
                    "words": words
                })
    except Exception as e:
        raise ValueError(f"Cannot read PDF: {str(e)}")

    if not all_words_by_page:
        raise ValueError("PDF is empty or unreadable")

    # ── STEP 2: Group words into lines by Y position ──
    # Words within 3px vertical distance = same line
    all_lines = []
    for page_data in all_words_by_page:
        words = page_data["words"]
        if not words:
            continue

        # Sort words by top (Y position) then left (X)
        words_sorted = sorted(
            words,
            key=lambda w: (round(w["top"] / 3) * 3, w["x0"])
        )

        # Group by Y position (same line = within 3px)
        lines_dict = {}
        for word in words_sorted:
            y_key = round(word["top"] / 3) * 3
            if y_key not in lines_dict:
                lines_dict[y_key] = []
            lines_dict[y_key].append(word["text"])

        # Join words in each line with space
        for y_key in sorted(lines_dict.keys()):
            line_text = " ".join(lines_dict[y_key]).strip()
            if line_text:
                all_lines.append(line_text)

    # ── STEP 3: Debug print reconstructed lines ───────
    print("=" * 60)
    print(f"PDF PARSER: {len(all_lines)} reconstructed lines")
    for i, line in enumerate(all_lines[:40]):
        print(f"  [{i:03d}] {repr(line)}")
    print("=" * 60)

    # ── STEP 4: Normalize currency symbols ────────────
    def normalize(line):
        line = line.replace('\u20b9', ' RUPEE ')
        line = line.replace('₹',      ' RUPEE ')
        line = line.replace('Rs.',    ' RUPEE ')
        line = line.replace('Rs ',    ' RUPEE ')
        # Clean up multiple spaces
        line = re.sub(r'\s+', ' ', line).strip()
        return line

    norm_lines = [normalize(l) for l in all_lines]

    # ── STEP 5: Parse transactions ────────────────────
    transactions  = []
    seen_keys     = set()
    bank_keywords = [
        "kalupur", "cooperative", "bank",
        "hdfc", "sbi", "icici", "axis",
        "kotak", "paytm", "nsdl", "ppi",
        "wallet", "ltd", "airtel", "fino"
    ]

    def is_bank(name):
        return any(kw in name.lower() for kw in bank_keywords)

    def parse_date(text):
        """
        Handle date formats after word reconstruction:
        "02 Feb , 2026" or "02 Feb, 2026" or "02 Feb 2026"
        """
        patterns = [
            r'(\d{1,2})\s+(\w{3,})\s*,?\s*(\d{4})'
        ]
        for pat in patterns:
            m = re.search(pat, text)
            if m:
                day   = m.group(1).zfill(2)
                month = m.group(2)[:3].capitalize()
                year  = m.group(3)
                try:
                    dt = datetime.strptime(
                        f"{day} {month} {year}",
                        "%d %b %Y"
                    )
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    continue
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
                r'UPI\s*Transaction\s*ID\s*[:\s]\s*(\d+)',
                lines[j], re.IGNORECASE
            )
            if m:
                return m.group(1)
        return ""

    # ── Scan for "Paid to" in reconstructed lines ─────
    paid_to_re = re.compile(
        r'Paid\s+to\s+(.+)',
        re.IGNORECASE
    )

    # Track last seen date across lines
    last_date = None
    last_time = "12:00 PM"

    for i, line in enumerate(norm_lines):

        # Update last seen date
        d = parse_date(line)
        if d:
            last_date = d

        t = parse_time(line)
        if t != "12:00 PM":
            last_time = t

        # Look for Paid to
        m = paid_to_re.search(line)
        if not m:
            continue

        after = m.group(1).strip()

        # Extract recipient and amount from remainder
        # Amount may be on same line: "MR FITNESS RUPEE 2,000"
        # Or on a nearby line
        if 'RUPEE' in after:
            # Split on RUPEE
            parts = re.split(r'\s*RUPEE\s*', after, maxsplit=1)
            recipient  = parts[0].strip()
            amount_str = parts[1].strip() if len(parts) > 1 else ""
            try:
                amount = float(amount_str.replace(',','').split()[0])
            except:
                amount = None
        else:
            recipient = after.strip()
            amount    = None

        # Clean recipient — remove trailing junk
        recipient = re.split(
            r'\s+RUPEE|\s+UPI|\s+Paid\s+by',
            recipient,
            flags=re.IGNORECASE
        )[0].strip()

        # Skip if empty or bank
        if not recipient or is_bank(recipient):
            continue

        # If no amount on same line, look nearby
        if not amount:
            for j in range(i, min(i+5, len(norm_lines))):
                amount = parse_amount(norm_lines[j])
                if amount:
                    break

        if not amount or amount <= 0:
            continue

        # Use last seen date or look on same line
        iso_date = parse_date(line) or last_date
        tx_time  = parse_time(line)
        if tx_time == "12:00 PM":
            tx_time = last_time

        if not iso_date:
            iso_date = "2026-02-01"

        # Find UPI ID
        upi_id     = find_upi(norm_lines, i)
        unique_key = (
            upi_id or
            f"{iso_date}_{recipient}_{amount}"
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
            "raw_text":           all_lines[i]
        })

    # ── STEP 6: If word extraction got nothing ────────
    # Fallback: try extract_text with layout=True
    if not transactions:
        print("Word extraction found nothing.")
        print("Trying layout-based extraction...")
        transactions = _layout_fallback(pdf_bytes)

    print(f"FINAL: Found {len(transactions)} transactions")
    for t in transactions:
        print(f"  {t['date']} | {t['recipient']} | ₹{t['amount']}")

    transactions.sort(key=lambda x: x["date"])
    return transactions


def _layout_fallback(pdf_bytes: bytes) -> list:
    """
    Fallback: use pdfplumber with layout=True
    which preserves spacing better on some PDFs.
    """
    transactions = []
    bank_keywords = [
        "kalupur", "cooperative", "bank",
        "hdfc", "sbi", "icici", "axis",
        "kotak", "paytm", "ltd"
    ]

    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                # layout=True preserves spaces
                text = page.extract_text(
                    layout=True,
                    x_density=7.25,
                    y_density=13
                )
                if not text:
                    continue

                lines = [
                    l.strip() for l in text.split('\n')
                    if l.strip()
                ]

                print("FALLBACK lines:")
                for i, l in enumerate(lines[:30]):
                    print(f"  [{i}] {repr(l)}")

                # Normalize
                def norm(l):
                    l = l.replace('\u20b9', ' RUPEE ')
                    l = l.replace('₹', ' RUPEE ')
                    return re.sub(r'\s+', ' ', l).strip()

                norm_lines = [norm(l) for l in lines]

                paid_re = re.compile(
                    r'Paid\s+to\s+(.+)',
                    re.IGNORECASE
                )
                date_re = re.compile(
                    r'(\d{1,2})\s+(\w{3})\s*,?\s*(\d{4})'
                )
                amt_re = re.compile(
                    r'RUPEE\s*([\d,]+)'
                )
                upi_re = re.compile(
                    r'UPI\s*Transaction\s*ID\s*[:\s]\s*(\d+)',
                    re.IGNORECASE
                )

                last_date = "2026-02-01"
                seen      = set()

                for i, line in enumerate(norm_lines):
                    dm = date_re.search(line)
                    if dm:
                        try:
                            d = datetime.strptime(
                                f"{dm.group(1).zfill(2)} "
                                f"{dm.group(2)[:3].capitalize()} "
                                f"{dm.group(3)}",
                                "%d %b %Y"
                            )
                            last_date = d.strftime("%Y-%m-%d")
                        except:
                            pass

                    pm = paid_re.search(line)
                    if not pm:
                        continue

                    after = pm.group(1).strip()
                    if any(
                        kw in after.lower()
                        for kw in bank_keywords
                    ):
                        continue

                    # Get recipient
                    if 'RUPEE' in after:
                        parts     = after.split('RUPEE')
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
                        recipient = after
                        amount    = None

                    if not amount:
                        for j in range(
                            i, min(i+5, len(norm_lines))
                        ):
                            am = amt_re.search(norm_lines[j])
                            if am:
                                try:
                                    amount = float(
                                        am.group(1)
                                        .replace(',','')
                                    )
                                    break
                                except:
                                    pass

                    if not recipient or not amount:
                        continue
                    if amount <= 0:
                        continue

                    upi_id = ""
                    for j in range(
                        i, min(i+4, len(norm_lines))
                    ):
                        um = upi_re.search(norm_lines[j])
                        if um:
                            upi_id = um.group(1)
                            break

                    key = (
                        upi_id or
                        f"{last_date}_{recipient}_{amount}"
                    )
                    if key in seen:
                        continue
                    seen.add(key)

                    transactions.append({
                        "date":               last_date,
                        "time":               "12:00 PM",
                        "recipient":          recipient,
                        "amount":             round(amount, 2),
                        "upi_transaction_id": key,
                        "raw_text":           lines[i]
                    })

    except Exception as e:
        print(f"Fallback failed: {e}")

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
