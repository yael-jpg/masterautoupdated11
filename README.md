# MasterAuto Management System

Full-stack starter implementation for a premium MasterAuto management dashboard.

## Stack
- Frontend: React + Vite (modular reusable components)
- Backend: Node.js + Express (REST API)
- Database: PostgreSQL

## Folder Structure
- `frontend` → React + Vite dashboard UI
- `backend` → Express API + PostgreSQL schema/seed scripts

## Backend Setup
1. Copy environment file:
   - `backend/.env.example` → `backend/.env`
2. Install dependencies:
   - `cd backend`
   - `npm install`
3. Create DB schema and seed data:
   - `npm run db:schema`
   - `npm run db:seed`
4. Run backend:
   - `npm run dev`

For production profile:
- `backend/.env.production.example` → `backend/.env`
- run with `npm start`

Backend default URL: `http://localhost:5000`

Service checks:
- Liveness: `GET /health`
- Readiness (DB probe): `GET /ready`

### Backend API Coverage
- Auth + RBAC (`/api/auth/login`)
- Customers (`/api/customers`)
- Vehicles + service history (`/api/vehicles`, `/api/vehicles/:id/history`)
- Services/Packages (`/api/services`, `/api/services/:id/price`)
- Sales + invoice actions (`/api/sales`, `/api/sales/:id/void`)
- Payments (`/api/payments`)
- Appointments (`/api/appointments`)
- Reports (`/api/reports/sales-summary`)
- Exports (`/api/exports/:table/csv`, `/api/exports/:table/excel`, `/api/exports/sales/:id/:type/pdf`)
- Admin/Security (`/api/admin/users`, `/api/admin/audit-logs`, `/api/admin/master-data`)

### List Query Parameters
The following list endpoints support server-side pagination and filtering:
- `/api/customers`, `/api/vehicles`, `/api/sales`, `/api/payments`, `/api/appointments`

Common query params:
- `page` (default `1`)
- `limit` (default `10`, max `100`)
- `search` (text search)

Additional query params:
- Sales: `status`, `dateFrom`, `dateTo`, `sortBy` (`createdAt|amount|status|reference|customer`), `sortDir` (`asc|desc`)
- Appointments: `status`, `dateFrom`, `dateTo`, `sortBy` (`scheduleStart|status|customer|plate|createdAt`), `sortDir` (`asc|desc`)

### Security Hardening
- Rate limiting enabled:
   - `/api/auth/*` (stricter authentication throttle)
   - `/api/*` (general API throttle)
- Request validation enabled for create/update/delete routes in auth, customers, vehicles, sales, payments, and appointments.
- Validation errors return HTTP `400` with structured `errors` payload.

## Frontend Setup
1. Copy environment file:
   - `frontend/.env.example` → `frontend/.env`
2. Install dependencies:
   - `cd frontend`
   - `npm install`
3. Run frontend:
   - `npm run dev`

For production profile:
- `frontend/.env.production.example` → `frontend/.env`
- `npm run build` then `npm run preview`

Frontend default URL: `http://localhost:5173`

## Default Seed Login
- Email: `admin@masterauto.com`
- Password: `admin123`
- Role: `Admin`

## Optional Docker (Local Dev)
From workspace root:
- `docker compose up --build`

Then initialize DB schema/seed inside backend container:
- `docker compose exec backend npm run db:schema`
- `docker compose exec backend npm run db:seed`

## One-command Smoke Test
From `backend` folder:
- `npm run smoke`

This starts the app on an ephemeral port, then verifies:
- `/health`
- `/ready`
- `/api/auth/login`
- `/api/customers` (authorized)

By default it bootstraps DB schema + seed first (idempotent).
Set `SMOKE_BOOTSTRAP_DB=false` to skip bootstrap.

Optional smoke credentials env vars:
- `SMOKE_EMAIL`
- `SMOKE_PASSWORD`

## Test Release Email Function
From `backend` folder:
- `npm run email:test-release -- --saleId 1`

Manual payload option:
- `npm run email:test-release -- --to customer@example.com --customerName "Test Customer" --plateNumber ABC1234 --make Toyota --model Vios --year 2022 --referenceNo INV-1001`

Optional env vars for defaults:
- `TEST_RELEASE_TO`
- `TEST_RELEASE_CUSTOMER_NAME`
- `TEST_RELEASE_PLATE_NUMBER`
- `TEST_RELEASE_MAKE`
- `TEST_RELEASE_MODEL`
- `TEST_RELEASE_YEAR`
- `TEST_RELEASE_REFERENCE_NO`

Note: The script uses the same backend mailer function (`sendReadyForReleaseEmail`) used when sales status changes to `Ready for release`.
