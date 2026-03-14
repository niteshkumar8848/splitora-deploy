from typing import List

from pydantic import BaseModel


class GPayTransaction(BaseModel):
    """Single parsed GPay transaction"""

    date: str  # YYYY-MM-DD
    time: str  # HH:MM AM/PM
    recipient: str
    amount: float
    upi_transaction_id: str
    raw_text: str


class GPayParseResponse(BaseModel):
    """Response from PDF parse endpoint"""

    transactions: List[GPayTransaction]
    total_found: int
    total_amount: float
    from_date: str  # earliest date in statement
    to_date: str  # latest date in statement
    message: str


class GPayImportItem(BaseModel):
    """
    Single transaction selected by user to import
    as a group expense. User may have edited fields.
    """

    date: str  # YYYY-MM-DD
    title: str  # editable - defaults to recipient name
    amount: float  # editable
    category: str  # user selected
    paid_by: str  # user_id of who paid
    split_type: str  # EQUAL / PERCENTAGE / CUSTOM
    splits: List[dict]  # [{user_id, share_amount}]


class GPayBulkImportRequest(BaseModel):
    """Request body for bulk importing selected transactions"""

    group_id: str
    transactions: List[GPayImportItem]


class GPayBulkImportResponse(BaseModel):
    """Response after bulk import"""

    imported_count: int
    failed_count: int
    total_amount: float
    expense_ids: List[str]
    message: str
