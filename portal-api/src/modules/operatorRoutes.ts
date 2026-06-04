import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createSalt, hashPassword, verifyPassword } from "../auth/password.js";
import { withTransaction } from "../db.js";
import { fetchActiveLeaseForOperator, fetchLeaseStatusByToken } from "./deviceLease.js";
import { assertPortalToken } from "./auth.js";

const ROLES = ["cashier", "manager", "boss"] as const;

const loginBody = z.object({
  merchantCode: z.string().min(2).max(40).optional(),
  username: z.string().min(2).max(80),
  password: z.string().min(6).max(200),
});

const rosterQuery = z.object({
  merchantCode: z.string().min(2).max(40),
  leaseToken: z.string().uuid(),
});

const listOperatorsQuery = z.object({
  merchantCode: z.string().min(2).max(40).optional(),
});

const usernameAvailabilityQuery = z.object({
  username: z.string().min(2).max(80),
});

const createOperatorBody = z.object({
  merchantCode: z.string().min(2).max(40),
  branchCode: z.string().min(2).max(40).optional(),
  username: z.string().min(2).max(80),
  displayName: z.string().min(2).max(120),
  password: z.string().min(6).max(200),
  role: z.enum(ROLES).default("cashier"),
});

const patchOperatorBody = z.object({
  displayName: z.string().min(2).max(120).optional(),
  password: z.string().min(6).max(200).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  branchCode: z.string().min(2).max(40).nullable().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

const SESSION_HOURS = 12;

export const operatorRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/login", async (request, reply) => {
    assertPortalToken(request);
    const body = loginBody.parse(request.body);
    const username = body.username.trim().toLowerCase();

    const result = await withTransaction(async (client) => {
      const row = body.merchantCode
        ? await loadOperatorRow(client, body.merchantCode, username)
        : await loadOperatorByUsername(client, username);
      if (!row) {
        throw new Error("UNAUTHORIZED: Invalid username or password.");
      }
      if (row.status !== "ACTIVE") {
        throw new Error("FORBIDDEN: This operator account is deactivated.");
      }
      if (row.merchant_status !== "ACTIVE") {
        throw new Error("FORBIDDEN: Merchant is deactivated.");
      }
      if (row.branch_id && row.branch_status !== "ACTIVE") {
        throw new Error("FORBIDDEN: Branch is deactivated.");
      }
      if (!verifyPassword(body.password, row.password_salt, row.password_hash)) {
        throw new Error("UNAUTHORIZED: Invalid username or password.");
      }

      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO operator_sessions (operator_id, session_token, expires_at)
         VALUES ($1, $2, $3)`,
        [row.id, sessionToken, expiresAt.toISOString()]
      );
      await client.query(`UPDATE operators SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [
        row.id,
      ]);

      const deviceBinding = await fetchActiveLeaseForOperator(client, {
        merchantCode: row.merchant_code,
        branchCode: row.branch_code ?? null,
      });

      return { row, sessionToken, expiresAt, deviceBinding };
    });

    return reply.send({
      ok: true,
      sessionToken: result.sessionToken,
      sessionExpiresAt: result.expiresAt.toISOString(),
      user: mapOperatorUser(result.row),
      credential: mapOperatorCredential(result.row),
      deviceBinding: result.deviceBinding,
    });
  });

  app.get("/auth/operator-roster", async (request, reply) => {
    assertPortalToken(request);
    const query = rosterQuery.parse(request.query);

    const roster = await withTransaction(async (client) => {
      const merchant = await client.query(`SELECT id, code, status FROM merchants WHERE code = $1`, [
        query.merchantCode,
      ]);
      if (!merchant.rows[0]) {
        throw new Error("NOT_FOUND: Merchant not found.");
      }
      if (merchant.rows[0].status !== "ACTIVE") {
        throw new Error("FORBIDDEN: Merchant is deactivated.");
      }

      const lease = await fetchLeaseStatusByToken(client, query.leaseToken);
      if (!lease.allowed || lease.merchant?.code !== query.merchantCode) {
        throw new Error(`FORBIDDEN: ${lease.reason ?? "Device lease is not valid."}`);
      }

      const rows = await client.query(
        `SELECT o.id, o.username, o.display_name, o.role, o.password_salt, o.password_hash,
                o.status, o.credentials_version, o.updated_at,
                m.code AS merchant_code, b.code AS branch_code
         FROM operators o
         JOIN merchants m ON m.id = o.merchant_id
         LEFT JOIN branches b ON b.id = o.branch_id
         WHERE m.code = $1 AND o.status = 'ACTIVE'
         ORDER BY o.display_name ASC`,
        [query.merchantCode]
      );
      return rows.rows;
    });

    return reply.send({
      ok: true,
      merchantCode: query.merchantCode,
      operators: roster.map((row) => ({
        ...mapOperatorUser(row),
        credential: mapOperatorCredential(row),
        branchCode: row.branch_code,
        updatedAt: row.updated_at,
      })),
    });
  });

  app.get("/admin/operators/username-available", async (request, reply) => {
    assertPortalToken(request);
    const query = usernameAvailabilityQuery.parse(request.query);
    const username = query.username.trim().toLowerCase();

    const existing = await withTransaction(async (client) => {
      const result = await client.query(
        `SELECT m.code AS merchant_code
         FROM operators o
         JOIN merchants m ON m.id = o.merchant_id
         WHERE LOWER(o.username) = LOWER($1)
         LIMIT 1`,
        [username]
      );
      return result.rows[0] ?? null;
    });

    return reply.send({
      ok: true,
      username,
      available: !existing,
      usedByMerchant: existing?.merchant_code ?? null,
    });
  });

  app.get("/admin/operators", async (request, reply) => {
    assertPortalToken(request);
    const query = listOperatorsQuery.parse(request.query);

    const operators = await withTransaction(async (client) => {
      const values: unknown[] = [];
      let sql = `
        SELECT o.id, o.username, o.display_name, o.role, o.status, o.credentials_version,
               o.last_login_at, o.created_at, o.updated_at,
               m.code AS merchant_code, b.code AS branch_code
        FROM operators o
        JOIN merchants m ON m.id = o.merchant_id
        LEFT JOIN branches b ON b.id = o.branch_id`;
      if (query.merchantCode) {
        sql += ` WHERE m.code = $1`;
        values.push(query.merchantCode);
      }
      sql += ` ORDER BY m.code ASC, o.display_name ASC`;
      const rows = await client.query(sql, values);
      return rows.rows;
    });

    return reply.send({
      ok: true,
      operators: operators.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        status: row.status,
        credentialsVersion: row.credentials_version,
        merchantCode: row.merchant_code,
        branchCode: row.branch_code,
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  });

  app.post("/admin/operators", async (request, reply) => {
    assertPortalToken(request);
    const body = createOperatorBody.parse(request.body);
    const username = body.username.trim().toLowerCase();
    const salt = createSalt();
    const passwordHash = hashPassword(body.password, salt);

    const operator = await withTransaction(async (client) => {
      const merchant = await client.query(`SELECT id, status FROM merchants WHERE code = $1`, [
        body.merchantCode,
      ]);
      if (!merchant.rows[0]) throw new Error("NOT_FOUND: Merchant not found.");
      if (merchant.rows[0].status !== "ACTIVE") {
        throw new Error("BAD_REQUEST: Merchant is deactivated.");
      }

      let branchId: string | null = null;
      if (body.branchCode) {
        const branch = await client.query(
          `SELECT id, status FROM branches WHERE merchant_id = $1 AND code = $2`,
          [merchant.rows[0].id, body.branchCode]
        );
        if (!branch.rows[0]) throw new Error("NOT_FOUND: Branch not found.");
        if (branch.rows[0].status !== "ACTIVE") {
          throw new Error("BAD_REQUEST: Branch is deactivated.");
        }
        branchId = branch.rows[0].id;
      }

      await assertGlobalUsernameAvailable(client, username);

      const result = await client.query(
        `INSERT INTO operators (
           merchant_id, branch_id, username, display_name, role, password_salt, password_hash
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, username, display_name, role, status, credentials_version, created_at, updated_at`,
        [merchant.rows[0].id, branchId, username, body.displayName.trim(), body.role, salt, passwordHash]
      );
      return result.rows[0];
    });

    return reply.send({
      ok: true,
      operator: {
        id: operator.id,
        username: operator.username,
        displayName: operator.display_name,
        role: operator.role,
        status: operator.status,
        credentialsVersion: operator.credentials_version,
        merchantCode: body.merchantCode,
        branchCode: body.branchCode ?? null,
        createdAt: operator.created_at,
        updatedAt: operator.updated_at,
      },
    });
  });

  app.patch("/admin/operators/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);
    const body = patchOperatorBody.parse(request.body);

    const operator = await withTransaction(async (client) => {
      const existing = await client.query(`SELECT id FROM operators WHERE id = $1`, [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Operator not found.");

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
      }
      if (body.password !== undefined) {
        const salt = createSalt();
        fields.push(`password_salt = $${index++}`);
        values.push(salt);
        fields.push(`password_hash = $${index++}`);
        values.push(hashPassword(body.password, salt));
        fields.push(`credentials_version = credentials_version + 1`);
      }
      if (body.branchCode !== undefined) {
        const merchant = await client.query(
          `SELECT merchant_id FROM operators WHERE id = $1`,
          [id]
        );
        let branchId: string | null = null;
        if (body.branchCode) {
          const branch = await client.query(
            `SELECT id FROM branches WHERE merchant_id = $1 AND code = $2`,
            [merchant.rows[0].merchant_id, body.branchCode]
          );
          if (!branch.rows[0]) throw new Error("NOT_FOUND: Branch not found.");
          branchId = branch.rows[0].id;
        }
        fields.push(`branch_id = $${index++}`);
        values.push(branchId);
      }

      if (!fields.length) throw new Error("BAD_REQUEST: No fields to update.");

      fields.push("updated_at = NOW()");
      values.push(id);

      const result = await client.query(
        `UPDATE operators SET ${fields.join(", ")} WHERE id = $${index}
         RETURNING id, username, display_name, role, status, credentials_version, updated_at`,
        values
      );
      return result.rows[0];
    });

    return reply.send({
      ok: true,
      operator: {
        id: operator.id,
        username: operator.username,
        displayName: operator.display_name,
        role: operator.role,
        status: operator.status,
        credentialsVersion: operator.credentials_version,
        updatedAt: operator.updated_at,
      },
    });
  });

  app.delete("/admin/operators/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);

    await withTransaction(async (client) => {
      const result = await client.query(`DELETE FROM operators WHERE id = $1 RETURNING id`, [id]);
      if (!result.rows[0]) throw new Error("NOT_FOUND: Operator not found.");
    });

    return reply.send({ ok: true });
  });
};

async function loadOperatorRow(
  client: import("pg").PoolClient,
  merchantCode: string,
  username: string
) {
  const result = await client.query(
    `SELECT o.id, o.username, o.display_name, o.role, o.password_salt, o.password_hash,
            o.status, o.credentials_version,
            m.code AS merchant_code, m.status AS merchant_status,
            o.branch_id, b.code AS branch_code, b.status AS branch_status
     FROM operators o
     JOIN merchants m ON m.id = o.merchant_id
     LEFT JOIN branches b ON b.id = o.branch_id
     WHERE m.code = $1 AND o.username = $2`,
    [merchantCode, username]
  );
  return result.rows[0] ?? null;
}

async function loadOperatorByUsername(client: import("pg").PoolClient, username: string) {
  const result = await client.query(
    `SELECT o.id, o.username, o.display_name, o.role, o.password_salt, o.password_hash,
            o.status, o.credentials_version,
            m.code AS merchant_code, m.status AS merchant_status,
            o.branch_id, b.code AS branch_code, b.status AS branch_status
     FROM operators o
     JOIN merchants m ON m.id = o.merchant_id
     LEFT JOIN branches b ON b.id = o.branch_id
     WHERE LOWER(o.username) = LOWER($1) AND o.status = 'ACTIVE'`,
    [username]
  );
  return result.rows[0] ?? null;
}

async function assertGlobalUsernameAvailable(
  client: import("pg").PoolClient,
  username: string,
  excludeOperatorId?: string
) {
  const existing = await client.query(
    `SELECT m.code AS merchant_code
     FROM operators o
     JOIN merchants m ON m.id = o.merchant_id
     WHERE LOWER(o.username) = LOWER($1)
       AND ($2::uuid IS NULL OR o.id <> $2::uuid)
     LIMIT 1`,
    [username, excludeOperatorId ?? null]
  );
  if (existing.rows[0]) {
    throw new Error(
      `CONFLICT: Username "${username}" is already used for merchant "${existing.rows[0].merchant_code}". Each operator must have a unique username across all merchants.`
    );
  }
}

function mapOperatorUser(row: {
  id: string;
  username: string;
  display_name: string;
  role: string;
  merchant_code?: string;
  branch_code?: string | null;
}) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    merchantCode: row.merchant_code,
    branchCode: row.branch_code ?? null,
  };
}

function mapOperatorCredential(row: {
  password_salt: string;
  password_hash: string;
  credentials_version: number;
}) {
  return {
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    credentialsVersion: row.credentials_version,
  };
}
