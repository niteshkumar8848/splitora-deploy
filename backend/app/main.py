import logging
import os
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.database import Base, engine
from app.routers import analytics, auth, expenses, gpay, groups, settlements, webhooks

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Splitora API",
    description="Financial Transaction Modelling & Settlement System",
    version="1.0.0",
)

def _normalize_origin(origin: str) -> str:
    parsed = urlparse(origin.strip())
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return origin.strip().rstrip("/")


frontend_url = os.getenv("FRONTEND_URL", "")
allowed_origins = [_normalize_origin(origin) for origin in frontend_url.split(",") if origin.strip()]
if not allowed_origins:
    allowed_origins = ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(groups.router, prefix="/groups", tags=["Groups"])
app.include_router(expenses.router, tags=["Expenses"])
app.include_router(settlements.router, tags=["Settlements"])
app.include_router(analytics.router, tags=["Analytics"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["Webhooks"])
app.include_router(gpay.router, tags=["GPay Import"])


# Ensure tables exist for local/dev runs when no Alembic revisions are present.
@app.on_event("startup")
def startup_create_tables():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.warning("Database table initialization skipped: %s", exc)


# Return a clean 503 response for database connectivity failures.
@app.exception_handler(OperationalError)
async def handle_db_operational_error(_: Request, __: OperationalError):
    return JSONResponse(
        status_code=503,
        content={"detail": "Database connection failed. Check PostgreSQL credentials/permissions."},
    )


# Return service health status.
@app.get("/health")
def health():
    return {"status": "ok", "app": "Splitora"}
