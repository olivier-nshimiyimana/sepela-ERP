const SYNC_TABLES = ["products", "customers", "suppliers", "sales", "purchases", "settings", "stockSnapshots"];

function normalizeResultBucket(entries, keyField = "id") {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return entry;
      if (typeof entry === "object") {
        return entry[keyField] ?? entry.id ?? entry.key ?? null;
      }
      return null;
    })
    .filter(Boolean);
}

function defaultSuccessResult(payload) {
  return Object.fromEntries(
    SYNC_TABLES.map((table) => [
      table,
      (payload?.[table] ?? [])
        .map((entry) => entry?.id ?? entry?.key ?? null)
        .filter(Boolean),
    ])
  );
}

function normalizeSyncResponse(raw, payload) {
  if (!raw || typeof raw !== "object") {
    return {
      ok: true,
      synced: defaultSuccessResult(payload),
      failed: Object.fromEntries(SYNC_TABLES.map((table) => [table, []])),
      message: "Cloud sync completed.",
    };
  }

  if (raw.ok === false) {
    throw new Error(raw.error ?? raw.message ?? "Cloud sync failed.");
  }

  const synced = {};
  const failed = {};
  for (const table of SYNC_TABLES) {
    const keyField = table === "settings" ? "key" : "id";
    synced[table] = normalizeResultBucket(raw.synced?.[table], keyField);
    failed[table] = normalizeResultBucket(raw.failed?.[table], keyField);
  }

  const hasExplicitResult = SYNC_TABLES.some((table) => synced[table].length || failed[table].length);
  return {
    ok: true,
    synced: hasExplicitResult ? synced : defaultSuccessResult(payload),
    failed,
    message: raw.message ?? "Cloud sync completed.",
  };
}

function buildCloudHeaders(options = {}, includeJson = true) {
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(options.apiToken ? { Authorization: `Bearer ${options.apiToken}` } : {}),
  };
}

async function parseCloudResponse(response) {
  let parsedBody = null;
  try {
    parsedBody = await response.json();
  } catch {
    /* ignore non-json responses */
  }

  if (!response.ok) {
    throw new Error(parsedBody?.error ?? parsedBody?.message ?? `Cloud request failed (${response.status}).`);
  }

  if (parsedBody?.ok === false) {
    throw new Error(parsedBody.error ?? parsedBody.message ?? "Cloud request failed.");
  }

  return parsedBody;
}

async function postCloudJson(apiBaseUrl, path, requestBody, options = {}) {
  const base = String(apiBaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("Cloud API URL is required.");
  }

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: buildCloudHeaders(options),
    body: JSON.stringify(requestBody),
  });

  return parseCloudResponse(response);
}

export async function fetchCloudLeaseStatus(apiBaseUrl, query, options = {}) {
  const base = String(apiBaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("Cloud API URL is required.");
  }

  const params = new URLSearchParams();
  if (query.leaseToken) params.set("leaseToken", query.leaseToken);
  if (query.deviceCode) params.set("deviceCode", query.deviceCode);
  if (query.activationCode) params.set("activationCode", query.activationCode);

  const response = await fetch(`${base}/device/lease-status?${params.toString()}`, {
    method: "GET",
    headers: buildCloudHeaders(options, false),
  });

  return parseCloudResponse(response);
}

/** @param {Record<string, unknown>} config */
export function applyCloudLeaseStatus(config, status, options = {}) {
  const lease = status?.lease ?? null;
  const leaseMerchant = String(status?.merchant?.code ?? "").trim();
  const activeMerchant = String(options.activeMerchantCode ?? "").trim();
  const merchantMismatch =
    activeMerchant && leaseMerchant && leaseMerchant !== activeMerchant;

  return {
    ...config,
    ...(merchantMismatch
      ? {}
      : {
          merchantCode: leaseMerchant || config.merchantCode,
          branchCode: status?.branch?.code ?? config.branchCode,
          deviceCode: status?.device?.deviceCode ?? config.deviceCode,
        }),
    activationCode: status?.activationCode?.code ?? config.activationCode,
    deviceLabel: status?.device?.label ?? config.deviceLabel,
    leaseStatus: lease?.status ?? "",
    leaseToken: lease?.leaseToken ?? config.leaseToken,
    leaseValidFrom: lease?.validFrom ?? null,
    leaseValidUntil: lease?.validUntil ?? null,
    leaseIssuedAt: lease?.issuedAt ?? null,
    enabled: !!config.enabled,
  };
}

export async function pushPendingToCloud(apiBaseUrl, tables, options = {}) {
  const body = await postCloudJson(
    apiBaseUrl,
    "/sync/push",
    {
      sentAt: new Date().toISOString(),
      deviceId: options.deviceCode ?? options.deviceId ?? "sepela-desktop",
      source: options.source ?? "desktop",
      ...(options.merchantCode ? { merchantCode: options.merchantCode } : {}),
      ...(options.branchCode ? { branchCode: options.branchCode } : {}),
      ...(options.leaseToken ? { leaseToken: options.leaseToken } : {}),
      tables,
    },
    options
  );

  return normalizeSyncResponse(body, tables);
}

export async function activateDeviceOnCloud(apiBaseUrl, payload, options = {}) {
  return postCloudJson(
    apiBaseUrl,
    "/device/activate",
    {
      activationCode: payload.activationCode,
      deviceLabel: payload.deviceLabel,
      ...(payload.deviceCode ? { deviceCode: payload.deviceCode } : {}),
      ...(payload.validDays ? { validDays: payload.validDays } : {}),
    },
    options
  );
}
