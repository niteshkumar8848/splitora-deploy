from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.models import User, GroupMember, Expense, ExpenseSplit
from app.schemas.gpay import (
    GPayParseResponse,
    GPayTransaction,
    GPayBulkImportRequest,
    GPayBulkImportResponse
)
from app.services.pdf_parser import (
    parse_gpay_statement,
    filter_by_date_range
)
import uuid
from datetime import datetime

# CRITICAL: NO prefix on the router itself
router = APIRouter()


# Route 1 - must be /gpay/parse-pdf (full path)
@router.post(
    "/gpay/parse-pdf",
    response_model=GPayParseResponse
)
async def parse_gpay_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload GPay PDF and extract all sent transactions.
    Returns parsed transaction list.
    Does NOT save to database.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted")

    contents = await file.read()

    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 10MB.")

    try:
        transactions = parse_gpay_statement(contents)
    except Exception as e:
        raise HTTPException(
            422,
            f"Could not parse PDF. Make sure it is a "
            f"valid Google Pay statement. Error: {str(e)}"
        )

    if not transactions:
        raise HTTPException(
            404,
            "No sent transactions found in this PDF. "
            "Make sure you uploaded a Google Pay statement."
        )

    total_amount = sum(t["amount"] for t in transactions)
    dates        = [t["date"] for t in transactions]

    return GPayParseResponse(
        transactions=[GPayTransaction(**t) for t in transactions],
        total_found=   len(transactions),
        total_amount=  round(total_amount, 2),
        from_date=     min(dates),
        to_date=       max(dates),
        message=(
            f"Found {len(transactions)} sent transactions "
            f"totalling ₹{round(total_amount, 2)}"
        )
    )


# Route 2 - must be /gpay/parse-pdf/filter (full path)
@router.post(
    "/gpay/parse-pdf/filter",
    response_model=GPayParseResponse
)
async def parse_and_filter_gpay_pdf(
    file: UploadFile = File(...),
    from_date: str   = Form(...),
    to_date:   str   = Form(...),
    current_user: User = Depends(get_current_user)
):
    """
    Parse PDF and filter by date range.
    from_date and to_date must be YYYY-MM-DD.
    """
    contents = await file.read()

    try:
        all_txns = parse_gpay_statement(contents)
        filtered = filter_by_date_range(
            all_txns, from_date, to_date
        )
    except Exception as e:
        raise HTTPException(422, str(e))

    if not filtered:
        raise HTTPException(
            404,
            f"No transactions found between "
            f"{from_date} and {to_date}"
        )

    total_amount = sum(t["amount"] for t in filtered)
    dates        = [t["date"] for t in filtered]

    return GPayParseResponse(
        transactions=[GPayTransaction(**t) for t in filtered],
        total_found=  len(filtered),
        total_amount= round(total_amount, 2),
        from_date=    min(dates),
        to_date=      max(dates),
        message=(
            f"Found {len(filtered)} transactions "
            f"between {from_date} and {to_date}"
        )
    )


# Route 3 - must be /gpay/bulk-import (full path)
@router.post(
    "/gpay/bulk-import",
    response_model=GPayBulkImportResponse
)
def bulk_import_gpay_transactions(
    data: GPayBulkImportRequest,
    db:   Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Import selected transactions as group expenses.
    Creates Expense + ExpenseSplit rows in database.
    """
    member = db.query(GroupMember).filter(
        GroupMember.group_id == data.group_id,
        GroupMember.user_id  == current_user.id
    ).first()
    if not member:
        raise HTTPException(403, "Not a group member")

    imported_count = 0
    failed_count   = 0
    total_amount   = 0.0
    expense_ids    = []

    for txn in data.transactions:
        try:
            split_sum = sum(
                s["share_amount"] for s in txn.splits
            )
            if abs(split_sum - txn.amount) > 0.02:
                failed_count += 1
                continue

            expense_id = str(uuid.uuid4())
            expense = Expense(
                id=           expense_id,
                group_id=     data.group_id,
                paid_by=      txn.paid_by,
                title=        txn.title,
                total_amount= txn.amount,
                split_type=   txn.split_type,
                category=     txn.category,
                is_reversal=  False,
                created_at=   datetime.strptime(
                    txn.date, "%Y-%m-%d"
                )
            )
            db.add(expense)
            db.flush()

            for split in txn.splits:
                es = ExpenseSplit(
                    id=           str(uuid.uuid4()),
                    expense_id=   expense_id,
                    user_id=      split["user_id"],
                    share_amount= split["share_amount"]
                )
                db.add(es)

            expense_ids.append(expense_id)
            total_amount   += txn.amount
            imported_count += 1

        except Exception:
            db.rollback()
            failed_count += 1
            continue

    db.commit()

    return GPayBulkImportResponse(
        imported_count= imported_count,
        failed_count=   failed_count,
        total_amount=   round(total_amount, 2),
        expense_ids=    expense_ids,
        message=(
            f"Successfully imported {imported_count} expenses "
            f"totalling ₹{round(total_amount, 2)}."
            if failed_count == 0
            else
            f"Imported {imported_count}, "
            f"failed {failed_count}."
        )
    )


# Route 4 - debug endpoint to verify PDF text extraction
@router.post("/gpay/debug-parse")
async def debug_parse_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Debug only - returns raw text lines from PDF.
    Use /docs to test this and verify PDF is readable.
    """
    contents = await file.read()
    try:
        import pdfplumber
        import io
        lines = []
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    for line in text.split('\n'):
                        if line.strip():
                            lines.append({
                                "page": page_num + 1,
                                "line": line.strip()
                            })
        return {
            "total_lines":    len(lines),
            "first_50_lines": lines[:50],
            "message": (
                "Check these lines to verify "
                "the PDF text is readable"
            )
        }
    except Exception as e:
        raise HTTPException(500, str(e))
