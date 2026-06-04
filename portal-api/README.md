# Sepela Portal API

Node.js + TypeScript backend for the online Sepela admin portal.

## Responsibilities

1. Global account hierarchy: `Merchant -> Branch -> Device`
2. MRC / license engine: activation codes and cryptographically signed offline leases
3. Sync ingestion engine: accepts historical uploads from desktop devices

## Stack

- Fastify
- TypeScript
- PostgreSQL
- Zod

## Setup

```bash
cd portal-api
cp .env.example .env
npm install
npm run dev
```

### Recommended: Neon PostgreSQL with pooling

Paste your Neon pooled connection string into `portal-api/.env` as `DATABASE_URL`.

Example shape:

```env
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-POOLER-ENDPOINT/sepela_portal?sslmode=require&channel_binding=require
```

Notes:

- use the **pooled** Neon connection string, not the direct one
- keep `sslmode=require`
- `channel_binding=require` is recommended by Neon on secure pooled connections
- paste only the raw `postgresql://...` URL into `DATABASE_URL`, not the full `psql 'postgresql://...'` command

If startup fails with `ECONNREFUSED`, PostgreSQL is not running yet on the `DATABASE_URL` host/port.

### Local PostgreSQL checklist

1. Install PostgreSQL on Windows, or use a hosted PostgreSQL provider.
2. Make sure a server is running on port `5432` if you keep the default `.env`.
3. Create a database named `sepela_portal`.
4. Keep `DATABASE_URL` aligned with the actual host, port, username, password, and database name.

Default local example:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sepela_portal
```

If you are using Neon, replace `DATABASE_URL` with your Neon pooled connection string instead of localhost.

Required environment variables:

- `DATABASE_URL`
- `CORS_ORIGINS`
- `PORTAL_BEARER_TOKEN`
- `LEASE_SIGNING_SECRET`

For local portal frontend development, a good default is:

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:1420,http://127.0.0.1:1420
```

## Routes

### Health

- `GET /health`

### Global account management

- `GET /admin/overview`
- `GET /admin/merchants`
- `GET /admin/activation-codes`
- `GET /admin/offline-leases`
- `GET /device/lease-status?leaseToken=<uuid>` (or `deviceCode` + `activationCode`)
- `POST /device/activate`
- `POST /admin/bootstrap-tenant`
- `POST /admin/activation-codes`
- `POST /admin/offline-leases`

### Management (edit / delete / status)

- `PATCH /admin/merchants/:id`
- `DELETE /admin/merchants/:id`
- `PATCH /admin/branches/:id`
- `DELETE /admin/branches/:id`
- `PATCH /admin/devices/:id`
- `DELETE /admin/devices/:id`
- `PATCH /admin/activation-codes/:id`
- `DELETE /admin/activation-codes/:id`
- `PATCH /admin/offline-leases/:id`
- `DELETE /admin/offline-leases/:id`

Status values:

- Merchants and branches: `ACTIVE`, `INACTIVE`
- Activation codes: `READY`, `DISABLED`
- Offline leases: `ACTIVE`, `REVOKED`

All admin routes require:

```http
Authorization: Bearer <PORTAL_BEARER_TOKEN>
```

### Sync ingestion

- `GET /admin/sync-ingestions`
- `POST /sync/push` (requires a valid `leaseToken` when the desktop is activated)

Expected body matches the desktop app sync contract, plus tenant routing fields:

```json
{
  "sentAt": "2026-05-26T08:00:00.000Z",
  "deviceId": "branch-a-pos-01",
  "source": "sqlite",
  "merchantCode": "sepela-demo",
  "branchCode": "main-store",
  "tables": {
    "products": [],
    "customers": [],
    "suppliers": [],
    "sales": [],
    "purchases": [],
    "settings": [],
    "stockSnapshots": []
  }
}
```

## Notes

- Current conflict handling is last-write-wins by `updatedAt`.
- The service auto-creates merchant/branch/device shells during sync if they do not exist yet.
- The React admin frontend in `../portal-admin` is already wired to these routes.
