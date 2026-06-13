import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTransaction } from "../db.js";
import { assertPortalAdmin, assertPortalToken } from "./auth.js";
import { assertSyncLeaseAllowed } from "./deviceLease.js";

const syncTablesSchema = z.object({
  products: z.array(z.record(z.string(), z.unknown())).default([]),
  customers: z.array(z.record(z.string(), z.unknown())).default([]),
  suppliers: z.array(z.record(z.string(), z.unknown())).default([]),
  sales: z.array(z.record(z.string(), z.unknown())).default([]),
  purchases: z.array(z.record(z.string(), z.unknown())).default([]),
  settings: z.array(z.record(z.string(), z.unknown())).default([]),
  stockSnapshots: z.array(z.record(z.string(), z.unknown())).default([]),
  productCategories: z.array(z.record(z.string(), z.unknown())).default([]),
  promotions: z.array(z.record(z.string(), z.unknown())).default([]),
});

const syncPushSchema = z.object({
  sentAt: z.string().datetime().optional(),
  deviceId: z.string().min(2),
  source: z.string().min(2).default("desktop"),
  merchantCode: z.string().min(2).default("default-merchant"),
  branchCode: z.string().min(2).default("default-branch"),
  leaseToken: z.string().uuid().optional(),
  tables: syncTablesSchema,
});

const listQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/sync-ingestions", async (request, reply) => {
    await assertPortalAdmin(request);
    const query = listQuery.parse(request.query);

    const result = await withTransaction(async (client) => {
      const rows = await client.query(
        `SELECT
           id,
           device_code,
           source,
           sent_at,
           received_at,
           request_json,
           result_json
         FROM sync_ingestions
         ORDER BY received_at DESC
         LIMIT $1`,
        [query.limit]
      );

      return rows.rows.map((row) => {
        const resultJson = row.result_json ?? {};
        const requestJson = row.request_json ?? {};
        const synced = resultJson.synced ?? {};
        const failed = resultJson.failed ?? {};
        return {
          id: row.id,
          deviceCode: row.device_code,
          source: row.source,
          sentAt: row.sent_at,
          receivedAt: row.received_at,
          merchantCode: requestJson.merchantCode ?? null,
          branchCode: requestJson.branchCode ?? null,
          syncedCount: countResultItems(synced),
          failedCount: countResultItems(failed),
          synced,
          failed,
        };
      });
    });

    return reply.send({ ok: true, syncIngestions: result });
  });

  app.post("/sync/push", async (request, reply) => {
    assertPortalToken(request);
    const body = syncPushSchema.parse(request.body);

    const result = await withTransaction(async (client) => {
      const leaseStatus = await assertSyncLeaseAllowed(client, {
        leaseToken: body.leaseToken,
        merchantCode: body.merchantCode,
        branchCode: body.branchCode,
        deviceCode: body.deviceId,
      });
      if (!leaseStatus.allowed) {
        throw new Error(`FORBIDDEN: ${leaseStatus.reason ?? "Cloud activation is not valid."}`);
      }

      const synced = emptySyncResult();
      const failed = emptySyncResult();

      await ensureTenantShell(client, body.merchantCode, body.branchCode, body.deviceId);

      for (const row of body.tables.products) {
        const productId = readKey(row, "id");
        await upsertByUpdatedAt(client, {
          table: "sync_products",
          keyColumn: "id",
          keyValue: productId,
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.products,
          failedBucket: failed.products,
        });
        if (productId && !failed.products.includes(productId)) {
          await upsertCloudInventoryBreakdown(client, {
            merchantCode: body.merchantCode,
            productId,
            payload: row,
            updatedAt: readUpdatedAt(row),
          });
        }
      }

      for (const row of body.tables.customers) {
        await upsertByUpdatedAt(client, {
          table: "sync_customers",
          keyColumn: "id",
          keyValue: readKey(row, "id"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.customers,
          failedBucket: failed.customers,
        });
      }

      for (const row of body.tables.suppliers) {
        await upsertByUpdatedAt(client, {
          table: "sync_suppliers",
          keyColumn: "id",
          keyValue: readKey(row, "id"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.suppliers,
          failedBucket: failed.suppliers,
        });
      }

      for (const row of body.tables.sales) {
        await upsertByUpdatedAt(client, {
          table: "sync_sales",
          keyColumn: "id",
          keyValue: readKey(row, "id"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.sales,
          failedBucket: failed.sales,
          extraColumns: {
            invoice_number: typeof row.invoiceNumber === "string" ? row.invoiceNumber : null,
          },
        });
      }

      for (const row of body.tables.purchases) {
        await upsertByUpdatedAt(client, {
          table: "sync_purchases",
          keyColumn: "id",
          keyValue: readKey(row, "id"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.purchases,
          failedBucket: failed.purchases,
        });
      }

      for (const row of body.tables.settings) {
        await upsertByUpdatedAt(client, {
          table: "sync_settings",
          keyColumn: "key",
          keyValue: readKey(row, "key"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.settings,
          failedBucket: failed.settings,
        });
      }

      for (const row of body.tables.stockSnapshots) {
        await upsertByUpdatedAt(client, {
          table: "sync_stock_snapshots",
          keyColumn: "id",
          keyValue: readKey(row, "id"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.stockSnapshots,
          failedBucket: failed.stockSnapshots,
        });
      }

      for (const row of body.tables.productCategories) {
        await upsertByUpdatedAt(client, {
          table: "sync_product_categories",
          keyColumn: "id",
          keyValue: readKey(row, "id"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.productCategories,
          failedBucket: failed.productCategories,
        });
      }

      for (const row of body.tables.promotions) {
        await upsertByUpdatedAt(client, {
          table: "sync_promotions",
          keyColumn: "id",
          keyValue: readKey(row, "id"),
          payload: row,
          merchantCode: body.merchantCode,
          branchCode: body.branchCode,
          deviceCode: body.deviceId,
          syncedBucket: synced.promotions,
          failedBucket: failed.promotions,
        });
      }

      await client.query(
        `INSERT INTO sync_ingestions (device_code, source, sent_at, request_json, result_json)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
        [body.deviceId, body.source, body.sentAt ?? null, JSON.stringify(body), JSON.stringify({ synced, failed })]
      );

      return { synced, failed };
    });

    return reply.send({
      ok: true,
      message: "Cloud sync completed.",
      synced: result.synced,
      failed: result.failed,
    });
  });
};

type UpsertArgs = {
  table: string;
  keyColumn: "id" | "key";
  keyValue: string;
  payload: Record<string, unknown>;
  merchantCode: string;
  branchCode: string;
  deviceCode: string;
  syncedBucket: string[];
  failedBucket: string[];
  extraColumns?: Record<string, string | null>;
};

async function upsertByUpdatedAt(client: import("pg").PoolClient, args: UpsertArgs): Promise<void> {
  try {
    if (!args.keyValue) {
      args.failedBucket.push("(missing-key)");
      return;
    }

    const nextUpdatedAt = readUpdatedAt(args.payload);
    const existing = await client.query(
      `SELECT updated_at
       FROM ${args.table}
       WHERE merchant_code = $1 AND branch_code = $2 AND device_code = $3 AND ${args.keyColumn} = $4`,
      [args.merchantCode, args.branchCode, args.deviceCode, args.keyValue]
    );

    if (existing.rows[0] && new Date(existing.rows[0].updated_at).getTime() > nextUpdatedAt.getTime()) {
      args.syncedBucket.push(args.keyValue);
      return;
    }

    const extraEntries = Object.entries(args.extraColumns ?? {});
    const extraColumnNames = extraEntries.map(([column]) => column);
    const insertColumns = [
      "merchant_code",
      "branch_code",
      "device_code",
      args.keyColumn,
      ...extraColumnNames,
      "payload",
      "updated_at",
    ];
    const insertValues = [
      args.merchantCode,
      args.branchCode,
      args.deviceCode,
      args.keyValue,
      ...extraEntries.map(([, value]) => value),
      JSON.stringify(args.payload),
      nextUpdatedAt.toISOString(),
    ];
    const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(", ");
    const extraUpdate = extraColumnNames.map((column) => `${column} = EXCLUDED.${column}`);
    const updateSet = [...extraUpdate, "payload = EXCLUDED.payload", "updated_at = EXCLUDED.updated_at"].join(", ");

    await client.query(
      `INSERT INTO ${args.table} (${insertColumns.join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (merchant_code, branch_code, device_code, ${args.keyColumn})
       DO UPDATE SET ${updateSet}`,
      insertValues
    );
    args.syncedBucket.push(args.keyValue);
  } catch {
    args.failedBucket.push(args.keyValue);
  }
}

async function ensureTenantShell(
  client: import("pg").PoolClient,
  merchantCode: string,
  branchCode: string,
  deviceCode: string
): Promise<void> {
  const merchant = await client.query(
    `INSERT INTO merchants (code, name)
     VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [merchantCode, merchantCode]
  );

  const branch = await client.query(
    `INSERT INTO branches (merchant_id, code, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (merchant_id, code) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [merchant.rows[0].id, branchCode, branchCode]
  );

  await client.query(
    `INSERT INTO devices (branch_id, device_code, label, last_seen_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (device_code) DO UPDATE SET branch_id = EXCLUDED.branch_id, last_seen_at = NOW(), updated_at = NOW()`,
    [branch.rows[0].id, deviceCode, deviceCode]
  );
}

function emptySyncResult() {
  return {
    products: [] as string[],
    customers: [] as string[],
    suppliers: [] as string[],
    sales: [] as string[],
    purchases: [] as string[],
    settings: [] as string[],
    stockSnapshots: [] as string[],
    productCategories: [] as string[],
    promotions: [] as string[],
  };
}

function readKey(row: Record<string, unknown>, field: "id" | "key"): string {
  const value = row[field];
  return typeof value === "string" ? value : "";
}

function readUpdatedAt(row: Record<string, unknown>): Date {
  const raw = row.updatedAt;
  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function countResultItems(value: Record<string, unknown>): number {
  return Object.values(value).reduce<number>(
    (sum, entry) => sum + (Array.isArray(entry) ? entry.length : 0),
    0
  );
}

type CloudBreakdownArgs = {
  merchantCode: string;
  productId: string;
  payload: Record<string, unknown>;
  updatedAt: Date;
};

async function upsertCloudInventoryBreakdown(
  client: import("pg").PoolClient,
  args: CloudBreakdownArgs
): Promise<void> {
  const buyUnit = readStringField(args.payload, ["buyUnit", "buy_unit"], "Unit");
  const buyUnitCost = readNumberField(args.payload, ["buyUnitCost", "buy_unit_cost"], 0);
  const qtyPerUnit = Math.max(1, Math.trunc(readNumberField(args.payload, ["qtyPerUnit", "qty_per_unit"], 1)));
  const itemSizeLabel = readStringField(args.payload, ["itemSizeLabel", "item_size_label"], "");
  const stockQuantityItems = Math.max(
    0,
    Math.trunc(
      readNumberField(args.payload, ["stockQuantityItems", "stock_quantity_items", "stock"], 0)
    )
  );
  const reorderLevelItems = Math.max(
    0,
    Math.trunc(readNumberField(args.payload, ["reorderLevelItems", "reorder_level_items"], 0))
  );

  await client.query(
    `INSERT INTO cloud_inventory_breakdown (
       merchant_code, product_id, buy_unit, buy_unit_cost, qty_per_unit, item_size_label,
       stock_quantity_items, reorder_level_items, updated_at, sync_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SYNCED')
     ON CONFLICT (merchant_code, product_id) DO UPDATE SET
       buy_unit = EXCLUDED.buy_unit,
       buy_unit_cost = EXCLUDED.buy_unit_cost,
       qty_per_unit = EXCLUDED.qty_per_unit,
       item_size_label = EXCLUDED.item_size_label,
       stock_quantity_items = EXCLUDED.stock_quantity_items,
       reorder_level_items = EXCLUDED.reorder_level_items,
       updated_at = EXCLUDED.updated_at,
       sync_status = 'SYNCED'`,
    [
      args.merchantCode,
      args.productId,
      buyUnit,
      buyUnitCost,
      qtyPerUnit,
      itemSizeLabel || null,
      stockQuantityItems,
      reorderLevelItems,
      args.updatedAt.toISOString(),
    ]
  );
}

function readStringField(
  row: Record<string, unknown>,
  keys: string[],
  fallback: string
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function readNumberField(
  row: Record<string, unknown>,
  keys: string[],
  fallback: number
): number {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}
