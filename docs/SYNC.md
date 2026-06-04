# Offline-first sync architecture

## Local storage (now)

- **Engine:** SQLite via `@tauri-apps/plugin-sql` (`sqlite:sepela.db` in the app data directory).
- **Fallback:** `localStorage` only when the UI runs in a normal browser (`npm run dev` at http://localhost:1420). The desktop window from **`npm run tauri dev`** must show **`sqlite`** in the header.
- **Migration:** On first SQLite open, existing `localStorage` keys are imported once (`app_meta.ls_migrated = 1`).
- **Tauri permissions:** `src-tauri/capabilities/default.json` must include `sql:default` and `sql:allow-execute` (writes/migrations use `execute`).

## Sync columns (every business table)

| Column | Purpose |
|--------|---------|
| `id` | UUIDv4-style string from the client (`inv_…`, `prd_…`, `line_…`) — avoids collisions when multiple tills sync to PostgreSQL |
| `updated_at` | ISO timestamp of last local change |
| `sync_status` | `PENDING` \| `SYNCED` \| `FAILED` |

Tables: `products`, `sales`, `sale_items`, `settings`, `app_meta`.

## Receipt types (SDC)

Each print/copy emission uses a unique **SDC receipt code** so the Virtual Sales Data Controller can route payloads:

| Receipt type | Transaction | Code |
|--------------|-------------|------|
| NORMAL | SALES | `RT_NORMAL_SALES` |
| NORMAL | REFUND | `RT_NORMAL_REFUND` |
| COPY | SALES | `RT_COPY_SALES` |
| COPY | REFUND | `RT_COPY_REFUND` |
| TRAINING | SALES | `RT_TRAINING_SALES` |
| TRAINING | REFUND | `RT_TRAINING_REFUND` |
| PROFORMA | SALES | `RT_PROFORMA_SALES` |

PROFORMA is **SALES only** (quotes; not persisted as completed sales).

Implementation: `src/domain/receiptTransaction.js`, plain text in `src/utils/invoiceText.js`.

## Remote storage (planned)

- **PostgreSQL** on your online portal.
- **API:** REST.
- **Desktop phase 1:** manual push from **Settings -> Cloud sync manager**.
- **Activation / lease:** Desktop stores the offline lease from `POST /device/activate`. Before sync (and on app start), it calls `GET /device/lease-status` so revokes and portal deactivations update local status. `POST /sync/push` requires a valid `leaseToken`.
- **Flow (current desktop contract):**
  1. Collect local rows where `sync_status != 'SYNCED'`.
  2. `POST /sync/push` with grouped tables payload and `leaseToken`.
  3. Server upserts by stable client `id` (or `key` for settings).
  4. Server returns `synced` and optional `failed` IDs per table.
  5. Client marks rows `SYNCED` or `FAILED`.
- **Conflict rule (recommended):** last-write-wins by `updated_at` per `id`, with audit log on the server.

### `POST /sync/push`

Request body:

```json
{
  "sentAt": "2026-05-25T20:00:00.000Z",
  "deviceId": "sepela-desktop",
  "source": "sqlite",
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

Success response:

```json
{
  "ok": true,
  "message": "Cloud sync completed.",
  "synced": {
    "products": ["prd_123"],
    "customers": [],
    "suppliers": [],
    "sales": ["inv_123"],
    "purchases": [],
    "settings": ["app_settings"],
    "stockSnapshots": []
  },
  "failed": {
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

## Portal

The online portal UI and auth are **out of scope** for this repo until offline-first is stable. This app only prepares schema and `listPendingSync()` for a future worker.
