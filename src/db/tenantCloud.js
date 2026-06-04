/** Cloud sync fields that belong to a single merchant device binding. */
export function scrubCloudSyncForTenant(cloudSync, tenantMerchantCode) {
  const tenant = String(tenantMerchantCode ?? "").trim();
  const cloud = cloudSync ?? {};
  const cloudMerchant = String(cloud.merchantCode ?? "").trim();

  if (!tenant || !cloudMerchant || cloudMerchant === tenant) {
    return { ...cloud, merchantCode: tenant || cloudMerchant };
  }

  return {
    ...cloud,
    merchantCode: tenant,
    branchCode: "",
    deviceCode: "",
    activationCode: "",
    deviceLabel: "",
    leaseToken: "",
    leaseStatus: "",
    leaseValidFrom: null,
    leaseValidUntil: null,
    leaseIssuedAt: null,
    lastSyncAt: null,
    lastSyncStatus: "idle",
    lastSyncSummary: "",
    lastSyncError: "",
  };
}

export function emptyTenantCloudBinding(cloudSync, tenantMerchantCode, branchCode = "") {
  return {
    ...(cloudSync ?? {}),
    merchantCode: String(tenantMerchantCode ?? "").trim(),
    branchCode: String(branchCode ?? "").trim(),
    deviceCode: "",
    activationCode: "",
    deviceLabel: "",
    leaseToken: "",
    leaseStatus: "",
    leaseValidFrom: null,
    leaseValidUntil: null,
    leaseIssuedAt: null,
  };
}
