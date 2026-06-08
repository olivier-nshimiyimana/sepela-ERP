import { invoke } from "@tauri-apps/api/core";
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from "./schema";
import { migrateInventoryBreakdown } from "./inventoryBreakdown";
import { migratePromotionsSchema } from "./promotions";
import { migrateTenantColumns } from "./tenant";
import { dbExecute, dbSelect } from "./sqlParams";

let dbInstance = null;
let dbUriPromise = null;

/** Tauri 2 sets `globalThis.isTauri` — do not rely on __TAURI_INTERNALS__ alone. */
export function isTauriRuntime() {
  try {
    if (typeof globalThis !== "undefined" && globalThis.isTauri === true) return true;
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function resolveDatabaseUri() {
  if (!isTauriRuntime()) return null;
  if (!dbUriPromise) {
    dbUriPromise = invoke("sepela_database_connection_uri");
  }
  return dbUriPromise;
}

export async function getDatabaseFilePath() {
  if (!isTauriRuntime()) return null;
  return invoke("sepela_database_file_path");
}

export async function getDatabase() {
  if (dbInstance) return dbInstance;
  if (!isTauriRuntime()) return null;

  const Database = (await import("@tauri-apps/plugin-sql")).default;
  const uri = await resolveDatabaseUri();
  dbInstance = await Database.load(uri);
  return dbInstance;
}

export async function runSchemaMigrations(db) {
  for (const sql of CREATE_TABLES_SQL) {
    await db.execute(sql);
  }
  await ensureColumn(db, "sales", "customer_id", "TEXT");
  await ensureColumn(db, "sales", "customer_name", "TEXT");
  await ensureColumn(db, "sales", "customer_phone", "TEXT");
  await ensureColumn(db, "sales", "customer_address", "TEXT");
  await ensureColumn(db, "sales", "customer_email", "TEXT");
  await ensureColumn(db, "sales", "customer_tax_number", "TEXT");
  await ensureColumn(db, "customers", "address", "TEXT");
  await ensureColumn(db, "customers", "email", "TEXT");
  await ensureColumn(db, "customers", "tax_number", "TEXT");
  await migrateInventoryBreakdown(db);
  await migratePromotionsSchema(db, ensureColumn);
  await migrateTenantColumns(db, ensureColumn);
  const ts = new Date().toISOString();
  await dbExecute(
    db,
    `INSERT INTO app_meta (key, value, updated_at, sync_status)
     VALUES ('schema_version', ?, ?, 'SYNCED')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [String(SCHEMA_VERSION), ts]
  );
}

async function ensureColumn(db, table, column, definition) {
  const exists = await dbSelect(
    db,
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table]
  );
  if (!exists.length) return;

  const rows = await dbSelect(db, `PRAGMA table_info(${table})`);
  if (rows.some((row) => row.name === column)) return;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function getMeta(db, key) {
  const rows = await dbSelect(db, "SELECT value FROM app_meta WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}
