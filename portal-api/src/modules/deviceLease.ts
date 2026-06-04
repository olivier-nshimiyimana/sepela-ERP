import type { PoolClient } from "pg";

export type LeaseStatusRow = {
  lease_token: string;
  lease_status: string;
  valid_from: Date;
  valid_until: Date;
  issued_at: Date;
  device_code: string;
  device_label: string;
  activation_code: string;
  activation_status: string;
  merchant_code: string;
  merchant_status: string;
  merchant_name: string;
  branch_code: string | null;
  branch_status: string | null;
};

export type LeaseStatusResult = {
  allowed: boolean;
  reason: string | null;
  lease: {
    leaseToken: string;
    status: string;
    validFrom: string;
    validUntil: string;
    issuedAt: string;
  } | null;
  device: { deviceCode: string; label: string } | null;
  activationCode: { code: string; status: string } | null;
  merchant: { code: string; name: string; status: string } | null;
  branch: { code: string; status: string } | null;
};

const LEASE_SELECT = `
  SELECT
    ol.lease_token,
    ol.status AS lease_status,
    ol.valid_from,
    ol.valid_until,
    ol.issued_at,
    d.device_code,
    d.label AS device_label,
    ac.code AS activation_code,
    ac.status AS activation_status,
    m.code AS merchant_code,
    m.status AS merchant_status,
    m.name AS merchant_name,
    b.code AS branch_code,
    b.status AS branch_status
  FROM offline_leases ol
  JOIN devices d ON d.id = ol.device_id
  JOIN activation_codes ac ON ac.id = ol.activation_code_id
  JOIN merchants m ON m.id = ac.merchant_id
  LEFT JOIN branches b ON b.id = ac.branch_id
`;

export function evaluateLeaseStatus(row: LeaseStatusRow | undefined | null): LeaseStatusResult {
  if (!row) {
    return {
      allowed: false,
      reason: "Lease not found.",
      lease: null,
      device: null,
      activationCode: null,
      merchant: null,
      branch: null,
    };
  }

  const lease = {
    leaseToken: row.lease_token,
    status: row.lease_status,
    validFrom: new Date(row.valid_from).toISOString(),
    validUntil: new Date(row.valid_until).toISOString(),
    issuedAt: new Date(row.issued_at).toISOString(),
  };

  const payload: LeaseStatusResult = {
    allowed: true,
    reason: null,
    lease,
    device: { deviceCode: row.device_code, label: row.device_label },
    activationCode: { code: row.activation_code, status: row.activation_status },
    merchant: { code: row.merchant_code, name: row.merchant_name, status: row.merchant_status },
    branch: row.branch_code ? { code: row.branch_code, status: row.branch_status ?? "ACTIVE" } : null,
  };

  if (row.lease_status !== "ACTIVE") {
    return { ...payload, allowed: false, reason: "Offline lease is revoked or inactive." };
  }
  if (new Date(row.valid_until).getTime() <= Date.now()) {
    return { ...payload, allowed: false, reason: "Offline lease has expired." };
  }
  if (row.merchant_status !== "ACTIVE") {
    return { ...payload, allowed: false, reason: "Merchant is deactivated." };
  }
  if (row.branch_code && row.branch_status !== "ACTIVE") {
    return { ...payload, allowed: false, reason: "Branch is deactivated." };
  }
  if (row.activation_status !== "READY") {
    return { ...payload, allowed: false, reason: "Activation code is disabled." };
  }

  return payload;
}

export async function fetchLeaseStatusByToken(
  client: PoolClient,
  leaseToken: string
): Promise<LeaseStatusResult> {
  const result = await client.query(`${LEASE_SELECT} WHERE ol.lease_token = $1 LIMIT 1`, [leaseToken]);
  return evaluateLeaseStatus(result.rows[0] as LeaseStatusRow | undefined);
}

export async function fetchActiveLeaseForOperator(
  client: PoolClient,
  input: { merchantCode: string; branchCode?: string | null }
): Promise<LeaseStatusResult> {
  const branchCode = input.branchCode?.trim() || null;
  const result = await client.query(
    `${LEASE_SELECT}
     WHERE m.code = $1
       AND ol.status = 'ACTIVE'
       AND ol.valid_until > NOW()
       AND ($2::text IS NULL OR b.code = $2 OR d.branch_id IN (
         SELECT id FROM branches WHERE merchant_id = m.id AND code = $2
       ))
     ORDER BY ol.valid_until DESC
     LIMIT 1`,
    [input.merchantCode, branchCode]
  );
  return evaluateLeaseStatus(result.rows[0] as LeaseStatusRow | undefined);
}

export async function fetchLeaseStatusByDevice(
  client: PoolClient,
  input: { deviceCode: string; activationCode: string }
): Promise<LeaseStatusResult> {
  const result = await client.query(
    `${LEASE_SELECT}
     WHERE d.device_code = $1 AND ac.code = $2
     ORDER BY ol.valid_until DESC
     LIMIT 1`,
    [input.deviceCode, input.activationCode]
  );
  return evaluateLeaseStatus(result.rows[0] as LeaseStatusRow | undefined);
}

export async function assertSyncLeaseAllowed(
  client: PoolClient,
  input: { leaseToken?: string; merchantCode: string; branchCode: string; deviceCode: string }
): Promise<LeaseStatusResult> {
  const token = input.leaseToken?.trim();
  if (!token) {
    return {
      allowed: false,
      reason: "Valid lease token is required. Refresh activation status in settings or activate again.",
      lease: null,
      device: null,
      activationCode: null,
      merchant: null,
      branch: null,
    };
  }

  const status = await fetchLeaseStatusByToken(client, token);
  if (!status.allowed) return status;
  if (
    status.merchant?.code !== input.merchantCode ||
    (status.branch?.code && status.branch.code !== input.branchCode) ||
    status.device?.deviceCode !== input.deviceCode
  ) {
    return {
      ...status,
      allowed: false,
      reason: "Lease does not match the merchant, branch, or device in this sync request.",
    };
  }
  return status;
}
