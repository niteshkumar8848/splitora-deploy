from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.models import Expense, ExpenseSplit, GroupMember, User
from app.schemas.gpay import (
    GPayBulkImportRequest,
    GPayBulkImportResponse,
    GPayParseResponse,
    GPayTransaction,
)
from app.services.pdf_parser import filter_by_date_range, parse_gpay_statement

router = APIRouter()


@router.post("/gpay/parse-pdf", response_model=GPayParseResponse)
async def parse_gpay_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Accepts a GPay PDF statement upload.
    Parses and returns all SENT transactions.
    Does NOT save anything to database yet.
    """

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large. Maximum 10MB allowed.")

    try:
        transactions = parse_gpay_statement(contents)
    except Exception as exc:
        raise HTTPException(
            422,
            "Could not parse PDF. Make sure it is a valid Google Pay "
            f"statement. Error: {str(exc)}",
        )

    if not transactions:
        raise HTTPException(
            404,
            "No sent transactions found in this PDF. Make sure you uploaded "
            "a Google Pay statement.",
        )

    total_amount = sum(t["amount"] for t in transactions)
    dates = [t["date"] for t in transactions]
    from_date = min(dates)
    to_date = max(dates)

    return GPayParseResponse(
        transactions=[GPayTransaction(**t) for t in transactions],
        total_found=len(transactions),
        total_amount=round(total_amount, 2),
        from_date=from_date,
        to_date=to_date,
        message=(
            f"Found {len(transactions)} sent transactions totalling "
            f"₹{round(total_amount, 2)}"
        ),
    )


@router.post("/gpay/parse-pdf/filter", response_model=GPayParseResponse)
async def parse_and_filter_gpay_pdf(
    file: UploadFile = File(...),
    from_date: str = Form(...),
    to_date: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """
    Parse PDF and filter by date range in one call.
    from_date and to_date must be YYYY-MM-DD format.
    """

    contents = await file.read()

    try:
        all_transactions = parse_gpay_statement(contents)
        filtered = filter_by_date_range(all_transactions, from_date, to_date)
    except Exception as exc:
        raise HTTPException(422, str(exc))

    total_amount = sum(t["amount"] for t in filtered)
    dates = [t["date"] for t in filtered] or [from_date]

    return GPayParseResponse(
        transactions=[GPayTransaction(**t) for t in filtered],
        total_found=len(filtered),
        total_amount=round(total_amount, 2),
        from_date=min(dates),
        to_date=max(dates),
        message=(
            f"Found {len(filtered)} transactions between {from_date} "
            f"and {to_date}"
        ),
    )


@router.post("/gpay/bulk-import", response_model=GPayBulkImportResponse)
def bulk_import_gpay_transactions(
    data: GPayBulkImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Takes user-selected and optionally edited transactions
    and creates them as group expenses in the database.
    Uses the same expense creation logic as POST /expenses.
    """

    member = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == data.group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(403, "Not a group member")

    imported_count = 0
    failed_count = 0
    total_amount = 0.0
    expense_ids = []

    for txn in data.transactions:
        try:
            split_sum = sum(s["share_amount"] for s in txn.splits)
            if abs(split_sum - txn.amount) > 0.02:
                failed_count += 1
                continue

            expense_id = str(uuid.uuid4())
            expense = Expense(
                id=expense_id,
                group_id=data.group_id,
                paid_by=txn.paid_by,
                title=txn.title,
                total_amount=txn.amount,
                split_type=txn.split_type,
                category=txn.category,
                is_reversal=False,
                created_at=datetime.strptime(txn.date, "%Y-%m-%d"),
            )
            db.add(expense)
            db.flush()

            for split in txn.splits:
                es = ExpenseSplit(
                    id=str(uuid.uuid4()),
                    expense_id=expense_id,
                    user_id=split["user_id"],
                    share_amount=split["share_amount"],
                )
                db.add(es)

            expense_ids.append(expense_id)
            total_amount += txn.amount
            imported_count += 1

        except Exception:
            db.rollback()
            failed_count += 1
            continue

    db.commit()

    return GPayBulkImportResponse(
        imported_count=imported_count,
        failed_count=failed_count,
        total_amount=round(total_amount, 2),
        expense_ids=expense_ids,
        message=(
            f"Successfully imported {imported_count} expenses totalling "
            f"₹{round(total_amount, 2)}. {failed_count} failed."
            if failed_count > 0
            else f"All {imported_count} expenses imported successfully! "
            f"Total: ₹{round(total_amount, 2)}"
        ),
    )
