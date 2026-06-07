import { industryProfileLabel } from "../constants/industryProfiles";
import type { Merchant, Operator, SyncIngestion } from "../types";

const ROLE_ORDER = ["boss", "manager", "cashier"];
const UNKNOWN_MERCHANT = "unknown";

export type DeviceContext = {
  merchantCode: string;
  merchantName: string;
  branchCode: string;
  branchName: string;
  deviceLabel: string;
};

export type OperatorMerchantGroup = {
  merchantCode: string;
  merchantName: string;
  operators: Operator[];
};

export type SyncDeviceGroup = {
  deviceCode: string;
  merchantCode: string;
  merchantName: string;
  branchCode: string | null;
  branchName: string | null;
  deviceLabel: string | null;
  entries: SyncIngestion[];
  eventCount: number;
  totalSynced: number;
  totalFailed: number;
  lastReceivedAt: string;
  sources: string[];
};

export type SyncMerchantGroup = {
  merchantCode: string;
  merchantName: string;
  eventCount: number;
  totalSynced: number;
  totalFailed: number;
  lastReceivedAt: string;
  deviceCount: number;
  devices: SyncDeviceGroup[];
};

export function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase();
}

export function matchesSearch(values: Array<string | null | undefined>, query: string) {
  const q = normalizeSearchQuery(query);
  if (!q) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(q));
}

export function buildDeviceContextMap(merchants: Merchant[]) {
  const map = new Map<string, DeviceContext>();
  for (const merchant of merchants) {
    for (const branch of merchant.branches) {
      for (const device of branch.devices) {
        map.set(device.deviceCode, {
          merchantCode: merchant.code,
          merchantName: merchant.name,
          branchCode: branch.code,
          branchName: branch.name,
          deviceLabel: device.label,
        });
      }
    }
  }
  return map;
}

export function filterMerchants(merchants: Merchant[], query: string) {
  const q = normalizeSearchQuery(query);
  if (!q) return merchants;

  return merchants.filter((merchant) => {
    if (
      matchesSearch(
        [merchant.code, merchant.name, merchant.status, merchant.industryProfile, industryProfileLabel(merchant.industryProfile)],
        q
      )
    ) {
      return true;
    }
    return merchant.branches.some(
      (branch) =>
        matchesSearch([branch.code, branch.name, branch.city, branch.countryCode, branch.status], q) ||
        branch.devices.some((device) =>
          matchesSearch([device.deviceCode, device.label, device.sourceType], q)
        )
    );
  });
}

export function filterOperators(operators: Operator[], query: string) {
  if (!normalizeSearchQuery(query)) return operators;
  return operators.filter((op) =>
    matchesSearch(
      [op.displayName, op.username, op.role, op.status, op.merchantCode, op.branchCode],
      query
    )
  );
}

export function filterSyncMerchantGroups(groups: SyncMerchantGroup[], query: string) {
  const q = normalizeSearchQuery(query);
  if (!q) return groups;

  return groups.filter((group) => {
    if (matchesSearch([group.merchantCode, group.merchantName], q)) return true;
    return group.devices.some(
      (device) =>
        matchesSearch(
          [device.deviceCode, device.deviceLabel, device.branchCode, device.branchName],
          q
        ) || device.sources.some((source) => source.toLowerCase().includes(q))
    );
  });
}

function roleRank(role: string) {
  const index = ROLE_ORDER.indexOf(role);
  return index === -1 ? ROLE_ORDER.length : index;
}

export function groupOperatorsByMerchant(
  operators: Operator[],
  merchants: Merchant[]
): OperatorMerchantGroup[] {
  const merchantByCode = new Map(merchants.map((merchant) => [merchant.code, merchant]));
  const groups = new Map<string, OperatorMerchantGroup>();

  for (const operator of operators) {
    const merchantCode = operator.merchantCode || UNKNOWN_MERCHANT;
    if (!groups.has(merchantCode)) {
      const merchant = merchantByCode.get(merchantCode);
      groups.set(merchantCode, {
        merchantCode,
        merchantName: merchant?.name ?? merchantCode,
        operators: [],
      });
    }
    groups.get(merchantCode)!.operators.push(operator);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      operators: [...group.operators].sort((a, b) => {
        const byRole = roleRank(a.role) - roleRank(b.role);
        if (byRole !== 0) return byRole;
        const byBranch = (a.branchCode ?? "").localeCompare(b.branchCode ?? "");
        if (byBranch !== 0) return byBranch;
        return a.displayName.localeCompare(b.displayName);
      }),
    }))
    .sort((a, b) => a.merchantName.localeCompare(b.merchantName));
}

function resolveMerchantMeta(
  merchantCode: string | null | undefined,
  merchants: Merchant[]
) {
  const code = merchantCode?.trim() || UNKNOWN_MERCHANT;
  const merchant = merchants.find((entry) => entry.code === code);
  return {
    merchantCode: code,
    merchantName: merchant?.name ?? (code === UNKNOWN_MERCHANT ? "Unassigned" : code),
  };
}

function groupSyncByDevice(ingestions: SyncIngestion[], merchants: Merchant[]) {
  const deviceContext = buildDeviceContextMap(merchants);
  const groups = new Map<string, SyncDeviceGroup>();

  for (const entry of ingestions) {
    const context = deviceContext.get(entry.deviceCode);
    const merchantCode = entry.merchantCode ?? context?.merchantCode ?? UNKNOWN_MERCHANT;
    const branchCode = entry.branchCode ?? context?.branchCode ?? null;
    const { merchantName } = resolveMerchantMeta(merchantCode, merchants);
    const branchName =
      merchantCode && branchCode
        ? merchants
            .find((merchant) => merchant.code === merchantCode)
            ?.branches.find((branch) => branch.code === branchCode)?.name ?? branchCode
        : null;

    const existing = groups.get(entry.deviceCode);
    if (!existing) {
      groups.set(entry.deviceCode, {
        deviceCode: entry.deviceCode,
        merchantCode,
        merchantName,
        branchCode,
        branchName,
        deviceLabel: context?.deviceLabel ?? null,
        entries: [entry],
        eventCount: 1,
        totalSynced: entry.syncedCount,
        totalFailed: entry.failedCount,
        lastReceivedAt: entry.receivedAt,
        sources: [entry.source],
      });
      continue;
    }

    existing.entries.push(entry);
    existing.eventCount += 1;
    existing.totalSynced += entry.syncedCount;
    existing.totalFailed += entry.failedCount;
    if (new Date(entry.receivedAt).getTime() > new Date(existing.lastReceivedAt).getTime()) {
      existing.lastReceivedAt = entry.receivedAt;
    }
    if (!existing.sources.includes(entry.source)) {
      existing.sources.push(entry.source);
    }
  }

  return Array.from(groups.values());
}

export function groupSyncByMerchant(
  ingestions: SyncIngestion[],
  merchants: Merchant[]
): SyncMerchantGroup[] {
  const deviceGroups = groupSyncByDevice(ingestions, merchants);
  const merchantGroups = new Map<string, SyncMerchantGroup>();

  for (const device of deviceGroups) {
    const existing = merchantGroups.get(device.merchantCode);
    if (!existing) {
      merchantGroups.set(device.merchantCode, {
        merchantCode: device.merchantCode,
        merchantName: device.merchantName,
        eventCount: device.eventCount,
        totalSynced: device.totalSynced,
        totalFailed: device.totalFailed,
        lastReceivedAt: device.lastReceivedAt,
        deviceCount: 1,
        devices: [device],
      });
      continue;
    }

    existing.devices.push(device);
    existing.deviceCount += 1;
    existing.eventCount += device.eventCount;
    existing.totalSynced += device.totalSynced;
    existing.totalFailed += device.totalFailed;
    if (new Date(device.lastReceivedAt).getTime() > new Date(existing.lastReceivedAt).getTime()) {
      existing.lastReceivedAt = device.lastReceivedAt;
    }
  }

  for (const group of merchantGroups.values()) {
    group.devices.sort(
      (a, b) => new Date(b.lastReceivedAt).getTime() - new Date(a.lastReceivedAt).getTime()
    );
  }

  return Array.from(merchantGroups.values()).sort(
    (a, b) => new Date(b.lastReceivedAt).getTime() - new Date(a.lastReceivedAt).getTime()
  );
}
