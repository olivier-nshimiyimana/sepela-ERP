import type { ActivationCode, Device, Merchant } from "../types";

export function formatMerchantOption(merchant: Merchant): string {
  return `${merchant.code} — ${merchant.name}`;
}

export function formatActivationOption(code: ActivationCode, merchants: Merchant[]): string {
  const merchant = merchants.find((m) => m.code === code.merchantCode);
  const merchantLabel = merchant?.name ?? code.merchantCode;
  const branchSuffix = code.branchCode ? ` · branch ${code.branchCode}` : "";
  const statusSuffix = code.status !== "READY" ? ` [${code.status}]` : "";
  return `${code.code} — ${merchantLabel}${branchSuffix}${statusSuffix}`;
}

export function devicesForActivation(
  activation: ActivationCode | null | undefined,
  merchants: Merchant[]
): Device[] {
  if (!activation) return [];
  const merchant = merchants.find((m) => m.code === activation.merchantCode);
  if (!merchant) return [];

  if (activation.branchCode) {
    const branch = merchant.branches.find((b) => b.code === activation.branchCode);
    return branch?.devices ?? [];
  }

  return merchant.branches.flatMap((branch) => branch.devices);
}

export function formatDeviceOption(device: Device, branchCode: string): string {
  return `${device.deviceCode} — ${device.label} (${branchCode})`;
}

/** Flat device list with branch code for lease device picker. */
export function devicesForActivationWithBranch(
  activation: ActivationCode | null | undefined,
  merchants: Merchant[]
): Array<Device & { branchCode: string }> {
  if (!activation) return [];
  const merchant = merchants.find((m) => m.code === activation.merchantCode);
  if (!merchant) return [];

  const branches = activation.branchCode
    ? merchant.branches.filter((b) => b.code === activation.branchCode)
    : merchant.branches;

  return branches.flatMap((branch) =>
    branch.devices.map((device) => ({ ...device, branchCode: branch.code }))
  );
}
