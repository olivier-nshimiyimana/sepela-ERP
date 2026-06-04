import { DEFAULT_INVOICE_PROFILE } from "../data/defaultInvoiceProfile";
import { DEFAULT_EXPIRY_ALERT_DAYS } from "../utils/productExpiry";
import { newEntityId, nowIso } from "../utils/ids";
import {
  receiptContextForNewSale,
  TRANSACTION_TYPES,
} from "../domain/receiptTransaction";
import { SYNC_STATUS } from "./schema";
import { dbExecute, dbSelect } from "./sqlParams";

const LS_KEYS = {
  products: "sepela-products",
  sales: "sepela-sales",
  customers: "sepela-customers",
  rate: "sepela-exchange-rate",
  expiry: "sepela-expiry-alert-days",
  invoice: "sepela-invoice-profile",
  counter: "sepela-invoice-counter",
  training: "sepela-training-mode",
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function rowFromLegacySale(sale, productIdMap) {
  const ts = nowIso();
  const isRefunded = sale.status === "refunded";
  const ctx = receiptContextForNewSale({
    trainingMode: sale.receiptType === "TRAINING",
  });

  return {
    sale: {
      id: sale.id?.startsWith("sale-") ? newEntityId("inv") : sale.id || newEntityId("inv"),
      invoice_number: sale.invoiceNumber ?? sale.id,
      timestamp: sale.timestamp ?? ts,
      status: sale.status ?? "completed",
      receipt_type: sale.receiptType ?? ctx.receiptType,
      transaction_type: isRefunded ? TRANSACTION_TYPES.SALES : ctx.transactionType,
      sdc_receipt_code: sale.sdcReceiptCode ?? ctx.sdcReceiptCode,
      copy_index: sale.copyIndex ?? 0,
      method: sale.method ?? null,
      method_label: sale.methodLabel ?? null,
      total_usd: sale.totalUSD ?? 0,
      total_cdf: sale.totalCDF ?? 0,
      change_due_usd: sale.changeDueUSD ?? 0,
      amount_received: sale.amountReceived ?? null,
      reference: sale.reference ?? null,
      card_last_four: sale.cardLastFour ?? null,
      cashier_id: sale.cashierId ?? null,
      cashier_name: sale.cashierName ?? null,
      customer_id: sale.customerId ?? null,
      customer_name: sale.customerName ?? null,
      customer_phone: sale.customerPhone ?? null,
      customer_address: sale.customerAddress ?? null,
      customer_email: sale.customerEmail ?? null,
      customer_tax_number: sale.customerTaxNumber ?? null,
      exchange_rate: sale.exchangeRate ?? null,
      refund_at: sale.refund?.at ?? null,
      refund_reason: sale.refund?.reason ?? null,
      refund_restore_stock: sale.refund?.restoreStock ? 1 : 0,
      refund_by_user_id: sale.refund?.byUserId ?? null,
      refund_by_user_name: sale.refund?.byUserName ?? null,
      updated_at: ts,
      sync_status: SYNC_STATUS.PENDING,
    },
    items: (sale.items ?? []).map((it) => ({
      id: newEntityId("line"),
      sale_id: null,
      product_id: productIdMap.get(it.productId) ?? String(it.productId ?? ""),
      name: it.name,
      lot_number: it.lotNumber ?? null,
      expiration_date: it.expirationDate ?? null,
      price: it.price ?? 0,
      qty: it.qty ?? 0,
      updated_at: ts,
      sync_status: SYNC_STATUS.PENDING,
    })),
  };
}

export async function migrateFromLocalStorageIfNeeded(db) {
  const done = await dbSelect(db, "SELECT value FROM app_meta WHERE key = 'ls_migrated'");
  if (done[0]?.value === "1") return { migrated: false };

  const ts = nowIso();
  const productIdMap = new Map();

  const legacyProducts = readJson(LS_KEYS.products, []);
  for (const p of legacyProducts) {
    const id = newEntityId("prd");
    productIdMap.set(p.id, id);
    await dbExecute(
      db,
      `INSERT OR REPLACE INTO products (id, name, lot_number, expiration_date, price, stock, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        p.name,
        p.lotNumber ?? null,
        p.expirationDate ?? null,
        p.price ?? 0,
        p.stock ?? 0,
        ts,
        SYNC_STATUS.PENDING,
      ]
    );
  }

  const legacyCustomers = readJson(LS_KEYS.customers, []);
  for (const customer of legacyCustomers) {
    if (!customer?.name?.trim()) continue;
    await dbExecute(
      db,
      `INSERT OR REPLACE INTO customers (id, name, phone, address, email, tax_number, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer.id || newEntityId("cus"),
        customer.name.trim(),
        customer.phone?.trim() || null,
        customer.address?.trim() || null,
        customer.email?.trim() || null,
        customer.taxNumber?.trim() || null,
        ts,
        SYNC_STATUS.PENDING,
      ]
    );
  }

  const legacySales = readJson(LS_KEYS.sales, []);
  for (const legacy of legacySales) {
    const { sale, items } = rowFromLegacySale(legacy, productIdMap);
    for (const it of items) it.sale_id = sale.id;

    await dbExecute(
      db,
      `INSERT OR REPLACE INTO sales (
        id, invoice_number, timestamp, status, receipt_type, transaction_type, sdc_receipt_code,
        copy_index, method, method_label, total_usd, total_cdf, change_due_usd, amount_received,
        reference, card_last_four, cashier_id, cashier_name, customer_id, customer_name, customer_phone,
        customer_address, customer_email, customer_tax_number, exchange_rate,
        refund_at, refund_reason, refund_restore_stock, refund_by_user_id, refund_by_user_name,
        updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sale.id,
        sale.invoice_number,
        sale.timestamp,
        sale.status,
        sale.receipt_type,
        sale.transaction_type,
        sale.sdc_receipt_code,
        sale.copy_index,
        sale.method,
        sale.method_label,
        sale.total_usd,
        sale.total_cdf,
        sale.change_due_usd,
        sale.amount_received,
        sale.reference,
        sale.card_last_four,
        sale.cashier_id,
        sale.cashier_name,
        sale.customer_id,
        sale.customer_name,
        sale.customer_phone,
        sale.customer_address,
        sale.customer_email,
        sale.customer_tax_number,
        sale.exchange_rate,
        sale.refund_at,
        sale.refund_reason,
        sale.refund_restore_stock,
        sale.refund_by_user_id,
        sale.refund_by_user_name,
        sale.updated_at,
        sale.sync_status,
      ]
    );

    for (const it of items) {
      await dbExecute(
      db,
        `INSERT OR REPLACE INTO sale_items (
          id, sale_id, product_id, name, lot_number, expiration_date, price, qty, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          it.id,
          it.sale_id,
          it.product_id,
          it.name,
          it.lot_number,
          it.expiration_date,
          it.price,
          it.qty,
          it.updated_at,
          it.sync_status,
        ]
      );
    }
  }

  const settings = {
    exchangeRate: readJson(LS_KEYS.rate, 2850),
    expiryAlertDays: readJson(LS_KEYS.expiry, DEFAULT_EXPIRY_ALERT_DAYS),
    invoiceProfile: readJson(LS_KEYS.invoice, DEFAULT_INVOICE_PROFILE),
    invoiceCounter: parseInt(localStorage.getItem(LS_KEYS.counter) || "1", 10),
    trainingMode: readJson(LS_KEYS.training, false),
  };

  await dbExecute(
    db,
    `INSERT OR REPLACE INTO settings (key, value_json, updated_at, sync_status) VALUES (?, ?, ?, ?)`,
    ["app_settings", JSON.stringify(settings), ts, SYNC_STATUS.PENDING]
  );

  await dbExecute(
    db,
    `INSERT OR REPLACE INTO app_meta (key, value, updated_at, sync_status) VALUES ('ls_migrated', '1', ?, 'SYNCED')`,
    [ts]
  );

  try {
    localStorage.removeItem(LS_KEYS.products);
    localStorage.removeItem(LS_KEYS.customers);
  } catch {
    /* not in browser */
  }

  return { migrated: true };
}
