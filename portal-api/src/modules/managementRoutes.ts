import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTransaction } from "../db.js";
import { assertPortalToken } from "./auth.js";

const idParam = z.object({
  id: z.string().uuid(),
});

const merchantPatch = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const branchPatch = z.object({
  name: z.string().min(2).max(120).optional(),
  city: z.string().max(120).nullable().optional(),
  countryCode: z.string().max(8).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const devicePatch = z.object({
  label: z.string().min(2).max(120).optional(),
  deviceCode: z.string().min(2).max(80).optional(),
});

const activationPatch = z.object({
  maxDevices: z.number().int().positive().max(100).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  status: z.enum(["READY", "DISABLED"]).optional(),
});

const leasePatch = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
});

export const managementRoutes: FastifyPluginAsync = async (app) => {
  app.patch("/admin/merchants/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);
    const body = merchantPatch.parse(request.body);

    const row = await withTransaction(async (client) => {
      const existing = await client.query("SELECT id FROM merchants WHERE id = $1", [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Merchant not found.");

      const fields: string[] = [];
      const values: unknown[] = [];
      let index = 1;

      if (body.name !== undefined) {
        fields.push(`name = $${index++}`);
        values.push(body.name);
      }
      if (body.status !== undefined) {
        fields.push(`status = $${index++}`);
        values.push(body.status);
      }
      if (!fields.length) throw new Error("BAD_REQUEST: No fields to update.");

      fields.push("updated_at = NOW()");
      values.push(id);

      const result = await client.query(
        `UPDATE merchants SET ${fields.join(", ")} WHERE id = $${index}
         RETURNING id, code, name, status`,
        values
      );
      return result.rows[0];
    });

    return reply.send({ ok: true, merchant: row });
  });

  app.delete("/admin/merchants/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);

    await withTransaction(async (client) => {
      const result = await client.query("DELETE FROM merchants WHERE id = $1 RETURNING id", [id]);
      if (!result.rows[0]) throw new Error("NOT_FOUND: Merchant not found.");
    });

    return reply.send({ ok: true });
  });

  app.patch("/admin/branches/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);
    const body = branchPatch.parse(request.body);

    const row = await withTransaction(async (client) => {
      const existing = await client.query("SELECT id FROM branches WHERE id = $1", [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Branch not found.");

      const fields: string[] = [];
      const values: unknown[] = [];
      let index = 1;

      if (body.name !== undefined) {
        fields.push(`name = $${index++}`);
        values.push(body.name);
      }
      if (body.city !== undefined) {
        fields.push(`city = $${index++}`);
        values.push(body.city);
      }
      if (body.countryCode !== undefined) {
        fields.push(`country_code = $${index++}`);
        values.push(body.countryCode);
      }
      if (body.status !== undefined) {
        fields.push(`status = $${index++}`);
        values.push(body.status);
      }
      if (!fields.length) throw new Error("BAD_REQUEST: No fields to update.");

      fields.push("updated_at = NOW()");
      values.push(id);

      const result = await client.query(
        `UPDATE branches SET ${fields.join(", ")} WHERE id = $${index}
         RETURNING id, code, name, city, country_code, status`,
        values
      );
      return result.rows[0];
    });

    return reply.send({
      ok: true,
      branch: {
        id: row.id,
        code: row.code,
        name: row.name,
        city: row.city,
        countryCode: row.country_code,
        status: row.status,
      },
    });
  });

  app.delete("/admin/branches/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);

    await withTransaction(async (client) => {
      const result = await client.query("DELETE FROM branches WHERE id = $1 RETURNING id", [id]);
      if (!result.rows[0]) throw new Error("NOT_FOUND: Branch not found.");
    });

    return reply.send({ ok: true });
  });

  app.patch("/admin/devices/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);
    const body = devicePatch.parse(request.body);

    const row = await withTransaction(async (client) => {
      const existing = await client.query("SELECT id FROM devices WHERE id = $1", [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Device not found.");

      const fields: string[] = [];
      const values: unknown[] = [];
      let index = 1;

      if (body.label !== undefined) {
        fields.push(`label = $${index++}`);
        values.push(body.label);
      }
      if (body.deviceCode !== undefined) {
        const conflict = await client.query(
          "SELECT id FROM devices WHERE device_code = $1 AND id <> $2",
          [body.deviceCode, id]
        );
        if (conflict.rows[0]) throw new Error("CONFLICT: Device code already exists.");
        fields.push(`device_code = $${index++}`);
        values.push(body.deviceCode);
      }
      if (!fields.length) throw new Error("BAD_REQUEST: No fields to update.");

      fields.push("updated_at = NOW()");
      values.push(id);

      const result = await client.query(
        `UPDATE devices SET ${fields.join(", ")} WHERE id = $${index}
         RETURNING id, device_code, label`,
        values
      );
      return result.rows[0];
    });

    return reply.send({
      ok: true,
      device: {
        id: row.id,
        deviceCode: row.device_code,
        label: row.label,
      },
    });
  });

  app.delete("/admin/devices/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);

    await withTransaction(async (client) => {
      const result = await client.query("DELETE FROM devices WHERE id = $1 RETURNING id", [id]);
      if (!result.rows[0]) throw new Error("NOT_FOUND: Device not found.");
    });

    return reply.send({ ok: true });
  });

  app.patch("/admin/activation-codes/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);
    const body = activationPatch.parse(request.body);

    const row = await withTransaction(async (client) => {
      const existing = await client.query("SELECT id FROM activation_codes WHERE id = $1", [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Activation code not found.");

      const fields: string[] = [];
      const values: unknown[] = [];
      let index = 1;

      if (body.maxDevices !== undefined) {
        fields.push(`max_devices = $${index++}`);
        values.push(body.maxDevices);
      }
      if (body.expiresAt !== undefined) {
        fields.push(`expires_at = $${index++}`);
        values.push(body.expiresAt);
      }
      if (body.status !== undefined) {
        fields.push(`status = $${index++}`);
        values.push(body.status);
      }
      if (!fields.length) throw new Error("BAD_REQUEST: No fields to update.");

      fields.push("updated_at = NOW()");
      values.push(id);

      const result = await client.query(
        `UPDATE activation_codes SET ${fields.join(", ")} WHERE id = $${index}
         RETURNING id, code, max_devices, expires_at, status`,
        values
      );
      return result.rows[0];
    });

    return reply.send({
      ok: true,
      activationCode: {
        id: row.id,
        code: row.code,
        maxDevices: row.max_devices,
        expiresAt: row.expires_at,
        status: row.status,
      },
    });
  });

  app.delete("/admin/activation-codes/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);

    await withTransaction(async (client) => {
      const result = await client.query("DELETE FROM activation_codes WHERE id = $1 RETURNING id", [id]);
      if (!result.rows[0]) throw new Error("NOT_FOUND: Activation code not found.");
    });

    return reply.send({ ok: true });
  });

  app.patch("/admin/offline-leases/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);
    const body = leasePatch.parse(request.body);

    const row = await withTransaction(async (client) => {
      const existing = await client.query("SELECT id FROM offline_leases WHERE id = $1", [id]);
      if (!existing.rows[0]) throw new Error("NOT_FOUND: Lease not found.");

      if (body.status === undefined) throw new Error("BAD_REQUEST: No fields to update.");

      const result = await client.query(
        `UPDATE offline_leases SET status = $1 WHERE id = $2
         RETURNING id, lease_token, valid_from, valid_until, status, issued_at`,
        [body.status, id]
      );
      return result.rows[0];
    });

    return reply.send({
      ok: true,
      lease: {
        id: row.id,
        leaseToken: row.lease_token,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        status: row.status,
        issuedAt: row.issued_at,
      },
    });
  });

  app.delete("/admin/offline-leases/:id", async (request, reply) => {
    assertPortalToken(request);
    const { id } = idParam.parse(request.params);

    await withTransaction(async (client) => {
      const result = await client.query("DELETE FROM offline_leases WHERE id = $1 RETURNING id", [id]);
      if (!result.rows[0]) throw new Error("NOT_FOUND: Lease not found.");
    });

    return reply.send({ ok: true });
  });
};
