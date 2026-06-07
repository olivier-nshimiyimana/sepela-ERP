import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { withTransaction } from "../db.js";
import { assertPortalToken } from "./auth.js";

const SESSION_HEADER = "x-operator-session";

const branchesQuery = z.object({
  merchantCode: z.string().min(2).max(40),
});

const salesSummaryQuery = z.object({
  merchantCode: z.string().min(2).max(40),
  branchCode: z.string().min(2).max(40).optional(),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});

type OperatorSessionRow = {
  id: string;
  role: string;
  merchant_code: string;
  branch_code: string | null;
};

function readSessionToken(request: FastifyRequest) {
  const raw = request.headers[SESSION_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;
  return String(token ?? "").trim();
}

async function loadOperatorSession(client: PoolClient, sessionToken: string): Promise<OperatorSessionRow> {
  if (!sessionToken) {
    throw new Error("UNAUTHORIZED: Operator session is required.");
  }
  const result = await client.query(
    `SELECT o.id, o.role, m.code AS merchant_code, b.code AS branch_code
     FROM operator_sessions s
     JOIN operators o ON o.id = s.operator_id
     JOIN merchants m ON m.id = o.merchant_id
     LEFT JOIN branches b ON b.id = o.branch_id
     WHERE s.session_token = $1
       AND s.expires_at > NOW()
       AND o.status = 'ACTIVE'
       AND m.status = 'ACTIVE'
     LIMIT 1`,
    [sessionToken]
  );
  const row = result.rows[0] as OperatorSessionRow | undefined;
  if (!row) {
    throw new Error("UNAUTHORIZED: Session expired or invalid.");
  }
  if (row.role !== "boss") {
    throw new Error("FORBIDDEN: Only owner accounts can view company reports.");
  }
  return row;
}

function periodStart(period: "daily" | "weekly" | "monthly") {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "weekly") {
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
  } else if (period === "monthly") {
    start.setDate(1);
  }
  return start;
}

function mapSaleFromPayload(payload: Record<string, unknown>, branchCode: string, deviceCode: string) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    id: String(payload.id ?? ""),
    invoiceNumber: payload.invoiceNumber ?? payload.invoice_number ?? null,
    timestamp: payload.timestamp ?? payload.updatedAt ?? payload.updated_at ?? null,
    status: payload.status ?? "completed",
    method: payload.method ?? null,
    methodLabel: payload.methodLabel ?? payload.method_label ?? payload.method ?? "Unknown",
    totalUSD: Number(payload.totalUSD ?? payload.total_usd ?? 0) || 0,
    totalCDF: Number(payload.totalCDF ?? payload.total_cdf ?? 0) || 0,
    exchangeRate: Number(payload.exchangeRate ?? payload.exchange_rate ?? 0) || 0,
    cashierName: payload.cashierName ?? payload.cashier_name ?? null,
    branchCode,
    deviceCode,
    items: items.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        name: String(row.name ?? ""),
        qty: Number(row.qty ?? 0) || 0,
        price: Number(row.price ?? 0) || 0,
      };
    }),
  };
}

function aggregateSalesRows(sales: ReturnType<typeof mapSaleFromPayload>[]) {
  const byMethod: Record<string, number> = {};
  const productCounts: Record<string, number> = {};
  let totalUSD = 0;
  let totalCDF = 0;
  let count = 0;

  for (const sale of sales) {
    if (sale.status === "refunded") continue;
    count += 1;
    totalUSD += sale.totalUSD;
    totalCDF += sale.totalCDF;
    const method = String(sale.methodLabel ?? sale.method ?? "Unknown");
    byMethod[method] = (byMethod[method] ?? 0) + sale.totalUSD;
    for (const item of sale.items) {
      productCounts[item.name] = (productCounts[item.name] ?? 0) + item.qty;
    }
  }

  const topProducts = Object.entries(productCounts)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return { count, totalUSD, totalCDF, byMethod, topProducts };
}

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get("/tenant/branches", async (request, reply) => {
    assertPortalToken(request);
    const query = branchesQuery.parse(request.query);
    const sessionToken = readSessionToken(request);

    const branches = await withTransaction(async (client) => {
      const operator = await loadOperatorSession(client, sessionToken);
      if (operator.merchant_code !== query.merchantCode) {
        throw new Error("FORBIDDEN: Session does not match this merchant.");
      }
      const merchantCode = operator.merchant_code;

      const rows = await client.query(
        `SELECT b.id, b.code, b.name, b.city, b.country_code, b.status,
                count(d.id)::int AS device_count
         FROM branches b
         JOIN merchants m ON m.id = b.merchant_id
         LEFT JOIN devices d ON d.branch_id = b.id
         WHERE m.code = $1
         GROUP BY b.id
         ORDER BY b.name ASC`,
        [merchantCode]
      );
      return rows.rows;
    });

    return reply.send({
      ok: true,
      branches: branches.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        city: row.city,
        countryCode: row.country_code,
        status: row.status,
        deviceCount: row.device_count,
      })),
    });
  });

  app.get("/reports/sales-summary", async (request, reply) => {
    assertPortalToken(request);
    const query = salesSummaryQuery.parse(request.query);
    const sessionToken = readSessionToken(request);
    const from = periodStart(query.period);

    const result = await withTransaction(async (client) => {
      const operator = await loadOperatorSession(client, sessionToken);
      if (operator.merchant_code !== query.merchantCode) {
        throw new Error("FORBIDDEN: Session does not match this merchant.");
      }
      const merchantCode = operator.merchant_code;

      const branchFilter = query.branchCode?.trim() || null;
      const rows = await client.query(
        `SELECT branch_code, device_code, payload
         FROM sync_sales
         WHERE merchant_code = $1
           AND ($2::text IS NULL OR branch_code = $2)`,
        [merchantCode, branchFilter]
      );

      const sales = rows.rows
        .map((row) =>
          mapSaleFromPayload(
            (row.payload ?? {}) as Record<string, unknown>,
            row.branch_code,
            row.device_code
          )
        )
        .filter((sale) => {
          if (!sale.timestamp) return false;
          const ts = new Date(String(sale.timestamp));
          return !Number.isNaN(ts.getTime()) && ts.getTime() >= from.getTime();
        })
        .sort((a, b) => new Date(String(b.timestamp)).getTime() - new Date(String(a.timestamp)).getTime());

      const byBranch: Record<string, { branchCode: string; count: number; totalUSD: number; totalCDF: number }> =
        {};
      for (const sale of sales) {
        if (sale.status === "refunded") continue;
        const key = sale.branchCode || "unknown";
        if (!byBranch[key]) {
          byBranch[key] = { branchCode: key, count: 0, totalUSD: 0, totalCDF: 0 };
        }
        byBranch[key].count += 1;
        byBranch[key].totalUSD += sale.totalUSD;
        byBranch[key].totalCDF += sale.totalCDF;
      }

      return {
        period: query.period,
        periodFrom: from.toISOString(),
        branchCode: branchFilter,
        stats: aggregateSalesRows(sales),
        byBranch: Object.values(byBranch).sort((a, b) => b.totalUSD - a.totalUSD),
        recentSales: sales.slice(0, 50),
      };
    });

    return reply.send({ ok: true, ...result });
  });
};
