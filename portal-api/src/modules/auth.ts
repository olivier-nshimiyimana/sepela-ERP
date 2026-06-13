import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { pool } from "../db.js";

export const PORTAL_ADMIN_ROLES = ["super_admin", "admin", "read_only"] as const;
export type PortalAdminRole = (typeof PORTAL_ADMIN_ROLES)[number];

export type PortalAdminContext = {
  id: string;
  username: string;
  displayName: string;
  role: PortalAdminRole;
  sessionToken: string;
  sessionExpiresAt: string;
};

function attachPortalAdmin(request: FastifyRequest, admin: PortalAdminContext): PortalAdminContext {
  request.portalAdmin = admin;
  return admin;
}

export function assertPortalToken(request: FastifyRequest): void {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || token !== config.PORTAL_BEARER_TOKEN) {
    throw new Error("UNAUTHORIZED: Invalid portal bearer token.");
  }
}

function readAdminSessionToken(request: FastifyRequest): string {
  const header = request.headers["x-admin-session"];
  return typeof header === "string" ? header.trim() : "";
}

export async function resolvePortalAdmin(request: FastifyRequest): Promise<PortalAdminContext | null> {
  const sessionToken = readAdminSessionToken(request);
  if (!sessionToken) return null;

  const result = await pool.query(
    `SELECT a.id, a.username, a.display_name, a.role, a.status, s.session_token, s.expires_at
     FROM portal_admin_sessions s
     JOIN portal_admins a ON a.id = s.admin_id
     WHERE s.session_token = $1 AND s.expires_at > NOW()`,
    [sessionToken]
  );
  const row = result.rows[0];
  if (!row || row.status !== "ACTIVE") return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as PortalAdminRole,
    sessionToken: row.session_token,
    sessionExpiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function assertPortalAdmin(request: FastifyRequest): Promise<PortalAdminContext> {
  const admin = await resolvePortalAdmin(request);
  if (!admin) {
    throw new Error("UNAUTHORIZED: Portal admin session required.");
  }
  return attachPortalAdmin(request, admin);
}

export async function assertPortalAdminWrite(request: FastifyRequest): Promise<PortalAdminContext> {
  const admin = await assertPortalAdmin(request);
  if (admin.role === "read_only") {
    throw new Error("FORBIDDEN: Read-only portal access.");
  }
  return admin;
}

export async function assertSuperAdmin(request: FastifyRequest): Promise<PortalAdminContext> {
  const admin = await assertPortalAdmin(request);
  if (admin.role !== "super_admin") {
    throw new Error("FORBIDDEN: Super admin access required.");
  }
  return admin;
}

export async function extendPortalAdminSession(sessionToken: string): Promise<string | null> {
  const SESSION_HOURS = 12;
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const result = await pool.query(
    `UPDATE portal_admin_sessions
     SET expires_at = $2
     WHERE session_token = $1 AND expires_at > NOW()
     RETURNING expires_at`,
    [sessionToken, expiresAt.toISOString()]
  );
  const row = result.rows[0];
  if (!row) return null;
  return new Date(row.expires_at).toISOString();
}
