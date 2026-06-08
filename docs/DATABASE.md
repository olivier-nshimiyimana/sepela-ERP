# Sepela ERP — Database architecture

## Where `sepela.db` lives (Windows)

The database is **not** under `C:\Program Files\Sepela ERP` — that folder is the read-only app install.

| Priority | Path |
|----------|------|
| Primary | `D:\SepelaERP\data\sepela.db` |
| Fallback (no `D:\` drive) | `C:\SepelaERP\data\sepela.db` |

On first launch, if the new path is empty but a legacy file exists at `%APPDATA%\com.sepela.erp\sepela.db`, the desktop app copies it once into the new location.

Browser-only dev (`npm run dev` in Chrome) still uses **localStorage**, not this SQLite file.

## Overview

Sepela ERP is **multi-tenant** and **offline-first**:

| Engine | Role |
|--------|------|
| **SQLite** (`sepela.db`) | Desktop POS, inventory, sales — authoritative while offline |
| **PostgreSQL** | Cloud portal — sync ingest, operator auth, merchant registry |

Products are **FEFO batch rows** (`lot_number`, `expiration_date`). Inventory quantity is tracked at the **single retail item** level via the universal **inventory breakdown** model.

## Industry profiles

Merchants are tagged with an industry profile for reporting and future UX—not separate product schemas.

| Value | Use case |
|-------|----------|
| `pharmacy` | Pharmacy |
| `restaurant_bar` | Restaurant / bar |
| `hotel` | Hotel |
| `general_retail` | General retail |

- **PostgreSQL:** `industry_profile` ENUM on `merchants`. Set in **Portal → Merchants** when creating or editing a merchant.
- **SQLite:** CHECK constraints where industry is stored locally.

## Inventory breakdown (universal model)

One `inventory_breakdown` row per product batch (`product_id` PK, FK with `ON DELETE CASCADE`).

### Field definitions

| Column (SQLite) | JS property | Definition |
|-----------------|-------------|------------|
| `buy_unit` | `buyUnit` | Wholesale packaging label (`Case`, `Box`, …) |
| `buy_unit_cost` | `buyUnitCost` | Price paid for one bulk package |
| `qty_per_unit` | `qtyPerUnit` | Items inside one bulk package (≥ 1) |
| `item_size_label` | `itemSizeLabel` | Descriptive size (`500mg capsule`, `16 oz pint`) |
| `stock_quantity_items` | `stockQuantityItems` | On-hand count of **individual items** |
| `reorder_level_items` | `reorderLevelItems` | Low-stock threshold in **items** |
| `item_unit_cost` | `itemUnitCost` | **Generated:** `buy_unit_cost / qty_per_unit` (0 if qty = 0) |

### Business rules

1. **Unit cost** — always derived; never manually stored on the client except via generated column.
2. **Sales** — deduct `stock_quantity_items` by line quantity; never whole buy units.
3. **Reorder** — dynamic: `REORDER` when `stock_quantity_items <= reorder_level_items`, else `OK`.
4. **Legacy `products.stock`** — mirrored from `stock_quantity_items` for older code paths.

### Cloud mirror

`cloud_inventory_breakdown` (PostgreSQL) stores the same fields keyed by `(merchant_code, product_id)`. Populated on `POST /sync/push` from the product JSON payload. Full product documents remain in `sync_products.payload`.

## SQLite schema version

Current `SCHEMA_VERSION`: **9** (promotions + product categories + `client_tier` / `category_id`).

### Promotions (schema v9)

| Table | Purpose |
|-------|---------|
| `product_categories` | Category codes for `specific_category` promotion scope |
| `promotions` | Conditional discount rules (percentage or fixed amount) |

Promotion fields: `target_scope` (`all_products` \| `specific_category` \| `specific_product`), `discount_type` (`percentage` \| `fixed_amount`), optional `client_tier`, optional `min_order_amount`, `start_date` / `end_date`, `is_active`.

POS evaluation (offline): `src/utils/promotionEngine.js` → `evaluateCartPromotions()`.

Cloud mirror: `sync_promotions`, `sync_product_categories` (PostgreSQL).

Migration copies existing `products.stock` into `stock_quantity_items` with defaults (`buy_unit = Unit`, `qty_per_unit = 1`).

## Sync tracking

All business tables include:

| Column | Values |
|--------|--------|
| `sync_status` | `SYNCED`, `PENDING`, `FAILED` |
| `updated_at` | ISO-8601 timestamp |

Local mutations set `PENDING`. Cloud push success sets `SYNCED` on both `products` and `inventory_breakdown`.

## Key files

| File | Purpose |
|------|---------|
| `src/utils/inventoryBreakdown.js` | Calculation helpers |
| `src/db/inventoryBreakdown.js` | DDL, migration, upsert, stock adjust |
| `src/contexts/DatabaseContext.jsx` | Load/join, CRUD, sync |
| `portal-api/src/migrations/inventoryBreakdown.ts` | Cloud enum + breakdown table |
| `portal-api/src/modules/syncRoutes.ts` | Ingest + `cloud_inventory_breakdown` upsert |

See [SYNC.md](./SYNC.md) for push protocol and payload shape.
