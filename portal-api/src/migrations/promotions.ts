import type { Pool } from "pg";

export async function migratePromotions(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_product_categories (
      merchant_code TEXT NOT NULL,
      branch_code TEXT NOT NULL,
      device_code TEXT NOT NULL,
      id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (merchant_code, branch_code, device_code, id)
    );

    CREATE TABLE IF NOT EXISTS sync_promotions (
      merchant_code TEXT NOT NULL,
      branch_code TEXT NOT NULL,
      device_code TEXT NOT NULL,
      id TEXT NOT NULL,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (merchant_code, branch_code, device_code, id)
    );
  `);
}
