import { getMeta } from "./client";
import { dbExecute, dbSelect } from "./sqlParams";

export const ACTIVE_MERCHANT_KEY = "active_merchant_code";
export const ACTIVE_BRANCH_KEY = "active_branch_code";
export const CLOUD_SYNC_MERCHANT_CODE_KEY = "cloud_sync_merchant_code";
const TENANT_MIGRATION_KEY = "tenant_columns_v6";

const TENANT_TABLES = ["products", "customers", "suppliers", "sales", "purchase_orders", "stock_snapshots"];

function nowIso() {
  return new Date().toISOString();
}

async function upsertMeta(db, key, value) {
  const ts = nowIso();
  await dbExecute(
    db,
    `INSERT INTO app_meta (key, value, updated_at, sync_status)
     VALUES (?, ?, ?, 'SYNCED')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, ts]
  );
}

export async function getActiveTenant(db) {
  const merchantCode = String((await getMeta(db, ACTIVE_MERCHANT_KEY)) ?? "").trim() || "local";
  const branchCode = String((await getMeta(db, ACTIVE_BRANCH_KEY)) ?? "").trim();
  return { merchantCode, branchCode };
}

export async function setActiveTenant(db, { merchantCode, branchCode = "" }) {
  const code = String(merchantCode ?? "").trim() || "local";
  await upsertMeta(db, ACTIVE_MERCHANT_KEY, code);
  await upsertMeta(db, ACTIVE_BRANCH_KEY, String(branchCode ?? "").trim());
  return { merchantCode: code, branchCode: String(branchCode ?? "").trim() };
}

export async function migrateTenantColumns(db, ensureColumn) {
  for (const table of TENANT_TABLES) {
    await ensureColumn(db, table, "merchant_code", "TEXT NOT NULL DEFAULT 'local'");
  }

  if ((await getMeta(db, TENANT_MIGRATION_KEY)) === "1") {
    return;
  }

  const legacyMerchant =
    String((await getMeta(db, CLOUD_SYNC_MERCHANT_CODE_KEY)) ?? "").trim() || "local";

  for (const table of TENANT_TABLES) {
    await dbExecute(
      db,
      `UPDATE ${table} SET merchant_code = ? WHERE merchant_code IS NULL OR merchant_code = ''`,
      [legacyMerchant]
    );
    if (legacyMerchant !== "local") {
      await dbExecute(db, `UPDATE ${table} SET merchant_code = ? WHERE merchant_code = 'local'`, [
        legacyMerchant,
      ]);
    }
  }

  const active = await getMeta(db, ACTIVE_MERCHANT_KEY);
  if (!active) {
    await setActiveTenant(db, { merchantCode: legacyMerchant, branchCode: "" });
  }

  await upsertMeta(db, TENANT_MIGRATION_KEY, "1");
}
