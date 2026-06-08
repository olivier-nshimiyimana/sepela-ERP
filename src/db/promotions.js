import { SYNC_STATUS } from "./schema";
import { dbExecute, dbSelect } from "./sqlParams";
import { nowIso } from "../utils/ids";

export const PROMOTION_TARGET_SCOPE = {
  ALL_PRODUCTS: "all_products",
  SPECIFIC_CATEGORY: "specific_category",
  SPECIFIC_PRODUCT: "specific_product",
};

export const PROMOTION_DISCOUNT_TYPE = {
  PERCENTAGE: "percentage",
  FIXED_AMOUNT: "fixed_amount",
};

const MIGRATION_KEY = "promotions_v9";

export const PRODUCT_CATEGORIES_DDL = `CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  merchant_code TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'FAILED')),
  UNIQUE (merchant_code, code)
)`;

export const PROMOTIONS_DDL = `CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  merchant_code TEXT NOT NULL,
  name TEXT NOT NULL,
  target_scope TEXT NOT NULL CHECK (target_scope IN ('all_products', 'specific_category', 'specific_product')),
  category_id TEXT,
  product_id TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value REAL NOT NULL CHECK (discount_value >= 0),
  client_tier TEXT,
  min_order_amount REAL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('SYNCED', 'PENDING', 'FAILED')),
  FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
)`;

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_product_categories_merchant ON product_categories(merchant_code)`,
  `CREATE INDEX IF NOT EXISTS idx_product_categories_sync ON product_categories(sync_status)`,
  `CREATE INDEX IF NOT EXISTS idx_promotions_merchant ON promotions(merchant_code)`,
  `CREATE INDEX IF NOT EXISTS idx_promotions_sync ON promotions(sync_status)`,
  `CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON promotions(merchant_code, is_active, start_date, end_date)`,
];

export function rowToProductCategory(row) {
  return {
    id: row.id,
    merchantCode: row.merchant_code,
    name: row.name,
    code: row.code,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
  };
}

export function rowToPromotion(row) {
  return {
    id: row.id,
    merchantCode: row.merchant_code,
    name: row.name,
    targetScope: row.target_scope,
    categoryId: row.category_id ?? null,
    productId: row.product_id ?? null,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value) || 0,
    clientTier: row.client_tier ?? null,
    minOrderAmount:
      row.min_order_amount == null || row.min_order_amount === ""
        ? null
        : Number(row.min_order_amount),
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active === 1 || row.is_active === true,
    updatedAt: row.updated_at,
    syncStatus: row.sync_status,
  };
}

export function promotionToRow(promotion, merchantCode, ts = nowIso()) {
  return {
    id: promotion.id,
    merchant_code: merchantCode,
    name: String(promotion.name ?? "").trim(),
    target_scope: promotion.targetScope,
    category_id: promotion.categoryId ?? null,
    product_id: promotion.productId ?? null,
    discount_type: promotion.discountType,
    discount_value: Number(promotion.discountValue) || 0,
    client_tier: promotion.clientTier ? String(promotion.clientTier).trim() : null,
    min_order_amount:
      promotion.minOrderAmount == null || promotion.minOrderAmount === ""
        ? null
        : Number(promotion.minOrderAmount),
    start_date: promotion.startDate,
    end_date: promotion.endDate,
    is_active: promotion.isActive === false ? 0 : 1,
    updated_at: promotion.updatedAt ?? ts,
    sync_status: promotion.syncStatus ?? SYNC_STATUS.PENDING,
  };
}

export async function migratePromotionsSchema(db, ensureColumn) {
  await db.execute(PRODUCT_CATEGORIES_DDL);
  await db.execute(PROMOTIONS_DDL);
  for (const sql of INDEXES) {
    await db.execute(sql);
  }

  await ensureColumn(db, "products", "category_id", "TEXT");
  await ensureColumn(db, "customers", "client_tier", "TEXT");
  await ensureColumn(db, "sales", "promotion_discount_usd", "REAL DEFAULT 0");
  await ensureColumn(db, "sales", "applied_promotion_id", "TEXT");

  const done = await dbSelect(db, "SELECT value FROM app_meta WHERE key = ?", [MIGRATION_KEY]);
  if (done[0]?.value === "1") return;

  const ts = nowIso();
  await dbExecute(
    db,
    `INSERT INTO app_meta (key, value, updated_at, sync_status)
     VALUES (?, '1', ?, 'SYNCED')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [MIGRATION_KEY, ts]
  );
}

export async function loadProductCategories(db, merchantCode) {
  const rows = await dbSelect(
    db,
    `SELECT id, merchant_code, name, code, updated_at, sync_status
     FROM product_categories
     WHERE merchant_code = ?
     ORDER BY lower(name)`,
    [merchantCode]
  );
  return rows.map(rowToProductCategory);
}

export async function loadPromotions(db, merchantCode) {
  const rows = await dbSelect(
    db,
    `SELECT id, merchant_code, name, target_scope, category_id, product_id,
            discount_type, discount_value, client_tier, min_order_amount,
            start_date, end_date, is_active, updated_at, sync_status
     FROM promotions
     WHERE merchant_code = ?
     ORDER BY start_date DESC, lower(name)`,
    [merchantCode]
  );
  return rows.map(rowToPromotion);
}

export async function upsertProductCategory(db, merchantCode, category) {
  const ts = nowIso();
  const id = category.id;
  await dbExecute(
    db,
    `INSERT INTO product_categories (id, merchant_code, name, code, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       code = excluded.code,
       updated_at = excluded.updated_at,
       sync_status = excluded.sync_status`,
    [
      id,
      merchantCode,
      String(category.name ?? "").trim(),
      String(category.code ?? "").trim(),
      category.updatedAt ?? ts,
      category.syncStatus ?? SYNC_STATUS.PENDING,
    ]
  );
  return rowToProductCategory({
    id,
    merchant_code: merchantCode,
    name: category.name,
    code: category.code,
    updated_at: category.updatedAt ?? ts,
    sync_status: category.syncStatus ?? SYNC_STATUS.PENDING,
  });
}

export async function upsertPromotion(db, merchantCode, promotion) {
  const row = promotionToRow(promotion, merchantCode);
  await dbExecute(
    db,
    `INSERT INTO promotions (
       id, merchant_code, name, target_scope, category_id, product_id,
       discount_type, discount_value, client_tier, min_order_amount,
       start_date, end_date, is_active, updated_at, sync_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       target_scope = excluded.target_scope,
       category_id = excluded.category_id,
       product_id = excluded.product_id,
       discount_type = excluded.discount_type,
       discount_value = excluded.discount_value,
       client_tier = excluded.client_tier,
       min_order_amount = excluded.min_order_amount,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at,
       sync_status = excluded.sync_status`,
    [
      row.id,
      row.merchant_code,
      row.name,
      row.target_scope,
      row.category_id,
      row.product_id,
      row.discount_type,
      row.discount_value,
      row.client_tier,
      row.min_order_amount,
      row.start_date,
      row.end_date,
      row.is_active,
      row.updated_at,
      row.sync_status,
    ]
  );
  return rowToPromotion(row);
}

export async function deletePromotion(db, id) {
  await dbExecute(db, "DELETE FROM promotions WHERE id = ?", [id]);
}
