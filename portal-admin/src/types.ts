export type PortalTab = "overview" | "merchants" | "accounts" | "activation" | "leases" | "sync";

export type Overview = {
  merchants: number;
  branches: number;
  devices: number;
  activationCodes: { total: number; ready: number };
  offlineLeases: { total: number; active: number };
  syncIngestions: { total: number; lastReceivedAt: string | null };
};

export type Device = {
  id: string;
  deviceCode: string;
  label: string;
  sourceType: string;
  lastSeenAt: string | null;
};

export type Branch = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  countryCode: string | null;
  status: string;
  deviceCount: number;
  devices: Device[];
};

export type IndustryProfile =
  | "pharmacy"
  | "restaurant_bar"
  | "hotel"
  | "general_retail";

export type Merchant = {
  id: string;
  code: string;
  name: string;
  status: string;
  industryProfile: IndustryProfile;
  createdAt: string;
  branchCount: number;
  deviceCount: number;
  branches: Branch[];
};

export type ActivationCode = {
  id: string;
  code: string;
  merchantCode: string;
  branchCode: string | null;
  maxDevices: number;
  expiresAt: string | null;
  status: string;
  createdAt: string;
};

export type Lease = {
  id: string;
  leaseToken: string;
  activationCode: string;
  merchantCode: string;
  branchCode: string | null;
  deviceCode: string;
  validFrom: string;
  validUntil: string;
  status: string;
  issuedAt: string;
};

export type SyncBuckets = Record<string, string[]>;

export type SyncIngestion = {
  id: string;
  deviceCode: string;
  source: string;
  sentAt: string | null;
  receivedAt: string;
  merchantCode?: string | null;
  branchCode?: string | null;
  syncedCount: number;
  failedCount: number;
  synced: SyncBuckets;
  failed: SyncBuckets;
};

export type EditKind = "merchant" | "branch" | "device" | "activation" | "lease" | "operator";

export type Operator = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  credentialsVersion: number;
  merchantCode: string;
  branchCode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};
