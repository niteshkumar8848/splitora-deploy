from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    auth,
    groups,
    expenses,
    settlements,
    analytics,
    webhooks,
    gpay
)

app = FastAPI(
    title="SplitSmart API",
    description="Financial Transaction Modelling & Settlement System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Auth routes -> /auth/register, /auth/login, /auth/me
app.include_router(
    auth.router,
    prefix="/auth",
    tags=["Auth"]
)

# Group routes -> /groups, /groups/join, /groups/{id}/members
app.include_router(
    groups.router,
    prefix="/groups",
    tags=["Groups"]
)

# Expense routes -> /groups/{id}/expenses, /expenses/{id}/reverse
app.include_router(
    expenses.router,
    tags=["Expenses"]
)

# Settlement routes -> /groups/{id}/settlements/suggested
app.include_router(
    settlements.router,
    tags=["Settlements"]
)

# Analytics routes -> /groups/{id}/analytics/spending etc
app.include_router(
    analytics.router,
    tags=["Analytics"]
)

# Webhook routes -> /webhooks/razorpay
app.include_router(
    webhooks.router,
    prefix="/webhooks",
    tags=["Webhooks"]
)

# GPay import routes -> /gpay/parse-pdf, /gpay/bulk-import
# CRITICAL: NO prefix here because routes already
# have /gpay/ at the start inside gpay.py
app.include_router(
    gpay.router,
    tags=["GPay Import"]
)

@app.get("/health")
def health():
    """Health check endpoint for Render"""
    return {"status": "ok", "app": "SplitSmart"}
