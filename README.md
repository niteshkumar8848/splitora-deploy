# Splitora (Splitora)

Smart Expense Splitting & Settlement System built for Hackathon.

Team: **Logic Lords (T021)**
Domain: **FinTech — Financial Transaction Modelling, Ledger Management, Settlement Optimization**

## Project Description

Splitora helps groups track shared expenses with immutable ledger-style entries, reversal/contra support, and optimized debt settlement.

The app models each expense as accounting entries (payer credit + member debits), keeps an auditable history of reversals, and applies **Minimum Cash Flow** to reduce settlement transactions from up to `N*(N-1)/2` to at most `N-1`.

## Core Features

1. **Financial Transaction Modelling**
- Expense split entries per participant.
- Payer credit entries for each expense.
- Reversal support with opposite contra entries and status tracking.

2. **Ledger Management**
- Immutable transaction timeline.
- Reversal lifecycle (`ACTIVE`, `REVERSED`).
- T-account style ledger with running balance and PDF export.

3. **Settlement Optimization**
- Minimum Cash Flow engine to minimize number of payments.
- Suggested debtor→creditor transfers with UPI + Razorpay order flow.
- Debt graph visualization before/after optimization.

## Tech Stack

- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL
- Frontend: React + Vite + TailwindCSS
- Payments: Razorpay (orders + webhook confirmation)
- Analytics: Recharts, React Flow, jsPDF, QRCode

## Folder Structure

```text
backend/
frontend/
render.yaml
README.md
```

## Setup Instructions

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env .env.local  # optional local copy
```

Update `.env` values:
- `DATABASE_URL`
- `SECRET_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Run migrations:

```bash
alembic revision --autogenerate -m "init_all_tables"
alembic upgrade head
```

Start backend:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and talks to backend `http://localhost:8000`.

## API Endpoints

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### Groups
- `POST /groups`
- `POST /groups/join`
- `GET /groups`
- `GET /groups/{group_id}/members`

### Expenses
- `POST /groups/{group_id}/expenses`
- `POST /expenses/{expense_id}/reverse`
- `GET /groups/{group_id}/expenses`
- `GET /groups/{group_id}/balances`

### Settlements
- `GET /groups/{group_id}/settlements/suggested`
- `POST /settlements`

### Analytics
- `GET /groups/{group_id}/analytics/spending`
- `GET /groups/{group_id}/analytics/fairness`
- `GET /groups/{group_id}/analytics/trends`
- `GET /groups/{group_id}/analytics/anomalies`

### Webhooks
- `POST /webhooks/razorpay`

### Health
- `GET /health`

## Minimum Cash Flow Algorithm (How It Works)

Given balances:
- Positive balance = should receive money (creditor)
- Negative balance = owes money (debtor)

Loop:
1. Pick max creditor and max debtor.
2. Settle `min(creditor_amount, abs(debtor_amount))`.
3. Update both balances.
4. Repeat until all balances are near zero.

This greedily minimizes transaction count and yields compact settlement suggestions.

## Deployment

### Render
`render.yaml` deploys backend service:
- Root: `backend/`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## Deployment URLs

- Backend URL: `<add-render-backend-url>`
- Frontend URL: `<add-frontend-url>`

## Team

**Logic Lords — T021**
