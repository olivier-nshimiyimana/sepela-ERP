import type { Pool } from "pg";

/** Cloud schema: industry profiles + typed inventory breakdown (mirrors desktop SQLite). */
export async function migrateInventoryBreakdown(pool: Pool) {
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE industry_profile AS ENUM (
        'pharmacy',
        'restaurant_bar',
        'hotel',
        'general_retail'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await pool.query(`
    ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS industry_profile industry_profile NOT NULL DEFAULT 'general_retail';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cloud_inventory_breakdown (
      merchant_code TEXT NOT NULL,
      product_id TEXT NOT NULL,
      buy_unit TEXT NOT NULL DEFAULT 'Unit',
      buy_unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (buy_unit_cost >= 0),
      qty_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (qty_per_unit > 0),
      item_size_label TEXT,
      stock_quantity_items INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity_items >= 0),
      reorder_level_items INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level_items >= 0),
      item_unit_cost NUMERIC(18, 6) GENERATED ALWAYS AS (
        CASE WHEN qty_per_unit > 0 THEN buy_unit_cost / qty_per_unit ELSE 0 END
      ) STORED,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sync_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (sync_status IN ('SYNCED', 'PENDING', 'FAILED')),
      PRIMARY KEY (merchant_code, product_id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cloud_inventory_breakdown_sync
    ON cloud_inventory_breakdown (merchant_code, sync_status);
  `);
}
