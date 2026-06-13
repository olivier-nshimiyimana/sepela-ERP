import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../db.js";
import type { PortalAdminContext } from "./auth.js";

const SENSITIVE_KEYS = new Set(["password", "passwordHash", "password_hash", "passwordSalt", "password_salt"]);

export type AuditLogInput = {
  adminId?: string | null;
  adminUsername?: string | null;
  action: string;
  method: string;
  path: string;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  statusCode?: number | null;
  details?: Record<string, unknown> | null;
};

export function sanitizeAuditDetails(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    details[key] = SENSITIVE_KEYS.has(key) ? "[redacted]" : entry;
  }
  return Object.keys(details).length ? details : null;
}

export async function recordPortalAudit(input: AuditLogInput): Promise<void> {
  await pool.query(
    `INSERT INTO portal_admin_audit_log (
       admin_id, admin_username, action, method, path,
       target_type, target_id, ip_address, status_code, details
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.adminId ?? null,
      input.adminUsername ?? null,
      input.action,
      input.method,
      input.path,
      input.targetType ?? null,
      input.targetId ?? null,
      input.ipAddress ?? null,
      input.statusCode ?? null,
      input.details ? JSON.stringify(input.details) : null,
    ]
  );
}

function inferTarget(path: string, params: Record<string, string | undefined>) {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] !== "admin") return { targetType: null, targetId: null };

  const resource = segments[1] ?? null;
  const id = params.id ?? segments[2] ?? null;
  if (!resource || resource === "auth" || resource === "overview") {
    return { targetType: null, targetId: null };
  }

  return {
    targetType: resource.replace(/-/g, "_"),
    targetId: id && id !== "username-available" ? id : null,
  };
}

function actionLabel(method: string, path: string) {
  const resource = path.split("/").filter(Boolean).slice(1).join("/") || "admin";
  if (method === "POST") return `create_${resource.replace(/\//g, "_")}`;
  if (method === "PATCH") return `update_${resource.replace(/\//g, "_")}`;
  if (method === "DELETE") return `delete_${resource.replace(/\//g, "_")}`;
  return `${method.toLowerCase()}_${resource.replace(/\//g, "_")}`;
}

const SKIPPED_AUDIT_PATHS = new Set([
  "/admin/auth/login",
  "/admin/auth/logout",
  "/admin/auth/refresh",
  "/admin/audit-log",
]);

export function registerAdminAuditHook(app: FastifyInstance): void {
  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method;
    if (!["POST", "PATCH", "DELETE"].includes(method)) return;

    const path = (request.routeOptions?.url ?? request.url).split("?")[0];
    if (!path.startsWith("/admin") || SKIPPED_AUDIT_PATHS.has(path)) return;

    const admin = (request as FastifyRequest & { portalAdmin?: PortalAdminContext }).portalAdmin;
    if (!admin) return;

    const params = (request.params ?? {}) as Record<string, string | undefined>;
    const { targetType, targetId } = inferTarget(path, params);

    try {
      await recordPortalAudit({
        adminId: admin.id,
        adminUsername: admin.username,
        action: actionLabel(method, path),
        method,
        path,
        targetType,
        targetId,
        ipAddress: request.ip || null,
        statusCode: reply.statusCode,
        details:
          reply.statusCode < 400
            ? sanitizeAuditDetails(request.body)
            : { error: reply.statusCode >= 500 ? "server_error" : "request_failed" },
      });
    } catch (error) {
      request.log.error({ err: error }, "Failed to write portal audit log.");
    }
  });
}

export function mapAuditRow(row: {
  id: string;
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  method: string;
  path: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  status_code: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}) {
  return {
    id: row.id,
    adminId: row.admin_id,
    adminUsername: row.admin_username,
    action: row.action,
    method: row.method,
    path: row.path,
    targetType: row.target_type,
    targetId: row.target_id,
    ipAddress: row.ip_address,
    statusCode: row.status_code,
    details: row.details,
    createdAt: row.created_at,
  };
}

type AuditQuery = {
  limit: number;
  before?: string;
  action?: string;
};

export async function fetchAuditEntries(query: AuditQuery) {
  const values: unknown[] = [query.limit + 1];
  let sql = `
    SELECT id, admin_id, admin_username, action, method, path,
           target_type, target_id, ip_address, status_code, details, created_at
    FROM portal_admin_audit_log
    WHERE 1=1`;

  if (query.before) {
    values.push(query.before);
    sql += ` AND created_at < $${values.length}`;
  }
  if (query.action) {
    values.push(query.action);
    sql += ` AND action = $${values.length}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $1`;

  const result = await pool.query(sql, values);
  const rows = result.rows.map(mapAuditRow);
  const hasMore = rows.length > query.limit;
  const auditLog = hasMore ? rows.slice(0, query.limit) : rows;
  const nextBefore = hasMore ? auditLog[auditLog.length - 1]?.createdAt ?? null : null;

  return { auditLog, hasMore, nextBefore };
}
