import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTransaction } from "../db.js";
import { assertPortalToken } from "./auth.js";
import { fetchLeaseStatusByDevice, fetchLeaseStatusByToken } from "./deviceLease.js";
import { signOfflineLease } from "./lease.js";

const merchantBody = z.object({
  merchantCode: z.string().min(2).max(40),
  merchantName: z.string().min(2).max(120),
  branchCode: z.string().min(2).max(40),
  branchName: z.string().min(2).max(120),
  city: z.string().max(120).optional(),
  countryCode: z.string().max(8).optional(),
  deviceCode: z.string().min(2).max(80),
  deviceLabel: z.string().min(2).max(120),
});

const activationBody = z.object({
  merchantCode: z.string().min(2).max(40),
  branchCode: z.string().min(2).max(40).optional(),
  maxDevices: z.number().int().positive().max(100).default(1),
  expiresAt: z.string().datetime().optional(),
});

const leaseBody = z.object({
  activationCode: z.string().min(8),
  deviceCode: z.string().min(2).max(80),
  validDays: z.number().int().positive().max(90).default(30),
});

const activateDeviceBody = z.object({
  activationCode: z.string().min(8),
  deviceLabel: z.string().min(2).max(120),
  deviceCode: z.string().min(2).max(80).optional(),
  validDays: z.number().int().positive().max(90).default(30),
});

const leaseStatusQuery = z
  .object({
    leaseToken: z.string().uuid().optional(),
    deviceCode: z.string().min(2).max(80).optional(),
    activationCode: z.string().min(8).optional(),
  })
  .refine((value) => value.leaseToken || (value.deviceCode && value.activationCode), {
    message: "Provide leaseToken or both deviceCode and activationCode.",
  });

const listQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const tenantRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/overview", async (request, reply) => {
    assertPortalToken(request);

    const result = await withTransaction(async (client) => {
      const [merchants, branches, devices, activationCodes, leases, syncs] = await Promise.all([
        client.query("SELECT count(*)::int AS count FROM merchants"),
        client.query("SELECT count(*)::int AS count FROM branches"),
        client.query("SELECT count(*)::int AS count FROM devices"),
        client.query(
          `SELECT
             count(*)::int AS total,
             count(*) FILTER (WHERE status = 'READY')::int AS ready
           FROM activation_codes`
        ),
        client.query(
          `SELECT
             count(*)::int AS total,
             count(*) FILTER (WHERE status = 'ACTIVE')::int AS active
           FROM offline_leases`
        ),
        client.query(
          `SELECT
             count(*)::int AS total,
             max(received_at) AS last_received_at
           FROM sync_ingestions`
        ),
      ]);

      return {
        merchants: merchants.rows[0].count,
        branches: branches.rows[0].count,
        devices: devices.rows[0].count,
        activationCodes: {
          total: activationCodes.rows[0].total,
          ready: activationCodes.rows[0].ready,
        },
        offlineLeases: {
          total: leases.rows[0].total,
          active: leases.rows[0].active,
        },
        syncIngestions: {
          total: syncs.rows[0].total,
          lastReceivedAt: syncs.rows[0].last_received_at,
        },
      };
    });

    return reply.send({ ok: true, overview: result });
  });

  app.get("/admin/merchants", async (request, reply) => {
    assertPortalToken(request);

    const result = await withTransaction(async (client) => {
      const [merchantRows, branchRows, deviceRows] = await Promise.all([
        client.query(
          `SELECT
             m.id,
             m.code,
             m.name,
             m.status,
             m.created_at,
             count(DISTINCT b.id)::int AS branch_count,
             count(DISTINCT d.id)::int AS device_count
           FROM merchants m
           LEFT JOIN branches b ON b.merchant_id = m.id
           LEFT JOIN devices d ON d.branch_id = b.id
           GROUP BY m.id
           ORDER BY m.created_at DESC`
        ),
        client.query(
          `SELECT
             b.id,
             b.merchant_id,
             b.code,
             b.name,
             b.city,
             b.country_code,
             b.status,
             count(d.id)::int AS device_count
           FROM branches b
           LEFT JOIN devices d ON d.branch_id = b.id
           GROUP BY b.id
           ORDER BY b.created_at DESC`
        ),
        client.query(
          `SELECT
             d.id,
             d.branch_id,
             d.device_code,
             d.label,
             d.source_type,
             d.last_seen_at
           FROM devices d
           ORDER BY d.updated_at DESC`
        ),
      ]);

      const devicesByBranch = new Map<string, Array<Record<string, unknown>>>();
      for (const row of deviceRows.rows) {
        const list = devicesByBranch.get(row.branch_id) ?? [];
        list.push({
          id: row.id,
          deviceCode: row.device_code,
          label: row.label,
          sourceType: row.source_type,
          lastSeenAt: row.last_seen_at,
        });
        devicesByBranch.set(row.branch_id, list);
      }

      const branchesByMerchant = new Map<string, Array<Record<string, unknown>>>();
      for (const row of branchRows.rows) {
        const list = branchesByMerchant.get(row.merchant_id) ?? [];
        list.push({
          id: row.id,
          code: row.code,
          name: row.name,
          city: row.city,
          countryCode: row.country_code,
          status: row.status,
          deviceCount: row.device_count,
          devices: devicesByBranch.get(row.id) ?? [],
        });
        branchesByMerchant.set(row.merchant_id, list);
      }

      return merchantRows.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
        branchCount: row.branch_count,
        deviceCount: row.device_count,
        branches: branchesByMerchant.get(row.id) ?? [],
      }));
    });

    return reply.send({ ok: true, merchants: result });
  });

  app.get("/admin/activation-codes", async (request, reply) => {
    assertPortalToken(request);
    const query = listQuery.parse(request.query);

    const result = await withTransaction(async (client) => {
      const rows = await client.query(
        `SELECT
           ac.id,
           ac.code,
           ac.max_devices,
           ac.expires_at,
           ac.status,
           ac.created_at,
           m.code AS merchant_code,
           b.code AS branch_code
         FROM activation_codes ac
         JOIN merchants m ON m.id = ac.merchant_id
         LEFT JOIN branches b ON b.id = ac.branch_id
         ORDER BY ac.created_at DESC
         LIMIT $1`,
        [query.limit]
      );
      return rows.rows.map((row) => ({
        id: row.id,
        code: row.code,
        merchantCode: row.merchant_code,
        branchCode: row.branch_code,
        maxDevices: row.max_devices,
        expiresAt: row.expires_at,
        status: row.status,
        createdAt: row.created_at,
      }));
    });

    return reply.send({ ok: true, activationCodes: result });
  });

  app.get("/admin/offline-leases", async (request, reply) => {
    assertPortalToken(request);
    const query = listQuery.parse(request.query);

    const result = await withTransaction(async (client) => {
      const rows = await client.query(
        `SELECT
           ol.id,
           ol.lease_token,
           ol.valid_from,
           ol.valid_until,
           ol.status,
           ol.issued_at,
           ac.code AS activation_code,
           m.code AS merchant_code,
           b.code AS branch_code,
           d.device_code
         FROM offline_leases ol
         JOIN activation_codes ac ON ac.id = ol.activation_code_id
         JOIN merchants m ON m.id = ac.merchant_id
         LEFT JOIN branches b ON b.id = ac.branch_id
         JOIN devices d ON d.id = ol.device_id
         ORDER BY ol.issued_at DESC
         LIMIT $1`,
        [query.limit]
      );
      return rows.rows.map((row) => ({
        id: row.id,
        leaseToken: row.lease_token,
        activationCode: row.activation_code,
        merchantCode: row.merchant_code,
        branchCode: row.branch_code,
        deviceCode: row.device_code,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        status: row.status,
        issuedAt: row.issued_at,
      }));
    });

    return reply.send({ ok: true, leases: result });
  });

  app.post("/admin/bootstrap-tenant", async (request, reply) => {
    assertPortalToken(request);
    const body = merchantBody.parse(request.body);

    const result = await withTransaction(async (client) => {
      const merchant = await client.query(
        `INSERT INTO merchants (code, name)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
         RETURNING id, code, name`,
        [body.merchantCode, body.merchantName]
      );

      const branch = await client.query(
        `INSERT INTO branches (merchant_id, code, name, city, country_code)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (merchant_id, code) DO UPDATE SET
           name = EXCLUDED.name,
           city = EXCLUDED.city,
           country_code = EXCLUDED.country_code,
           updated_at = NOW()
         RETURNING id, code, name`,
        [merchant.rows[0].id, body.branchCode, body.branchName, body.city ?? null, body.countryCode ?? null]
      );

      const device = await client.query(
        `INSERT INTO devices (branch_id, device_code, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_code) DO UPDATE SET
           branch_id = EXCLUDED.branch_id,
           label = EXCLUDED.label,
           updated_at = NOW()
         RETURNING id, device_code, label`,
        [branch.rows[0].id, body.deviceCode, body.deviceLabel]
      );

      return {
        merchant: merchant.rows[0],
        branch: branch.rows[0],
        device: device.rows[0],
      };
    });

    return reply.send({ ok: true, ...result });
  });

  app.post("/admin/activation-codes", async (request, reply) => {
    assertPortalToken(request);
    const body = activationBody.parse(request.body);

    const result = await withTransaction(async (client) => {
      const merchant = await client.query("SELECT id FROM merchants WHERE code = $1", [body.merchantCode]);
      if (!merchant.rows[0]) {
        throw new Error("NOT_FOUND: Merchant not found.");
      }

      let branchId: string | null = null;
      if (body.branchCode) {
        const branch = await client.query(
          "SELECT id FROM branches WHERE merchant_id = $1 AND code = $2",
          [merchant.rows[0].id, body.branchCode]
        );
        if (!branch.rows[0]) {
          throw new Error("NOT_FOUND: Branch not found.");
        }
        branchId = branch.rows[0].id;
      }

      const code = `SEP-${cryptoRandom(20)}`;
      const activation = await client.query(
        `INSERT INTO activation_codes (merchant_id, branch_id, code, max_devices, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, max_devices, expires_at, status`,
        [merchant.rows[0].id, branchId, code, body.maxDevices, body.expiresAt ?? null]
      );

      return activation.rows[0];
    });

    return reply.send({ ok: true, activationCode: result });
  });

  app.post("/admin/offline-leases", async (request, reply) => {
    assertPortalToken(request);
    const body = leaseBody.parse(request.body);

    const result = await withTransaction(async (client) => {
      const activation = await loadActivationContext(client, body.activationCode);
      const device = await client.query("SELECT id, device_code FROM devices WHERE device_code = $1", [body.deviceCode]);
      if (!device.rows[0]) {
        throw new Error("NOT_FOUND: Device not found.");
      }

      return issueOfflineLease(client, {
        activation,
        deviceId: device.rows[0].id,
        deviceCode: device.rows[0].device_code,
        validDays: body.validDays,
      });
    });

    return reply.send({ ok: true, lease: result });
  });

  app.get("/device/lease-status", async (request, reply) => {
    assertPortalToken(request);
    const query = leaseStatusQuery.parse(request.query);

    const status = await withTransaction(async (client) => {
      if (query.leaseToken) {
        return fetchLeaseStatusByToken(client, query.leaseToken);
      }
      return fetchLeaseStatusByDevice(client, {
        deviceCode: query.deviceCode!,
        activationCode: query.activationCode!,
      });
    });

    return reply.send({ ok: true, ...status });
  });

  app.post("/device/activate", async (request, reply) => {
    assertPortalToken(request);
    const body = activateDeviceBody.parse(request.body);

    const result = await withTransaction(async (client) => {
      const activation = await loadActivationContext(client, body.activationCode);
      if (!activation.branch_id || !activation.branch_code) {
        throw new Error("BAD_REQUEST: Activation code must be tied to a branch for desktop onboarding.");
      }

      const trimmedDeviceLabel = body.deviceLabel.trim();
      const existingDevice = await findActivatedDeviceByLabel(client, activation.id, trimmedDeviceLabel);
      if (existingDevice) {
        const lease = await issueOfflineLease(client, {
          activation,
          deviceId: existingDevice.id,
          deviceCode: existingDevice.device_code,
          validDays: body.validDays,
        });

        return {
          merchantCode: activation.merchant_code,
          branchCode: activation.branch_code,
          device: {
            id: existingDevice.id,
            deviceCode: existingDevice.device_code,
            label: existingDevice.label,
          },
          lease,
        };
      }

      const desiredDeviceCode = body.deviceCode?.trim() || buildDeviceCode(activation.branch_code);
      await assertDeviceCodeForActivation(client, desiredDeviceCode, activation.merchant_code);

      const device = await client.query(
        `INSERT INTO devices (branch_id, device_code, label, source_type, last_seen_at)
         VALUES ($1, $2, $3, 'desktop', NOW())
         ON CONFLICT (device_code) DO UPDATE SET
           branch_id = EXCLUDED.branch_id,
           label = EXCLUDED.label,
           source_type = EXCLUDED.source_type,
           last_seen_at = NOW(),
           updated_at = NOW()
         RETURNING id, device_code, label`,
        [activation.branch_id, desiredDeviceCode, trimmedDeviceLabel]
      );

      const lease = await issueOfflineLease(client, {
        activation,
        deviceId: device.rows[0].id,
        deviceCode: device.rows[0].device_code,
        validDays: body.validDays,
      });

      return {
        merchantCode: activation.merchant_code,
        branchCode: activation.branch_code,
        device: {
          id: device.rows[0].id,
          deviceCode: device.rows[0].device_code,
          label: device.rows[0].label,
        },
        lease,
      };
    });

    return reply.send({ ok: true, ...result });
  });
};

function cryptoRandom(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function loadActivationContext(client: import("pg").PoolClient, activationCode: string) {
  const activation = await client.query(
    `SELECT ac.id, ac.code, ac.max_devices, ac.status, ac.expires_at, ac.branch_id,
            m.code AS merchant_code, m.status AS merchant_status,
            b.code AS branch_code, b.status AS branch_status
     FROM activation_codes ac
     JOIN merchants m ON m.id = ac.merchant_id
     LEFT JOIN branches b ON b.id = ac.branch_id
     WHERE ac.code = $1`,
    [activationCode]
  );
  if (!activation.rows[0]) {
    throw new Error("NOT_FOUND: Activation code not found.");
  }
  if (activation.rows[0].merchant_status !== "ACTIVE") {
    throw new Error("BAD_REQUEST: Merchant is deactivated.");
  }
  if (activation.rows[0].branch_id && activation.rows[0].branch_status !== "ACTIVE") {
    throw new Error("BAD_REQUEST: Branch is deactivated.");
  }
  if (activation.rows[0].status !== "READY") {
    throw new Error("BAD_REQUEST: Activation code is not ready.");
  }
  if (activation.rows[0].expires_at && new Date(activation.rows[0].expires_at).getTime() < Date.now()) {
    throw new Error("BAD_REQUEST: Activation code expired.");
  }
  return activation.rows[0];
}

async function assertDeviceCodeForActivation(
  client: import("pg").PoolClient,
  deviceCode: string,
  activationMerchantCode: string
) {
  const existing = await client.query(
    `SELECT m.code AS merchant_code
     FROM devices d
     JOIN branches b ON b.id = d.branch_id
     JOIN merchants m ON m.id = b.merchant_id
     WHERE d.device_code = $1`,
    [deviceCode]
  );
  const row = existing.rows[0];
  if (row && row.merchant_code !== activationMerchantCode) {
    throw new Error(
      `CONFLICT: Device code "${deviceCode}" belongs to merchant "${row.merchant_code}". Leave device code blank to create a new device for this merchant.`
    );
  }
}

async function findActivatedDeviceByLabel(
  client: import("pg").PoolClient,
  activationCodeId: string,
  deviceLabel: string
) {
  const existing = await client.query(
    `SELECT d.id, d.device_code, d.label
     FROM offline_leases ol
     JOIN devices d ON d.id = ol.device_id
     WHERE ol.activation_code_id = $1
       AND ol.status = 'ACTIVE'
       AND ol.valid_until > NOW()
       AND lower(d.label) = lower($2)
     ORDER BY ol.valid_until DESC
     LIMIT 1`,
    [activationCodeId, deviceLabel]
  );
  return existing.rows[0] ?? null;
}

async function issueOfflineLease(
  client: import("pg").PoolClient,
  input: {
    activation: {
      id: string;
      code: string;
      max_devices: number;
      merchant_code: string;
      branch_code: string | null;
    };
    deviceId: string;
    deviceCode: string;
    validDays: number;
  }
) {
  const existingLease = await client.query(
    `SELECT lease_token, signed_payload, valid_from, valid_until, status, issued_at
     FROM offline_leases
     WHERE activation_code_id = $1 AND device_id = $2 AND status = 'ACTIVE' AND valid_until > NOW()
     ORDER BY valid_until DESC
     LIMIT 1`,
    [input.activation.id, input.deviceId]
  );
  if (existingLease.rows[0]) {
    return normalizeLeaseRow(existingLease.rows[0]);
  }

  const activeLeaseCount = await client.query(
    `SELECT count(*)::int AS count
     FROM offline_leases
     WHERE activation_code_id = $1 AND status = 'ACTIVE' AND valid_until > NOW()`,
    [input.activation.id]
  );
  if (activeLeaseCount.rows[0].count >= input.activation.max_devices) {
    throw new Error("CONFLICT: Activation code already reached its device limit.");
  }

  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + input.validDays * 24 * 60 * 60 * 1000);
  const signed = signOfflineLease({
    merchantCode: input.activation.merchant_code,
    branchCode: input.activation.branch_code ?? "default",
    deviceCode: input.deviceCode,
    activationCode: input.activation.code,
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
  });

  const lease = await client.query(
    `INSERT INTO offline_leases (
       activation_code_id, device_id, lease_token, signed_payload, valid_from, valid_until
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING lease_token, signed_payload, valid_from, valid_until, status, issued_at`,
    [
      input.activation.id,
      input.deviceId,
      signed.leaseToken,
      signed.signedPayload,
      validFrom.toISOString(),
      validUntil.toISOString(),
    ]
  );

  return normalizeLeaseRow(lease.rows[0]);
}

function buildDeviceCode(branchCode: string) {
  const base =
    String(branchCode ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "branch";
  return `${base}-desktop-${cryptoRandom(6).toLowerCase()}`;
}

function normalizeLeaseRow(row: {
  lease_token: string;
  signed_payload: string;
  valid_from: string;
  valid_until: string;
  status: string;
  issued_at: string;
}) {
  return {
    leaseToken: row.lease_token,
    signedPayload: row.signed_payload,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
    issuedAt: row.issued_at,
  };
}
