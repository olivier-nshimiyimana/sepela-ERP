import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createSalt, hashPassword, verifyPassword } from "../auth/password.js";
import { withTransaction } from "../db.js";
import {
  PORTAL_ADMIN_ROLES,
  assertPortalAdmin,
  assertSuperAdmin,
  extendPortalAdminSession,
} from "./auth.js";
import { fetchAuditEntries, recordPortalAudit } from "./auditLog.js";
import { auditRowsToCsv, trackLoginFailure } from "./securityAlerts.js";

const SESSION_HOURS = 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 12;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const loginBody = z.object({
  username: z.string().min(2).max(80),
  password: z.string().min(6).max(200),
});

const createPortalUserBody = z.object({
  username: z.string().min(2).max(80),
  displayName: z.string().min(2).max(120),
  password: z.string().min(6).max(200),
  role: z.enum(PORTAL_ADMIN_ROLES).default("admin"),
});

const patchPortalUserBody = z.object({
  displayName: z.string().min(2).max(120).optional(),
  password: z.string().min(6).max(200).optional(),
  role: z.enum(PORTAL_ADMIN_ROLES).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const usernameAvailabilityQuery = z.object({
  username: z.string().min(2).max(80),
});

const idParam = z.object({ id: z.string().uuid() });

const auditListQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  before: z.string().datetime().optional(),
  action: z.string().min(1).max(80).optional(),
});

const auditExportQuery = z.object({
  limit: z.coerce.number().int().positive().max(5000).default(2000),
  before: z.string().datetime().optional(),
  action: z.string().min(1).max(80).optional(),
});

function checkLoginRateLimit(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    throw new Error("UNAUTHORIZED: Too many login attempts. Try again later.");
  }
}

function mapPortalUser(row: {
  id: string;
  username: string;
  display_name: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const portalAdminRoutes: FastifyPluginAsync = async (app) => {
  app.post("/admin/auth/login", async (request, reply) => {
    const ip = request.ip || "unknown";
    checkLoginRateLimit(ip);
    const body = loginBody.parse(request.body);
    const username = body.username.trim().toLowerCase();

    const result = await withTransaction(async (client) => {
      const rowResult = await client.query(
        `SELECT id, username, display_name, role, password_salt, password_hash, status
         FROM portal_admins
         WHERE LOWER(username) = LOWER($1)`,
        [username]
      );
      const row = rowResult.rows[0];
      if (!row || row.status !== "ACTIVE") {
        await recordPortalAudit({
          adminUsername: username,
          action: "login_failed",
          method: "POST",
          path: "/admin/auth/login",
          ipAddress: ip,
          statusCode: 401,
          details: { reason: "invalid_credentials" },
        });
        await trackLoginFailure(ip, username);
        throw new Error("UNAUTHORIZED: Invalid username or password.");
      }
      if (!verifyPassword(body.password, row.password_salt, row.password_hash)) {
        await recordPortalAudit({
          adminId: row.id,
          adminUsername: row.username,
          action: "login_failed",
          method: "POST",
          path: "/admin/auth/login",
          ipAddress: ip,
          statusCode: 401,
          details: { reason: "invalid_credentials" },
        });
        await trackLoginFailure(ip, username);
        throw new Error("UNAUTHORIZED: Invalid username or password.");
      }

      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO portal_admin_sessions (admin_id, session_token, expires_at)
         VALUES ($1, $2, $3)`,
        [row.id, sessionToken, expiresAt.toISOString()]
      );
      await client.query(`UPDATE portal_admins SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [
        row.id,
      ]);

      return { row, sessionToken, expiresAt };
    });

    loginAttempts.delete(ip);

    await recordPortalAudit({
      adminId: result.row.id,
      adminUsername: result.row.username,
      action: "login_success",
      method: "POST",
      path: "/admin/auth/login",
      ipAddress: ip,
      statusCode: 200,
    });

    return reply.send({
      ok: true,
      sessionToken: result.sessionToken,
      sessionExpiresAt: result.expiresAt.toISOString(),
      user: mapPortalUser(result.row),
    });
  });

  app.post("/admin/auth/logout", async (request, reply) => {
    const admin = await assertPortalAdmin(request);
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM portal_admin_sessions WHERE session_token = $1`, [admin.sessionToken]);
    });
    await recordPortalAudit({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "logout",
      method: "POST",
      path: "/admin/auth/logout",
      ipAddress: request.ip || null,
      statusCode: 200,
    });
    return reply.send({ ok: true });
  });

  app.post("/admin/auth/refresh", async (request, reply) => {
    const admin = await assertPortalAdmin(request);
    const sessionExpiresAt = await extendPortalAdminSession(admin.sessionToken);
    if (!sessionExpiresAt) {
      throw new Error("UNAUTHORIZED: Portal admin session required.");
    }
    await recordPortalAudit({
      adminId: admin.id,
      adminUsername: admin.username,
      action: "session_refresh",
      method: "POST",
      path: "/admin/auth/refresh",
      ipAddress: request.ip || null,
      statusCode: 200,
    });
    return reply.send({ ok: true, sessionExpiresAt });
  });

  app.get("/admin/auth/me", async (request, reply) => {
    const admin = await assertPortalAdmin(request);
    return reply.send({
      ok: true,
      user: {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        role: admin.role,
      },
      sessionExpiresAt: admin.sessionExpiresAt,
    });
  });

  app.get("/admin/audit-log", async (request, reply) => {
    await assertPortalAdmin(request);
    const query = auditListQuery.parse(request.query);
    const result = await fetchAuditEntries(query);
    return reply.send({ ok: true, ...result });
  });

  app.get("/admin/audit-log/export", async (request, reply) => {
    await assertPortalAdmin(request);
    const query = auditExportQuery.parse(request.query);
    const result = await fetchAuditEntries(query);
    const csv = auditRowsToCsv(result.auditLog);
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="sepela-portal-audit-${stamp}.csv"`)
      .send(csv);
  });

  app.get("/admin/security-summary", async (request, reply) => {
    await assertPortalAdmin(request);

    const summary = await withTransaction(async (client) => {
      const [failedHour, alertsHour, topIps] = await Promise.all([
        client.query<{ count: number }>(
          `SELECT count(*)::int AS count
           FROM portal_admin_audit_log
           WHERE action = 'login_failed' AND created_at > NOW() - INTERVAL '1 hour'`
        ),
        client.query<{ count: number }>(
          `SELECT count(*)::int AS count
           FROM portal_admin_audit_log
           WHERE action = 'security_alert' AND created_at > NOW() - INTERVAL '24 hours'`
        ),
        client.query<{ ip_address: string; count: number }>(
          `SELECT ip_address, count(*)::int AS count
           FROM portal_admin_audit_log
           WHERE action = 'login_failed'
             AND created_at > NOW() - INTERVAL '1 hour'
             AND ip_address IS NOT NULL
           GROUP BY ip_address
           ORDER BY count DESC
           LIMIT 5`
        ),
      ]);

      return {
        failedLoginsLastHour: failedHour.rows[0]?.count ?? 0,
        securityAlertsLast24h: alertsHour.rows[0]?.count ?? 0,
        topFailedIps: topIps.rows.map((row) => ({
          ip: row.ip_address,
          count: row.count,
        })),
      };
    });

    return reply.send({ ok: true, summary });
  });

  app.get("/admin/portal-users/username-available", async (request, reply) => {
    await assertSuperAdmin(request);
    const query = usernameAvailabilityQuery.parse(request.query);
    const username = query.username.trim().toLowerCase();

    const existing = await withTransaction(async (client) => {
      const result = await client.query(
        `SELECT username FROM portal_admins WHERE LOWER(username) = LOWER($1) LIMIT 1`,
        [username]
      );
      return result.rows[0] ?? null;
    });

    return reply.send({
      ok: true,
      username,
      available: !existing,
    });
  });

  app.get("/admin/portal-users", async (request, reply) => {
    await assertSuperAdmin(request);

    const users = await withTransaction(async (client) => {
      const result = await client.query(
        `SELECT id, username, display_name, role, status, last_login_at, created_at, updated_at
         FROM portal_admins
         ORDER BY display_name ASC`
      );
      return result.rows;
    });

    return reply.send({
      ok: true,
      portalUsers: users.map(mapPortalUser),
    });
  });

  app.post("/admin/portal-users", async (request, reply) => {
    await assertSuperAdmin(request);
    const body = createPortalUserBody.parse(request.body);
    const username = body.username.trim().toLowerCase();
    const salt = createSalt();
    const passwordHash = hashPassword(body.password, salt);

    const user = await withTransaction(async (client) => {
      const clash = await client.query(`SELECT 1 FROM portal_admins WHERE LOWER(username) = LOWER($1) LIMIT 1`, [
        username,
      ]);
      if (clash.rows[0]) {
        throw new Error("CONFLICT: Username is already taken.");
      }

      const result = await client.query(
        `INSERT INTO portal_admins (username, display_name, role, password_salt, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, display_name, role, status, last_login_at, created_at, updated_at`,
        [username, body.displayName.trim(), body.role, salt, passwordHash]
      );
      return result.rows[0];
    });

    return reply.send({ ok: true, portalUser: mapPortalUser(user) });
  });

  app.patch("/admin/portal-users/:id", async (request, reply) => {
    const actor = await assertSuperAdmin(request);
    const { id } = idParam.parse(request.params);
    const body = patchPortalUserBody.parse(request.body);

    const user = await withTransaction(async (client) => {
      const existing = await client.query(`SELECT id, role FROM portal_admins WHERE id = $1`, [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Portal user not found.");

      if (existing.rows[0].role === "super_admin" && body.role && body.role !== "super_admin") {
        const superCount = await client.query(
          `SELECT count(*)::int AS count FROM portal_admins WHERE role = 'super_admin' AND status = 'ACTIVE'`
        );
        if ((superCount.rows[0]?.count ?? 0) <= 1) {
          throw new Error("BAD_REQUEST: Cannot demote the last active super admin.");
        }
      }

      if (id === actor.id && body.status === "INACTIVE") {
        throw new Error("BAD_REQUEST: You cannot deactivate your own account.");
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let index = 1;

      if (body.displayName !== undefined) {
        fields.push(`display_name = $${index++}`);
        values.push(body.displayName.trim());
      }
      if (body.role !== undefined) {
        fields.push(`role = $${index++}`);
        values.push(body.role);
      }
      if (body.status !== undefined) {
        fields.push(`status = $${index++}`);
        values.push(body.status);
        if (body.status === "INACTIVE") {
          await client.query(`DELETE FROM portal_admin_sessions WHERE admin_id = $1`, [id]);
        }
      }
      if (body.password !== undefined) {
        const salt = createSalt();
        fields.push(`password_salt = $${index++}`);
        values.push(salt);
        fields.push(`password_hash = $${index++}`);
        values.push(hashPassword(body.password, salt));
        await client.query(`DELETE FROM portal_admin_sessions WHERE admin_id = $1`, [id]);
      }

      if (!fields.length) throw new Error("BAD_REQUEST: No fields to update.");

      fields.push("updated_at = NOW()");
      values.push(id);

      const result = await client.query(
        `UPDATE portal_admins SET ${fields.join(", ")} WHERE id = $${index}
         RETURNING id, username, display_name, role, status, last_login_at, created_at, updated_at`,
        values
      );
      return result.rows[0];
    });

    return reply.send({ ok: true, portalUser: mapPortalUser(user) });
  });

  app.delete("/admin/portal-users/:id", async (request, reply) => {
    const actor = await assertSuperAdmin(request);
    const { id } = idParam.parse(request.params);
    if (id === actor.id) {
      throw new Error("BAD_REQUEST: You cannot delete your own account.");
    }

    await withTransaction(async (client) => {
      const existing = await client.query(`SELECT id, role FROM portal_admins WHERE id = $1`, [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Portal user not found.");

      if (existing.rows[0].role === "super_admin") {
        const superCount = await client.query(
          `SELECT count(*)::int AS count FROM portal_admins WHERE role = 'super_admin' AND status = 'ACTIVE'`
        );
        if ((superCount.rows[0]?.count ?? 0) <= 1) {
          throw new Error("BAD_REQUEST: Cannot delete the last active super admin.");
        }
      }

      await client.query(`DELETE FROM portal_admins WHERE id = $1`, [id]);
    });

    return reply.send({ ok: true });
  });
};
