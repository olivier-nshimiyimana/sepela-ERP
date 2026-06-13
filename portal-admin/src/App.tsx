import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { ReadOnlyBanner, WriteGate } from "./components/SecurityChrome";
import { SessionExpiryChip } from "./components/SessionExpiryChip";
import { readStoredSessionExpiry, storeSessionExpiry } from "./hooks/useSessionExpiry";
import { ManageModal } from "./components/ManageModal";
import { RowActions } from "./components/RowActions";
import { PortalPage } from "./components/PortalPage";
import { FormCard, FormGrid, FormSection } from "./components/ui/FormCard";
import { FormField } from "./components/ui/FormField";
import { SearchField } from "./components/ui/SearchField";
import type {
  ActivationCode,
  AuditLogEntry,
  EditKind,
  Lease,
  Merchant,
  Operator,
  Overview,
  PortalAdminUser,
  PortalTab,
  PortalUser,
  SecuritySummary,
  SyncBuckets,
  SyncIngestion,
} from "./types";
import {
  filterMerchants,
  filterOperators,
  filterSyncMerchantGroups,
  groupOperatorsByMerchant,
  groupSyncByMerchant,
} from "./utils/grouping";
import {
  DEFAULT_INDUSTRY_PROFILE,
  INDUSTRY_PROFILES,
  industryProfileLabel,
} from "./constants/industryProfiles";
import {
  devicesForActivationWithBranch,
  formatActivationOption,
  formatDeviceOption,
  formatMerchantOption,
} from "./utils/portalSelect";
import { auditEntriesToCsv, downloadCsv } from "./utils/auditCsv";
import { resolveApiBaseUrl } from "./config/api";
import "./App.css";

const AUDIT_PAGE_SIZE = 50;
const ADMIN_SESSION_KEY = "sepela-portal-admin-session";
const API_BASE_URL = resolveApiBaseUrl();

type TenantFormState = {
  merchantCode: string;
  merchantName: string;
  industryProfile: string;
  branchCode: string;
  branchName: string;
  city: string;
  countryCode: string;
  deviceCode: string;
  deviceLabel: string;
};

type ActivationFormState = {
  merchantCode: string;
  branchCode: string;
  maxDevices: string;
  expiresAt: string;
};

type LeaseFormState = {
  activationCode: string;
  deviceCode: string;
  validDays: string;
};

type OperatorFormState = {
  merchantCode: string;
  branchCode: string;
  username: string;
  displayName: string;
  password: string;
  role: string;
};

type PortalUserFormState = {
  username: string;
  displayName: string;
  password: string;
  role: string;
};

const TABS: PortalTab[] = ["overview", "merchants", "accounts", "activation", "leases", "sync", "audit"];

const TAB_LABELS: Record<PortalTab, string> = {
  overview: "Overview",
  merchants: "Merchants",
  accounts: "Accounts",
  activation: "Activation",
  leases: "Leases",
  sync: "Sync",
  portal_users: "Portal users",
  audit: "Audit log",
};

const PORTAL_USER_ROLES = [
  { value: "super_admin", label: "Super admin" },
  { value: "admin", label: "Admin" },
  { value: "read_only", label: "Read only" },
];

const initialTenantForm: TenantFormState = {
  merchantCode: "",
  merchantName: "",
  industryProfile: DEFAULT_INDUSTRY_PROFILE,
  branchCode: "",
  branchName: "",
  city: "",
  countryCode: "",
  deviceCode: "",
  deviceLabel: "",
};

const initialActivationForm: ActivationFormState = {
  merchantCode: "",
  branchCode: "",
  maxDevices: "1",
  expiresAt: "",
};

const initialLeaseForm: LeaseFormState = {
  activationCode: "",
  deviceCode: "",
  validDays: "30",
};

const initialOperatorForm: OperatorFormState = {
  merchantCode: "",
  branchCode: "",
  username: "",
  displayName: "",
  password: "",
  role: "cashier",
};

const initialPortalUserForm: PortalUserFormState = {
  username: "",
  displayName: "",
  password: "",
  role: "admin",
};

const OPERATOR_ROLES = [
  { value: "cashier", label: "Cashier" },
  { value: "manager", label: "Manager" },
  { value: "boss", label: "Owner" },
];

type EditDraft = {
  kind: EditKind;
  id: string;
  name: string;
  status: string;
  city: string;
  countryCode: string;
  label: string;
  deviceCode: string;
  maxDevices: string;
  expiresAt: string;
  username?: string;
  displayName?: string;
  role?: string;
  password?: string;
  merchantCode?: string;
  branchCode?: string;
  industryProfile?: string;
};

function App() {
  const [adminSession, setAdminSession] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) || ""
  );
  const [portalAdmin, setPortalAdmin] = useState<PortalAdminUser | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(() => readStoredSessionExpiry());
  const [authChecked, setAuthChecked] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");

  const [activeTab, setActiveTab] = useState<PortalTab>("overview");
  const [tenantFormOpen, setTenantFormOpen] = useState(false);
  const [branchFormMerchantId, setBranchFormMerchantId] = useState<string | null>(null);
  const [activationFormOpen, setActivationFormOpen] = useState(false);
  const [leaseFormOpen, setLeaseFormOpen] = useState(false);
  const [operatorFormOpen, setOperatorFormOpen] = useState(false);
  const [portalUserFormOpen, setPortalUserFormOpen] = useState(false);
  const [portalUserSearch, setPortalUserSearch] = useState("");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [syncSearch, setSyncSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [expandedMerchantId, setExpandedMerchantId] = useState<string | null>(null);
  const [expandedAccountMerchant, setExpandedAccountMerchant] = useState<string | null>(null);
  const [expandedSyncMerchant, setExpandedSyncMerchant] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [syncIngestions, setSyncIngestions] = useState<SyncIngestion[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditNextBefore, setAuditNextBefore] = useState<string | null>(null);
  const [securitySummary, setSecuritySummary] = useState<SecuritySummary | null>(null);

  const [tenantForm, setTenantForm] = useState<TenantFormState>(initialTenantForm);
  const [branchForm, setBranchForm] = useState({
    code: "",
    name: "",
    city: "",
    countryCode: "",
  });
  const [activationForm, setActivationForm] = useState<ActivationFormState>(initialActivationForm);
  const [leaseForm, setLeaseForm] = useState<LeaseFormState>(initialLeaseForm);
  const [operatorForm, setOperatorForm] = useState<OperatorFormState>(initialOperatorForm);
  const [portalUserForm, setPortalUserForm] = useState<PortalUserFormState>(initialPortalUserForm);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    if (adminSession) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, adminSession);
    } else {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
  }, [adminSession]);

  const isSuperAdmin = portalAdmin?.role === "super_admin";
  const canWrite = portalAdmin?.role !== "read_only";
  const connectionReady = Boolean(adminSession) && Boolean(portalAdmin);
  const visibleTabs = useMemo(() => {
    const tabs: PortalTab[] = [...TABS];
    if (isSuperAdmin) tabs.push("portal_users");
    return tabs;
  }, [isSuperAdmin]);

  const filteredAuditLog = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (!query) return auditLog;
    return auditLog.filter((entry) => {
      const haystack = [
        entry.action,
        entry.path,
        entry.adminUsername,
        entry.method,
        entry.targetType,
        entry.targetId,
        entry.ipAddress,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [auditLog, auditSearch]);

  const statCards = useMemo(
    () =>
      overview
        ? [
            { label: "Merchants", value: String(overview.merchants), hint: `${overview.branches} branches` },
            { label: "Devices", value: String(overview.devices), hint: "Bound" },
            {
              label: "Codes",
              value: String(overview.activationCodes.total),
              hint: `${overview.activationCodes.ready} ready`,
            },
            {
              label: "Leases",
              value: String(overview.offlineLeases.total),
              hint: `${overview.offlineLeases.active} active`,
            },
            {
              label: "Sync",
              value: String(overview.syncIngestions.total),
              hint: overview.syncIngestions.lastReceivedAt ? formatDate(overview.syncIngestions.lastReceivedAt) : "—",
            },
          ]
        : [],
    [overview]
  );

  const filteredMerchants = useMemo(
    () => filterMerchants(merchants, merchantSearch),
    [merchants, merchantSearch]
  );
  const branchFormMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === branchFormMerchantId) ?? null,
    [merchants, branchFormMerchantId]
  );
  const activeMerchantCount = useMemo(
    () => merchants.filter((merchant) => merchant.status === "ACTIVE").length,
    [merchants]
  );

  const activeMerchants = useMemo(
    () => merchants.filter((merchant) => merchant.status === "ACTIVE"),
    [merchants]
  );

  const activationBranches = useMemo(() => {
    if (!activationForm.merchantCode) return [];
    return merchants.find((m) => m.code === activationForm.merchantCode)?.branches ?? [];
  }, [merchants, activationForm.merchantCode]);

  const selectedLeaseActivation = useMemo(
    () => activationCodes.find((code) => code.code === leaseForm.activationCode) ?? null,
    [activationCodes, leaseForm.activationCode]
  );

  const leaseDeviceOptions = useMemo(
    () => devicesForActivationWithBranch(selectedLeaseActivation, merchants),
    [selectedLeaseActivation, merchants]
  );

  const leaseActivationOptions = useMemo(
    () =>
      activationCodes
        .filter((code) => code.status === "READY")
        .sort((a, b) => a.code.localeCompare(b.code)),
    [activationCodes]
  );
  const tabLabels = useMemo(
    () => ({
      ...TAB_LABELS,
      merchants: `Merchants (${activeMerchantCount})`,
    }),
    [activeMerchantCount]
  );

  const accountMerchantGroups = useMemo(() => {
    const filtered = filterOperators(operators, accountSearch);
    return groupOperatorsByMerchant(filtered, merchants);
  }, [operators, accountSearch, merchants]);

  const filteredPortalUsers = useMemo(() => {
    const query = portalUserSearch.trim().toLowerCase();
    if (!query) return portalUsers;
    return portalUsers.filter((user) => {
      const haystack = `${user.displayName} ${user.username} ${user.role} ${user.status}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [portalUsers, portalUserSearch]);

  const syncMerchantGroups = useMemo(() => {
    const grouped = groupSyncByMerchant(syncIngestions, merchants);
    return filterSyncMerchantGroups(grouped, syncSearch);
  }, [syncIngestions, merchants, syncSearch]);

  useEffect(() => {
    void (async () => {
      if (!adminSession) {
        setAuthChecked(true);
        return;
      }
      try {
        const response = await portalFetch<{ user: PortalAdminUser; sessionExpiresAt: string }>(
          "/admin/auth/me",
          undefined,
          adminSession
        );
        setPortalAdmin(response.user);
        setSessionExpiresAt(response.sessionExpiresAt);
      } catch {
        setAdminSession("");
        setPortalAdmin(null);
      } finally {
        setAuthChecked(true);
      }
    })();
    // Validate stored session once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (connectionReady) {
      void refreshAll({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionReady]);

  async function portalFetch<T>(
    path: string,
    init?: RequestInit,
    sessionOverride?: string
  ): Promise<T> {
    const base = API_BASE_URL;
    if (!base) throw new Error("Set API URL.");
    const session = sessionOverride || adminSession || sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
    if (!session) throw new Error("Sign in required.");

    const hasBody = init?.body !== undefined && init?.body !== null;
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "X-Admin-Session": session,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 401) {
      setAdminSession("");
      setPortalAdmin(null);
      throw new Error(body?.error || "Session expired. Sign in again.");
    }
    if (!response.ok) {
      throw new Error(body?.error || `Request failed (${response.status}).`);
    }
    return body as T;
  }

  async function handleLogin(username: string, password: string) {
    const base = API_BASE_URL;
    if (!base) {
      setLoginError("Set API URL.");
      return;
    }
    setBusy(true);
    setLoginError("");
    try {
      const response = await fetch(`${base}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        sessionToken?: string;
        sessionExpiresAt?: string;
        user?: PortalAdminUser;
      } | null;
      if (!response.ok || !body?.sessionToken || !body.user || !body.sessionExpiresAt) {
        throw new Error(body?.error || `Sign in failed (${response.status}).`);
      }
      setAdminSession(body.sessionToken);
      setPortalAdmin(body.user);
      setSessionExpiresAt(body.sessionExpiresAt);
      storeSessionExpiry(body.sessionExpiresAt);
      setMessageTone("success");
      setMessage(`Signed in as ${body.user.displayName}.`);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(expiredMessage?: string) {
    setBusy(true);
    try {
      if (adminSession) {
        await portalFetch("/admin/auth/logout", { method: "POST" });
      }
    } catch {
      // Ignore logout errors and clear local session anyway.
    } finally {
      setAdminSession("");
      setPortalAdmin(null);
      setSessionExpiresAt(null);
      storeSessionExpiry(null);
      setOverview(null);
      setMerchants([]);
      setOperators([]);
      setPortalUsers([]);
      setActivationCodes([]);
      setLeases([]);
      setSyncIngestions([]);
      setAuditLog([]);
      setMessage(expiredMessage ?? "");
      setMessageTone(expiredMessage ? "error" : "neutral");
      setBusy(false);
    }
  }

  const handleSessionExpired = useCallback(() => {
    void handleLogout("Your session expired. Sign in again.");
  }, [adminSession]);

  async function handleExtendSession() {
    const response = await portalFetch<{ sessionExpiresAt: string }>("/admin/auth/refresh", {
      method: "POST",
    });
    setSessionExpiresAt(response.sessionExpiresAt);
    storeSessionExpiry(response.sessionExpiresAt);
    setMessageTone("success");
    setMessage("Session extended.");
  }

  async function refreshAll(options?: { silent?: boolean }) {
    if (!connectionReady) {
      if (!options?.silent) {
        setMessageTone("error");
        setMessage("Configure connection first.");
      }
      return;
    }

    setBusy(true);
    if (!options?.silent) {
      setMessageTone("neutral");
      setMessage("Refreshing…");
    }
    try {
      const requests: Promise<unknown>[] = [
        portalFetch<{ overview: Overview }>("/admin/overview"),
        portalFetch<{ merchants: Merchant[] }>("/admin/merchants"),
        portalFetch<{ operators: Operator[] }>("/admin/operators"),
        portalFetch<{ activationCodes: ActivationCode[] }>("/admin/activation-codes?limit=25"),
        portalFetch<{ leases: Lease[] }>("/admin/offline-leases?limit=25"),
        portalFetch<{ syncIngestions: SyncIngestion[] }>("/admin/sync-ingestions?limit=100"),
        portalFetch<{ auditLog: AuditLogEntry[]; hasMore: boolean; nextBefore: string | null }>(
          `/admin/audit-log?limit=${AUDIT_PAGE_SIZE}`
        ),
        portalFetch<{ summary: SecuritySummary }>("/admin/security-summary"),
      ];
      if (isSuperAdmin) {
        requests.push(portalFetch<{ portalUsers: PortalUser[] }>("/admin/portal-users"));
      }

      const results = await Promise.all(requests);
      const [overviewRes, merchantsRes, operatorsRes, activationRes, leasesRes, syncRes, auditRes, securityRes] =
        results as [
        { overview: Overview },
        { merchants: Merchant[] },
        { operators: Operator[] },
        { activationCodes: ActivationCode[] },
        { leases: Lease[] },
        { syncIngestions: SyncIngestion[] },
        { auditLog: AuditLogEntry[]; hasMore: boolean; nextBefore: string | null },
        { summary: SecuritySummary },
      ];

      setOverview(overviewRes.overview);
      setMerchants(merchantsRes.merchants);
      setOperators(operatorsRes.operators);
      setActivationCodes(activationRes.activationCodes);
      setLeases(leasesRes.leases);
      setSyncIngestions(syncRes.syncIngestions);
      setAuditLog(auditRes.auditLog);
      setAuditHasMore(auditRes.hasMore);
      setAuditNextBefore(auditRes.nextBefore);
      setSecuritySummary(securityRes.summary);
      if (isSuperAdmin && results[8]) {
        setPortalUsers((results[8] as { portalUsers: PortalUser[] }).portalUsers);
      }
      if (!options?.silent) {
        setMessageTone("success");
        setMessage("Data refreshed.");
      }
    } catch (error) {
      if (!options?.silent) {
        setMessageTone("error");
        setMessage(error instanceof Error ? error.message : "Refresh failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreAudit() {
    if (!auditHasMore || !auditNextBefore || busy) return;
    setBusy(true);
    try {
      const response = await portalFetch<{
        auditLog: AuditLogEntry[];
        hasMore: boolean;
        nextBefore: string | null;
      }>(`/admin/audit-log?limit=${AUDIT_PAGE_SIZE}&before=${encodeURIComponent(auditNextBefore)}`);
      setAuditLog((current) => [...current, ...response.auditLog]);
      setAuditHasMore(response.hasMore);
      setAuditNextBefore(response.nextBefore);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Could not load more audit events.");
    } finally {
      setBusy(false);
    }
  }

  function exportVisibleAuditCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`sepela-portal-audit-visible-${stamp}.csv`, auditEntriesToCsv(filteredAuditLog));
    setMessageTone("success");
    setMessage(`Exported ${filteredAuditLog.length} visible audit events.`);
  }

  async function exportAllAuditCsv() {
    setBusy(true);
    try {
      const base = API_BASE_URL;
      const session = adminSession || sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
      const response = await fetch(`${base}/admin/audit-log/export?limit=2000`, {
        headers: { "X-Admin-Session": session },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Export failed (${response.status}).`);
      }
      const csv = await response.text();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`sepela-portal-audit-${stamp}.csv`, csv);
      setMessageTone("success");
      setMessage("Audit log exported.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!connectionReady) return;
    void refreshAll({ silent: true });
  }, [connectionReady]);

  async function handleBootstrapTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await portalFetch("/admin/bootstrap-tenant", {
        method: "POST",
        body: JSON.stringify({
          merchantCode: tenantForm.merchantCode.trim(),
          merchantName: tenantForm.merchantName.trim(),
          industryProfile: tenantForm.industryProfile,
          branchCode: tenantForm.branchCode.trim(),
          branchName: tenantForm.branchName.trim(),
          city: emptyToUndefined(tenantForm.city),
          countryCode: emptyToUndefined(tenantForm.countryCode),
          deviceCode: tenantForm.deviceCode.trim(),
          deviceLabel: tenantForm.deviceLabel.trim(),
        }),
      });
      setTenantForm(initialTenantForm);
      setTenantFormOpen(false);
      await refreshAll();
      setMessageTone("success");
      setMessage("Merchant saved.");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateBranch(event: FormEvent<HTMLFormElement>, merchant: Merchant) {
    event.preventDefault();
    setBusy(true);
    try {
      await portalFetch("/admin/branches", {
        method: "POST",
        body: JSON.stringify({
          merchantId: merchant.id,
          code: branchForm.code.trim(),
          name: branchForm.name.trim(),
          city: emptyToUndefined(branchForm.city),
          countryCode: emptyToUndefined(branchForm.countryCode),
        }),
      });
      const branchName = branchForm.name.trim();
      setBranchForm({ code: "", name: "", city: "", countryCode: "" });
      setBranchFormMerchantId(null);
      await refreshAll();
      setMessageTone("success");
      setMessage(
        `Branch "${branchName}" added to ${merchant.name}. Create an activation code for this branch, then activate a POS device.`
      );
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Could not add branch.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateActivationCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await portalFetch<{ activationCode: ActivationCode }>("/admin/activation-codes", {
        method: "POST",
        body: JSON.stringify({
          merchantCode: activationForm.merchantCode.trim(),
          branchCode: emptyToUndefined(activationForm.branchCode),
          maxDevices: Number(activationForm.maxDevices || "1"),
          expiresAt: activationForm.expiresAt ? new Date(activationForm.expiresAt).toISOString() : undefined,
        }),
      });
      setActivationForm(initialActivationForm);
      setActivationFormOpen(false);
      await refreshAll();
      setMessageTone("success");
      setMessage(`Code created: ${response.activationCode.code}`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleIssueLease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const deviceCode = leaseForm.deviceCode.trim();
    try {
      await portalFetch<{ lease: Lease }>("/admin/offline-leases", {
        method: "POST",
        body: JSON.stringify({
          activationCode: leaseForm.activationCode.trim(),
          deviceCode,
          validDays: Number(leaseForm.validDays || "30"),
        }),
      });
      setLeaseForm(initialLeaseForm);
      setLeaseFormOpen(false);
      await refreshAll();
      setMessageTone("success");
      setMessage(`Lease issued for ${deviceCode}.`);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Issue failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessageTone("success");
      setMessage("Copied.");
    } catch {
      setMessageTone("error");
      setMessage("Copy failed.");
    }
  }

  async function runManagedAction(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      await refreshAll();
      setMessageTone("success");
      setMessage(successMessage);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(label: string) {
    return window.confirm(`Delete ${label}? This cannot be undone.`);
  }

  function toDateInput(value: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDraft || !canWrite) return;

    await runManagedAction(async () => {
      if (editDraft.kind === "merchant") {
        await portalFetch(`/admin/merchants/${editDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: editDraft.name.trim(),
            status: editDraft.status,
            industryProfile: editDraft.industryProfile,
          }),
        });
      } else if (editDraft.kind === "branch") {
        await portalFetch(`/admin/branches/${editDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: editDraft.name.trim(),
            city: editDraft.city.trim() || null,
            countryCode: editDraft.countryCode.trim() || null,
            status: editDraft.status,
          }),
        });
      } else if (editDraft.kind === "device") {
        await portalFetch(`/admin/devices/${editDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: editDraft.label.trim(),
            deviceCode: editDraft.deviceCode.trim(),
          }),
        });
      } else if (editDraft.kind === "activation") {
        await portalFetch(`/admin/activation-codes/${editDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            maxDevices: Number(editDraft.maxDevices || "1"),
            expiresAt: editDraft.expiresAt
              ? new Date(`${editDraft.expiresAt}T23:59:59.000Z`).toISOString()
              : null,
            status: editDraft.status,
          }),
        });
      } else if (editDraft.kind === "lease") {
        await portalFetch(`/admin/offline-leases/${editDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: editDraft.status }),
        });
      } else if (editDraft.kind === "operator") {
        await portalFetch(`/admin/operators/${editDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: (editDraft.displayName ?? "").trim(),
            role: editDraft.role ?? "cashier",
            status: editDraft.status,
            ...(editDraft.password && editDraft.password.trim() ? { password: editDraft.password } : {}),
            branchCode: (editDraft.branchCode ?? "").trim() || null,
          }),
        });
      } else if (editDraft.kind === "portal_user") {
        await portalFetch(`/admin/portal-users/${editDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: (editDraft.displayName ?? "").trim(),
            role: editDraft.role ?? "admin",
            status: editDraft.status,
            ...(editDraft.password && editDraft.password.trim() ? { password: editDraft.password } : {}),
          }),
        });
      }
      setEditDraft(null);
    }, "Saved.");
  }

  if (!authChecked) {
    return (
      <div className="app-shell">
        <p className="toast neutral">Checking session…</p>
      </div>
    );
  }

  if (!portalAdmin) {
    return (
      <LoginScreen
        busy={busy}
        error={loginError}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/appicon.png?v=4" alt="" className="brand-mark" width={40} height={40} />
          <div>
            <p className="eyebrow">Sepela</p>
            <h1 className="brand-title">Portal</h1>
          </div>
        </div>

        <nav className="tab-nav" aria-label="Sections">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-button ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <span className="session-chip muted">
            {portalAdmin.displayName} · {portalUserRoleLabel(portalAdmin.role)}
          </span>
          <SessionExpiryChip
            sessionExpiresAt={sessionExpiresAt}
            onExpired={handleSessionExpired}
            onExtendSession={handleExtendSession}
          />
          <button type="button" className="ghost-button" onClick={() => void handleLogout(undefined)} disabled={busy}>
            Sign out
          </button>
          <button type="button" className="primary-button" onClick={() => void refreshAll()} disabled={busy}>
            {busy ? "…" : "Refresh"}
          </button>
        </div>
      </header>

      {!canWrite ? <ReadOnlyBanner /> : null}

      {message ? <p className={`toast ${messageTone}`}>{message}</p> : null}

      <main className="workspace panel">
        {activeTab === "overview" && (
          <PortalPage
            variant="overview"
            head={
              <div className="pane-toolbar">
                <h2>Overview</h2>
              </div>
            }
          >
            <div className="stats-grid">
              {statCards.length === 0 ? (
                <EmptyState text={busy ? "Loading metrics…" : "No metrics available."} />
              ) : (
                statCards.map((card) => (
                  <article key={card.label} className="stat-card">
                    <p>{card.label}</p>
                    <strong>{card.value}</strong>
                    <span>{card.hint}</span>
                  </article>
                ))
              )}
            </div>
            <div className="quick-actions">
              {TABS.filter((tab) => tab !== "overview").map((tab) => (
                <button key={tab} type="button" className="ghost-button" onClick={() => setActiveTab(tab)}>
                  Open {tabLabels[tab]}
                </button>
              ))}
            </div>
          </PortalPage>
        )}

        {activeTab === "merchants" && (
          <>
          <PortalPage
            head={
              <div className="pane-toolbar">
                <div className="pane-toolbar-title">
                  <h2>Merchants</h2>
                  <span className="portal-meta">
                    {filteredMerchants.length} of {merchants.length} shown
                  </span>
                </div>
                <WriteGate allowed={canWrite}>
                  <button
                    type="button"
                    className={`ghost-button${tenantFormOpen ? " active" : ""}`}
                    onClick={() => {
                      setTenantFormOpen((open) => !open);
                      if (tenantFormOpen) return;
                      setBranchFormMerchantId(null);
                    }}
                  >
                    {tenantFormOpen ? "Close form" : "Add merchant"}
                  </button>
                </WriteGate>
              </div>
            }
            filters={
              <SearchField
                value={merchantSearch}
                onChange={setMerchantSearch}
                placeholder="Search merchants, branches, devices…"
              />
            }
          >
              {merchants.length === 0 ? (
                <EmptyState text="No merchants." />
              ) : filteredMerchants.length === 0 ? (
                <EmptyState text="No merchants match your search." />
              ) : (
                filteredMerchants.map((merchant) => (
                  <article
                    key={merchant.id}
                    className={`group-card compact${expandedMerchantId === merchant.id ? " expanded" : ""}`}
                  >
                    <button
                      type="button"
                      className="group-summary-button"
                      onClick={() =>
                        setExpandedMerchantId((current) => (current === merchant.id ? null : merchant.id))
                      }
                    >
                      <div>
                        <strong>{merchant.name}</strong>
                        <span className="muted">
                          <code>{merchant.code}</code> · <StatusBadge value={merchant.status} /> ·{" "}
                          {industryProfileLabel(merchant.industryProfile)}
                        </span>
                      </div>
                      <div className="chip-row">
                        <span className="chip">{industryProfileLabel(merchant.industryProfile)}</span>
                        <span className="chip">{merchant.branchCount} branches</span>
                        <span className="chip">{merchant.deviceCount} devices</span>
                      </div>
                    </button>
                    {expandedMerchantId === merchant.id ? (
                      <div className="group-card-expand merchant-expand">
                        <div className="merchant-detail-panel">
                          <div className="nested-toolbar">
                            <WriteGate allowed={canWrite}>
                              <RowActions
                              busy={busy}
                              onEdit={() =>
                                setEditDraft({
                                  kind: "merchant",
                                  id: merchant.id,
                                  name: merchant.name,
                                  status: merchant.status,
                                  industryProfile: merchant.industryProfile ?? DEFAULT_INDUSTRY_PROFILE,
                                  city: "",
                                  countryCode: "",
                                  label: "",
                                  deviceCode: "",
                                  maxDevices: "1",
                                  expiresAt: "",
                                })
                              }
                              toggleLabel={merchant.status === "ACTIVE" ? "Deactivate" : "Activate"}
                              onToggle={() =>
                                runManagedAction(async () => {
                                  const next = merchant.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                                  await portalFetch(`/admin/merchants/${merchant.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({ status: next }),
                                  });
                                }, "Merchant updated.")
                              }
                              onDelete={() => {
                                if (!confirmDelete(`merchant ${merchant.code}`)) return;
                                runManagedAction(
                                  () => portalFetch(`/admin/merchants/${merchant.id}`, { method: "DELETE" }),
                                  "Merchant deleted."
                                );
                              }}
                            />
                            </WriteGate>
                            <WriteGate allowed={canWrite}>
                            <button
                              type="button"
                              className="ghost-button accent-branch"
                              disabled={busy}
                              onClick={() => {
                                setExpandedMerchantId(merchant.id);
                                setTenantFormOpen(false);
                                setBranchFormMerchantId(merchant.id);
                                setBranchForm({ code: "", name: "", city: "", countryCode: "" });
                              }}
                            >
                              Add branch
                            </button>
                            </WriteGate>
                          </div>
                          <div className="merchant-nested-stack">
                            {merchant.branches.map((branch) => (
                              <div key={branch.id} className="branch-block">
                                <div className="branch-block-head">
                                  <div className="branch-block-title">
                                    <strong>{branch.name}</strong>
                                    <code>{branch.code}</code>
                                    <StatusBadge value={branch.status} />
                                    {branch.city ? <span className="muted">{branch.city}</span> : null}
                                  </div>
                                  <WriteGate allowed={canWrite}>
                                    <RowActions
                                    busy={busy}
                                    onEdit={() =>
                                      setEditDraft({
                                        kind: "branch",
                                        id: branch.id,
                                        name: branch.name,
                                        status: branch.status,
                                        city: branch.city ?? "",
                                        countryCode: branch.countryCode ?? "",
                                        label: "",
                                        deviceCode: "",
                                        maxDevices: "1",
                                        expiresAt: "",
                                      })
                                    }
                                    toggleLabel={branch.status === "ACTIVE" ? "Deactivate" : "Activate"}
                                    onToggle={() =>
                                      runManagedAction(async () => {
                                        const next = branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                                        await portalFetch(`/admin/branches/${branch.id}`, {
                                          method: "PATCH",
                                          body: JSON.stringify({ status: next }),
                                        });
                                      }, "Branch updated.")
                                    }
                                    onDelete={() => {
                                      if (!confirmDelete(`branch ${branch.code}`)) return;
                                      runManagedAction(
                                        () => portalFetch(`/admin/branches/${branch.id}`, { method: "DELETE" }),
                                        "Branch deleted."
                                      );
                                    }}
                                  />
                                  </WriteGate>
                                </div>
                                <div className="branch-device-list">
                                  {branch.devices.length === 0 ? (
                                    <p className="muted empty-state">No devices on this branch.</p>
                                  ) : (
                                    branch.devices.map((device) => (
                                      <div key={device.id} className="nested-row">
                                        <div>
                                          <strong>{device.label}</strong>
                                          <p>
                                            <code>{device.deviceCode}</code>
                                          </p>
                                        </div>
                                        <WriteGate allowed={canWrite}>
                                          <RowActions
                                          busy={busy}
                                          onEdit={() =>
                                            setEditDraft({
                                              kind: "device",
                                              id: device.id,
                                              name: "",
                                              status: "",
                                              city: "",
                                              countryCode: "",
                                              label: device.label,
                                              deviceCode: device.deviceCode,
                                              maxDevices: "1",
                                              expiresAt: "",
                                            })
                                          }
                                          onDelete={() => {
                                            if (!confirmDelete(`device ${device.deviceCode}`)) return;
                                            runManagedAction(
                                              () => portalFetch(`/admin/devices/${device.id}`, { method: "DELETE" }),
                                              "Device deleted."
                                            );
                                          }}
                                        />
                                        </WriteGate>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
          </PortalPage>

        {canWrite && (tenantFormOpen || branchFormMerchant) ? (
            <>
            <button
              type="button"
              className="form-drawer-backdrop"
              aria-label="Close form"
              onClick={() => {
                setTenantFormOpen(false);
                setBranchFormMerchantId(null);
              }}
            />
            <aside className="form-drawer">
                  {tenantFormOpen ? (
                    <FormCard
                      eyebrow="New company"
                      title="Add merchant"
                      description="Creates the company, its first branch, and the first POS device in one step."
                      onSubmit={handleBootstrapTenant}
                      onClose={() => setTenantFormOpen(false)}
                      actions={
                        <button type="submit" className="primary-button" disabled={busy || !connectionReady}>
                          Create merchant
                        </button>
                      }
                    >
                      <FormSection title="Company" description="Merchant identity and industry template.">
                        <FormGrid columns={1}>
                          <FormField
                            label="Merchant code"
                            required
                            placeholder="e.g. acme-pharmacy"
                            value={tenantForm.merchantCode}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, merchantCode: event.target.value }))
                            }
                          />
                          <FormField
                            label="Merchant name"
                            required
                            placeholder="e.g. Acme Pharmacy"
                            value={tenantForm.merchantName}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, merchantName: event.target.value }))
                            }
                          />
                          <FormField
                            as="select"
                            label="Industry profile"
                            required
                            value={tenantForm.industryProfile}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, industryProfile: event.target.value }))
                            }
                          >
                            {INDUSTRY_PROFILES.map((profile) => (
                              <option key={profile.value} value={profile.value}>
                                {profile.label}
                              </option>
                            ))}
                          </FormField>
                        </FormGrid>
                      </FormSection>

                      <FormSection
                        title="First branch"
                        description="You can add more branches later from the merchant card."
                      >
                        <FormGrid columns={1}>
                          <FormField
                            label="Branch code"
                            required
                            placeholder="e.g. kinshasa-01"
                            value={tenantForm.branchCode}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, branchCode: event.target.value }))
                            }
                          />
                          <FormField
                            label="Branch name"
                            required
                            placeholder="e.g. Gombe Main"
                            value={tenantForm.branchName}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, branchName: event.target.value }))
                            }
                          />
                          <FormField
                            label="City"
                            placeholder="Optional"
                            value={tenantForm.city}
                            onChange={(event) => setTenantForm((prev) => ({ ...prev, city: event.target.value }))}
                          />
                          <FormField
                            label="Country code"
                            placeholder="e.g. CD"
                            value={tenantForm.countryCode}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, countryCode: event.target.value }))
                            }
                          />
                        </FormGrid>
                      </FormSection>

                      <FormSection
                        title="First device"
                        description="POS terminal that will activate with an activation code."
                      >
                        <FormGrid columns={1}>
                          <FormField
                            label="Device code"
                            required
                            placeholder="e.g. pos-gombe-01"
                            value={tenantForm.deviceCode}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, deviceCode: event.target.value }))
                            }
                          />
                          <FormField
                            label="Device label"
                            required
                            placeholder="e.g. Gombe counter 1"
                            value={tenantForm.deviceLabel}
                            onChange={(event) =>
                              setTenantForm((prev) => ({ ...prev, deviceLabel: event.target.value }))
                            }
                          />
                        </FormGrid>
                      </FormSection>
                    </FormCard>
                  ) : null}

                  {branchFormMerchant ? (
                    <FormCard
                      eyebrow="New branch"
                      title={branchFormMerchant.name}
                      description="Add another location under this merchant. Then create an activation code and activate a POS device."
                      onSubmit={(event) => handleCreateBranch(event, branchFormMerchant)}
                      onClose={() => setBranchFormMerchantId(null)}
                      actions={
                        <button type="submit" className="primary-button" disabled={busy}>
                          Save branch
                        </button>
                      }
                    >
                      <FormGrid columns={1}>
                        <FormField
                          label="Branch code"
                          required
                          placeholder="e.g. kinshasa-02"
                          value={branchForm.code}
                          onChange={(event) => setBranchForm((prev) => ({ ...prev, code: event.target.value }))}
                          hint="Short unique ID used in activation codes and reports."
                        />
                        <FormField
                          label="Branch name"
                          required
                          placeholder="e.g. Gombe Store"
                          value={branchForm.name}
                          onChange={(event) => setBranchForm((prev) => ({ ...prev, name: event.target.value }))}
                        />
                        <FormField
                          label="City"
                          placeholder="Optional"
                          value={branchForm.city}
                          onChange={(event) => setBranchForm((prev) => ({ ...prev, city: event.target.value }))}
                        />
                        <FormField
                          label="Country code"
                          placeholder="e.g. CD"
                          value={branchForm.countryCode}
                          onChange={(event) =>
                            setBranchForm((prev) => ({ ...prev, countryCode: event.target.value }))
                          }
                        />
                      </FormGrid>
                    </FormCard>
                  ) : null}
                </aside>
            </>
            ) : null}
          </>
        )}

        {activeTab === "accounts" && (
          <PortalPage
            head={
              <div className="pane-toolbar">
                <h2>Accounts</h2>
                <WriteGate allowed={canWrite}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setOperatorFormOpen((open) => !open)}
                  >
                    {operatorFormOpen ? "Hide form" : "Add operator"}
                  </button>
                </WriteGate>
              </div>
            }
            filters={
              <>
                <SearchField
                  value={accountSearch}
                  onChange={setAccountSearch}
                  placeholder="Search name, username, role, merchant, branch…"
                />
                {operatorFormOpen && canWrite ? (
              <form
                className="inline-form stack"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  try {
                    const username = operatorForm.username.trim().toLowerCase();
                    if (username.length < 2) {
                      throw new Error("Username must be at least 2 characters.");
                    }
                    const availability = await portalFetch<{
                      available: boolean;
                      usedByMerchant: string | null;
                    }>(`/admin/operators/username-available?username=${encodeURIComponent(username)}`);
                    if (!availability.available) {
                      throw new Error(
                        `Username "${username}" is already used by merchant "${availability.usedByMerchant}". Choose a different username.`
                      );
                    }
                    await portalFetch("/admin/operators", {
                      method: "POST",
                      body: JSON.stringify({
                        merchantCode: operatorForm.merchantCode.trim(),
                        ...(operatorForm.branchCode.trim() ? { branchCode: operatorForm.branchCode.trim() } : {}),
                        username,
                        displayName: operatorForm.displayName.trim(),
                        password: operatorForm.password,
                        role: operatorForm.role,
                      }),
                    });
                    setOperatorForm(initialOperatorForm);
                    setOperatorFormOpen(false);
                    await refreshAll();
                    setMessageTone("success");
                    setMessage("Operator created.");
                  } catch (error) {
                    setMessageTone("error");
                    setMessage(error instanceof Error ? error.message : "Create failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="form-grid compact-grid">
                  <label>
                    <span>Merchant code</span>
                    <select
                      value={operatorForm.merchantCode}
                      onChange={(event) =>
                        setOperatorForm((prev) => ({
                          ...prev,
                          merchantCode: event.target.value,
                          branchCode: "",
                        }))
                      }
                      required
                    >
                      <option value="">Select merchant</option>
                      {merchants.map((merchant) => (
                        <option key={merchant.id} value={merchant.code}>
                          {merchant.code} - {merchant.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Branch code</span>
                    <select
                      value={operatorForm.branchCode}
                      onChange={(event) =>
                        setOperatorForm((prev) => ({ ...prev, branchCode: event.target.value }))
                      }
                      disabled={!operatorForm.merchantCode}
                    >
                      <option value="">Any branch</option>
                      {(merchants.find((m) => m.code === operatorForm.merchantCode)?.branches ?? []).map(
                        (branch) => (
                          <option key={branch.id} value={branch.code}>
                            {branch.code} - {branch.name}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Username (unique across all merchants)</span>
                    <input
                      value={operatorForm.username}
                      onChange={(event) =>
                        setOperatorForm((prev) => ({
                          ...prev,
                          username: event.target.value.toLowerCase().replace(/\s+/g, ""),
                        }))
                      }
                      autoComplete="off"
                      minLength={2}
                      required
                    />
                    <span className="field-hint">
                      Each username can only belong to one merchant (e.g. bond, makasi, serge-test).
                    </span>
                  </label>
                  <label>
                    <span>Display name</span>
                    <input
                      value={operatorForm.displayName}
                      onChange={(event) =>
                        setOperatorForm((prev) => ({ ...prev, displayName: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>Role</span>
                    <select
                      value={operatorForm.role}
                      onChange={(event) =>
                        setOperatorForm((prev) => ({ ...prev, role: event.target.value }))
                      }
                    >
                      {OPERATOR_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      value={operatorForm.password}
                      onChange={(event) =>
                        setOperatorForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      minLength={6}
                      required
                    />
                  </label>
                </div>

                <button type="submit" className="primary-button" disabled={busy || !connectionReady}>
                  Create
                </button>
              </form>
                ) : null}
              </>
            }
          >
              {operators.length === 0 ? (
                <EmptyState text="No operators." />
              ) : accountMerchantGroups.length === 0 ? (
                <EmptyState text="No accounts match your search." />
              ) : (
                accountMerchantGroups.map((group) => (
                  <article key={group.merchantCode} className="group-card compact">
                    <button
                      type="button"
                      className="group-summary-button"
                      onClick={() =>
                        setExpandedAccountMerchant((current) =>
                          current === group.merchantCode ? null : group.merchantCode
                        )
                      }
                    >
                      <div>
                        <strong>{group.merchantName}</strong>
                        <span className="muted">
                          <code>{group.merchantCode}</code>
                        </span>
                      </div>
                      <span className="chip">{group.operators.length} accounts</span>
                    </button>
                    {expandedAccountMerchant === group.merchantCode ? (
                      <div className="group-card-expand">
                      {group.operators.map((op) => (
                        <div key={op.id} className="group-item">
                          <div>
                            <strong>{op.displayName}</strong>
                            <p>
                              <code>@{op.username}</code> · <StatusBadge value={op.status} /> ·{" "}
                              {roleLabel(op.role)}
                            </p>
                            <p className="muted">
                              {op.branchCode ? `Branch: ${op.branchCode}` : "All branches"}
                            </p>
                          </div>
                          <WriteGate allowed={canWrite}>
                          <RowActions
                            busy={busy}
                            onEdit={() =>
                              setEditDraft({
                                kind: "operator",
                                id: op.id,
                                name: "",
                                status: op.status,
                                city: "",
                                countryCode: "",
                                label: "",
                                deviceCode: "",
                                maxDevices: "1",
                                expiresAt: "",
                                username: op.username,
                                displayName: op.displayName,
                                role: op.role,
                                password: "",
                                merchantCode: op.merchantCode,
                                branchCode: op.branchCode ?? "",
                              })
                            }
                            toggleLabel={op.status === "ACTIVE" ? "Deactivate" : "Activate"}
                            onToggle={() =>
                              runManagedAction(async () => {
                                const next = op.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                                await portalFetch(`/admin/operators/${op.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: next }),
                                });
                              }, "Operator updated.")
                            }
                            onDelete={() => {
                              if (!confirmDelete(`operator ${op.username}`)) return;
                              runManagedAction(
                                () => portalFetch(`/admin/operators/${op.id}`, { method: "DELETE" }),
                                "Operator deleted."
                              );
                            }}
                          />
                          </WriteGate>
                        </div>
                      ))}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
          </PortalPage>
        )}

        {activeTab === "activation" && (
          <PortalPage
            head={
              <div className="pane-toolbar">
                <h2>Activation codes</h2>
                <WriteGate allowed={canWrite}>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setActivationFormOpen((open) => !open)}
                >
                  {activationFormOpen ? "Hide form" : "Create code"}
                </button>
                </WriteGate>
              </div>
            }
            filters={
              activationFormOpen && canWrite ? (
              <form className="inline-form stack" onSubmit={handleCreateActivationCode}>
                <div className="form-grid compact-grid">
                  <label>
                    <span>Merchant</span>
                    <select
                      value={activationForm.merchantCode}
                      onChange={(event) =>
                        setActivationForm((prev) => ({
                          ...prev,
                          merchantCode: event.target.value,
                          branchCode: "",
                        }))
                      }
                      required
                    >
                      <option value="">Select merchant</option>
                      {activeMerchants.map((merchant) => (
                        <option key={merchant.id} value={merchant.code}>
                          {formatMerchantOption(merchant)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Branch</span>
                    <select
                      value={activationForm.branchCode}
                      onChange={(event) =>
                        setActivationForm((prev) => ({ ...prev, branchCode: event.target.value }))
                      }
                      disabled={!activationForm.merchantCode}
                    >
                      <option value="">Any branch</option>
                      {activationBranches
                        .filter((branch) => branch.status === "ACTIVE")
                        .map((branch) => (
                          <option key={branch.id} value={branch.code}>
                            {branch.code} — {branch.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>Max devices</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={activationForm.maxDevices}
                      onChange={(event) => setActivationForm((prev) => ({ ...prev, maxDevices: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span>Expires</span>
                    <input
                      type="date"
                      value={activationForm.expiresAt}
                      onChange={(event) => setActivationForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
                    />
                  </label>
                </div>
                <button type="submit" className="primary-button" disabled={busy || !connectionReady}>
                  Create
                </button>
              </form>
              ) : null
            }
          >
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Merchant</th>
                    <th>Branch</th>
                    <th>Limit</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activationCodes.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState text="No codes." />
                      </td>
                    </tr>
                  ) : (
                    activationCodes.map((code) => (
                      <tr key={code.id}>
                        <td>
                          <button type="button" className="link-button" onClick={() => copyToClipboard(code.code)}>
                            {code.code}
                          </button>
                        </td>
                        <td>{code.merchantCode}</td>
                        <td>{code.branchCode || "All"}</td>
                        <td>{code.maxDevices}</td>
                        <td>
                          <StatusBadge value={code.status} />
                        </td>
                        <td>{formatDate(code.expiresAt)}</td>
                        <td>
                          <WriteGate allowed={canWrite}>
                          <RowActions
                            busy={busy}
                            onEdit={() =>
                              setEditDraft({
                                kind: "activation",
                                id: code.id,
                                name: "",
                                status: code.status,
                                city: "",
                                countryCode: "",
                                label: "",
                                deviceCode: "",
                                maxDevices: String(code.maxDevices),
                                expiresAt: toDateInput(code.expiresAt),
                              })
                            }
                            toggleLabel={code.status === "READY" ? "Disable" : "Enable"}
                            onToggle={() =>
                              runManagedAction(async () => {
                                const next = code.status === "READY" ? "DISABLED" : "READY";
                                await portalFetch(`/admin/activation-codes/${code.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: next }),
                                });
                              }, "Activation code updated.")
                            }
                            onDelete={() => {
                              if (!confirmDelete(`activation code ${code.code}`)) return;
                              runManagedAction(
                                () => portalFetch(`/admin/activation-codes/${code.id}`, { method: "DELETE" }),
                                "Activation code deleted."
                              );
                            }}
                          />
                          </WriteGate>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PortalPage>
        )}

        {activeTab === "leases" && (
          <PortalPage
            head={
              <div className="pane-toolbar">
                <h2>Offline leases</h2>
                <WriteGate allowed={canWrite}>
                <button type="button" className="ghost-button" onClick={() => setLeaseFormOpen((open) => !open)}>
                  {leaseFormOpen ? "Hide form" : "Issue lease"}
                </button>
                </WriteGate>
              </div>
            }
            filters={
              leaseFormOpen && canWrite ? (
              <form className="inline-form stack" onSubmit={handleIssueLease}>
                <div className="form-grid compact-grid">
                  <label>
                    <span>Activation code</span>
                    <select
                      value={leaseForm.activationCode}
                      onChange={(event) => {
                        const activationCode = event.target.value;
                        const activation =
                          activationCodes.find((code) => code.code === activationCode) ?? null;
                        const devices = devicesForActivationWithBranch(activation, merchants);
                        setLeaseForm((prev) => ({
                          ...prev,
                          activationCode,
                          deviceCode: devices.some((d) => d.deviceCode === prev.deviceCode)
                            ? prev.deviceCode
                            : (devices[0]?.deviceCode ?? ""),
                        }));
                      }}
                      required
                    >
                      <option value="">Select activation code</option>
                      {leaseActivationOptions.map((code) => (
                        <option key={code.id} value={code.code}>
                          {formatActivationOption(code, merchants)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Device</span>
                    <select
                      value={leaseForm.deviceCode}
                      onChange={(event) =>
                        setLeaseForm((prev) => ({ ...prev, deviceCode: event.target.value }))
                      }
                      disabled={!leaseForm.activationCode || leaseDeviceOptions.length === 0}
                      required
                    >
                      <option value="">
                        {!leaseForm.activationCode
                          ? "Select activation code first"
                          : leaseDeviceOptions.length === 0
                            ? "No devices for this merchant/branch"
                            : "Select device"}
                      </option>
                      {leaseDeviceOptions.map((device) => (
                        <option key={device.id} value={device.deviceCode}>
                          {formatDeviceOption(device, device.branchCode)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Days</span>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={leaseForm.validDays}
                      onChange={(event) => setLeaseForm((prev) => ({ ...prev, validDays: event.target.value }))}
                      required
                    />
                  </label>
                </div>
                <button type="submit" className="primary-button" disabled={busy || !connectionReady}>
                  Issue
                </button>
              </form>
              ) : null
            }
          >
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Activation</th>
                    <th>Device</th>
                    <th>Window</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leases.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState text="No leases." />
                      </td>
                    </tr>
                  ) : (
                    leases.map((lease) => (
                      <tr key={lease.id}>
                        <td>
                          <button type="button" className="link-button" onClick={() => copyToClipboard(lease.leaseToken)}>
                            {shorten(lease.leaseToken)}
                          </button>
                        </td>
                        <td>
                          <div>{lease.activationCode}</div>
                          <small className="muted">
                            {lease.merchantCode}/{lease.branchCode || "all"}
                          </small>
                        </td>
                        <td>{lease.deviceCode}</td>
                        <td>
                          <div>{formatDate(lease.validFrom)}</div>
                          <small className="muted">→ {formatDate(lease.validUntil)}</small>
                        </td>
                        <td>
                          <StatusBadge value={lease.status} />
                        </td>
                        <td>
                          <WriteGate allowed={canWrite}>
                          <RowActions
                            busy={busy}
                            onEdit={() =>
                              setEditDraft({
                                kind: "lease",
                                id: lease.id,
                                name: "",
                                status: lease.status,
                                city: "",
                                countryCode: "",
                                label: "",
                                deviceCode: "",
                                maxDevices: "1",
                                expiresAt: "",
                              })
                            }
                            toggleLabel={lease.status === "ACTIVE" ? "Revoke" : "Activate"}
                            onToggle={() =>
                              runManagedAction(async () => {
                                const next = lease.status === "ACTIVE" ? "REVOKED" : "ACTIVE";
                                await portalFetch(`/admin/offline-leases/${lease.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: next }),
                                });
                              }, "Lease updated.")
                            }
                            onDelete={() => {
                              if (!confirmDelete("this lease")) return;
                              runManagedAction(
                                () => portalFetch(`/admin/offline-leases/${lease.id}`, { method: "DELETE" }),
                                "Lease deleted."
                              );
                            }}
                          />
                          </WriteGate>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PortalPage>
        )}

        {activeTab === "audit" && (
          <PortalPage
            head={
              <div className="pane-toolbar">
                <div className="pane-toolbar-title">
                  <h2>Audit log</h2>
                  <span className="portal-meta">
                    {filteredAuditLog.length} shown · {auditLog.length} loaded
                  </span>
                </div>
                <div className="pane-toolbar-actions">
                  <button type="button" className="ghost-button" onClick={exportVisibleAuditCsv} disabled={busy || filteredAuditLog.length === 0}>
                    Export visible
                  </button>
                  <button type="button" className="ghost-button" onClick={() => void exportAllAuditCsv()} disabled={busy}>
                    Export CSV
                  </button>
                </div>
              </div>
            }
            filters={
              <>
                <SearchField
                  value={auditSearch}
                  onChange={setAuditSearch}
                  placeholder="Search action, user, path, IP…"
                />
                {securitySummary &&
                (securitySummary.failedLoginsLastHour >= 5 || securitySummary.securityAlertsLast24h > 0) ? (
                  <div className="security-alert-banner" role="alert">
                    <strong>Security notice</strong>
                    <span>
                      {securitySummary.failedLoginsLastHour} failed logins in the last hour
                      {securitySummary.securityAlertsLast24h > 0
                        ? ` · ${securitySummary.securityAlertsLast24h} spike alert(s) in 24h`
                        : ""}
                      {securitySummary.topFailedIps.length > 0
                        ? ` · Top IP: ${securitySummary.topFailedIps[0].ip} (${securitySummary.topFailedIps[0].count})`
                        : ""}
                    </span>
                  </div>
                ) : null}
              </>
            }
          >
            {auditLog.length === 0 ? (
              <EmptyState text="No audit events yet." />
            ) : filteredAuditLog.length === 0 ? (
              <EmptyState text="No audit events match your search." />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table compact">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Path</th>
                        <th>Status</th>
                        <th>IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditLog.map((entry) => (
                        <tr key={entry.id} className={entry.action === "security_alert" ? "audit-row-alert" : ""}>
                          <td>{formatDate(entry.createdAt)}</td>
                          <td>{entry.adminUsername ?? "—"}</td>
                          <td>
                            <code>{entry.action}</code>
                          </td>
                          <td>
                            <span className="muted">
                              {entry.method} {entry.path}
                            </span>
                          </td>
                          <td>
                            <StatusBadge value={entry.statusCode && entry.statusCode < 400 ? "success" : "FAILED"} />
                          </td>
                          <td>{entry.ipAddress ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {auditHasMore ? (
                  <div className="audit-load-more">
                    <button type="button" className="ghost-button" onClick={() => void loadMoreAudit()} disabled={busy}>
                      {busy ? "Loading…" : "Load older events"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </PortalPage>
        )}

        {activeTab === "portal_users" && isSuperAdmin ? (
          <PortalPage
            head={
              <div className="pane-toolbar">
                <h2>Portal users</h2>
                {canWrite ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setPortalUserFormOpen((open) => !open)}
                  >
                    {portalUserFormOpen ? "Hide form" : "Add portal user"}
                  </button>
                ) : null}
              </div>
            }
            filters={
              <>
                <SearchField
                  value={portalUserSearch}
                  onChange={setPortalUserSearch}
                  placeholder="Search name, username, role…"
                />
                {portalUserFormOpen && canWrite ? (
                  <form
                    className="inline-form stack"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setBusy(true);
                      try {
                        const username = portalUserForm.username.trim().toLowerCase();
                        if (username.length < 2) {
                          throw new Error("Username must be at least 2 characters.");
                        }
                        const availability = await portalFetch<{ available: boolean }>(
                          `/admin/portal-users/username-available?username=${encodeURIComponent(username)}`
                        );
                        if (!availability.available) {
                          throw new Error(`Username "${username}" is already taken.`);
                        }
                        await portalFetch("/admin/portal-users", {
                          method: "POST",
                          body: JSON.stringify({
                            username,
                            displayName: portalUserForm.displayName.trim(),
                            password: portalUserForm.password,
                            role: portalUserForm.role,
                          }),
                        });
                        setPortalUserForm(initialPortalUserForm);
                        setPortalUserFormOpen(false);
                        await refreshAll();
                        setMessageTone("success");
                        setMessage("Portal user created.");
                      } catch (error) {
                        setMessageTone("error");
                        setMessage(error instanceof Error ? error.message : "Create failed.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <div className="form-grid compact-grid">
                      <label>
                        <span>Username</span>
                        <input
                          value={portalUserForm.username}
                          onChange={(event) =>
                            setPortalUserForm((prev) => ({
                              ...prev,
                              username: event.target.value.toLowerCase().replace(/\s+/g, ""),
                            }))
                          }
                          autoComplete="off"
                          minLength={2}
                          required
                        />
                      </label>
                      <label>
                        <span>Display name</span>
                        <input
                          value={portalUserForm.displayName}
                          onChange={(event) =>
                            setPortalUserForm((prev) => ({ ...prev, displayName: event.target.value }))
                          }
                          required
                        />
                      </label>
                      <label>
                        <span>Role</span>
                        <select
                          value={portalUserForm.role}
                          onChange={(event) =>
                            setPortalUserForm((prev) => ({ ...prev, role: event.target.value }))
                          }
                        >
                          {PORTAL_USER_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Password</span>
                        <input
                          type="password"
                          value={portalUserForm.password}
                          onChange={(event) =>
                            setPortalUserForm((prev) => ({ ...prev, password: event.target.value }))
                          }
                          minLength={6}
                          required
                        />
                      </label>
                    </div>
                    <button type="submit" className="primary-button" disabled={busy}>
                      Create
                    </button>
                  </form>
                ) : null}
              </>
            }
          >
            {portalUsers.length === 0 ? (
              <EmptyState text="No portal users." />
            ) : filteredPortalUsers.length === 0 ? (
              <EmptyState text="No portal users match your search." />
            ) : (
              <div className="group-card-expand">
                {filteredPortalUsers.map((user) => (
                  <div key={user.id} className="group-item">
                    <div>
                      <strong>{user.displayName}</strong>
                      <p>
                        <code>@{user.username}</code> · <StatusBadge value={user.status} /> ·{" "}
                        {portalUserRoleLabel(user.role)}
                      </p>
                      <p className="muted">
                        Last login: {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}
                      </p>
                    </div>
                    {canWrite ? (
                      <RowActions
                        busy={busy}
                        onEdit={() =>
                          setEditDraft({
                            kind: "portal_user",
                            id: user.id,
                            name: "",
                            status: user.status,
                            city: "",
                            countryCode: "",
                            label: "",
                            deviceCode: "",
                            maxDevices: "1",
                            expiresAt: "",
                            username: user.username,
                            displayName: user.displayName,
                            role: user.role,
                            password: "",
                          })
                        }
                        onDelete={() => {
                          if (user.id === portalAdmin.id) {
                            setMessageTone("error");
                            setMessage("You cannot delete your own account.");
                            return;
                          }
                          if (!confirmDelete(`${user.displayName} (@${user.username})`)) return;
                          void runManagedAction(
                            () => portalFetch(`/admin/portal-users/${user.id}`, { method: "DELETE" }),
                            "Portal user deleted."
                          );
                        }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </PortalPage>
        ) : null}

        {activeTab === "sync" && (
          <PortalPage
            head={
              <div className="pane-toolbar">
                <div className="pane-toolbar-title">
                  <h2>Sync</h2>
                  <span className="portal-meta">
                    {syncMerchantGroups.length} merchants · {syncIngestions.length} events
                  </span>
                </div>
              </div>
            }
            filters={
              <SearchField
                value={syncSearch}
                onChange={setSyncSearch}
                placeholder="Search merchant, device, branch…"
              />
            }
          >
              {syncIngestions.length === 0 ? (
                <EmptyState text="No sync events." />
              ) : syncMerchantGroups.length === 0 ? (
                <EmptyState text="No sync events match your search." />
              ) : (
                syncMerchantGroups.map((group) => (
                  <article key={group.merchantCode} className="group-card compact">
                    <button
                      type="button"
                      className="group-summary-button"
                      onClick={() =>
                        setExpandedSyncMerchant((current) =>
                          current === group.merchantCode ? null : group.merchantCode
                        )
                      }
                    >
                      <div>
                        <strong>{group.merchantName}</strong>
                        <span className="muted">
                          <code>{group.merchantCode}</code> · {formatDate(group.lastReceivedAt)} ·{" "}
                          {group.eventCount} events · {group.deviceCount} devices
                        </span>
                      </div>
                      <div className="chip-row">
                        <span className="chip success">+{group.totalSynced}</span>
                        <span className={`chip ${group.totalFailed > 0 ? "error" : ""}`}>
                          fail {group.totalFailed}
                        </span>
                      </div>
                    </button>
                    {expandedSyncMerchant === group.merchantCode ? (
                      <div className="group-card-expand">
                        {group.devices.map((device) => (
                          <details key={device.deviceCode} className="sync-device-details">
                            <summary>
                              <span>
                                <strong>{device.deviceCode}</strong>
                                {device.deviceLabel ? ` · ${device.deviceLabel}` : ""}
                                {device.branchCode ? ` · ${device.branchName ?? device.branchCode}` : ""}
                              </span>
                              <span className="chip-row">
                                <span className="muted">{formatDate(device.lastReceivedAt)}</span>
                                <span className="chip success">+{device.totalSynced}</span>
                                <span className={`chip ${device.totalFailed > 0 ? "error" : ""}`}>
                                  fail {device.totalFailed}
                                </span>
                              </span>
                            </summary>
                            <div className="sync-event-list">
                              {device.entries.map((entry) => (
                                <details key={entry.id} className="sync-event-details">
                                  <summary>
                                    <span>
                                      {entry.source} · {formatDate(entry.receivedAt)}
                                    </span>
                                    <span className="chip-row">
                                      <span className="chip success">+{entry.syncedCount}</span>
                                      <span className={`chip ${entry.failedCount > 0 ? "error" : ""}`}>
                                        fail {entry.failedCount}
                                      </span>
                                    </span>
                                  </summary>
                                  <div className="sync-expand">
                                    <SyncBucket title="Synced" buckets={entry.synced} />
                                    <SyncBucket title="Failed" buckets={entry.failed} />
                                  </div>
                                </details>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
          </PortalPage>
        )}
      </main>

      {canWrite && editDraft ? (
      <ManageModal
        title={
          editDraft?.kind === "merchant"
            ? "Edit merchant"
            : editDraft?.kind === "branch"
              ? "Edit branch"
              : editDraft?.kind === "device"
                ? "Edit device"
                : editDraft?.kind === "activation"
                  ? "Edit activation code"
                  : editDraft?.kind === "lease"
                    ? "Edit lease"
                    : editDraft?.kind === "operator"
                      ? "Edit operator"
                    : "Edit"
        }
        open={!!editDraft}
        busy={busy}
        onClose={() => setEditDraft(null)}
        onSubmit={handleEditSubmit}
      >
        {editDraft?.kind === "merchant" || editDraft?.kind === "branch" ? (
          <FormGrid>
            <FormField
              label="Name"
              required
              value={editDraft.name}
              onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
            />
            {editDraft.kind === "branch" ? (
              <>
                <FormField
                  label="City"
                  value={editDraft.city}
                  onChange={(event) =>
                    setEditDraft((prev) => (prev ? { ...prev, city: event.target.value } : prev))
                  }
                />
                <FormField
                  label="Country code"
                  value={editDraft.countryCode}
                  onChange={(event) =>
                    setEditDraft((prev) => (prev ? { ...prev, countryCode: event.target.value } : prev))
                  }
                />
              </>
            ) : null}
            {editDraft.kind === "merchant" ? (
              <FormField
                as="select"
                label="Industry profile"
                value={editDraft.industryProfile ?? DEFAULT_INDUSTRY_PROFILE}
                onChange={(event) =>
                  setEditDraft((prev) =>
                    prev ? { ...prev, industryProfile: event.target.value } : prev
                  )
                }
              >
                {INDUSTRY_PROFILES.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label}
                  </option>
                ))}
              </FormField>
            ) : null}
            <FormField
              as="select"
              label="Status"
              value={editDraft.status}
              onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, status: event.target.value } : prev))}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </FormField>
          </FormGrid>
        ) : null}

        {editDraft?.kind === "device" ? (
          <FormGrid>
            <FormField
              label="Label"
              required
              value={editDraft.label}
              onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, label: event.target.value } : prev))}
            />
            <FormField
              label="Device code"
              required
              value={editDraft.deviceCode}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, deviceCode: event.target.value } : prev))
              }
            />
          </FormGrid>
        ) : null}

        {editDraft?.kind === "activation" ? (
          <FormGrid>
            <FormField
              label="Max devices"
              type="number"
              min="1"
              max="100"
              required
              value={editDraft.maxDevices}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, maxDevices: event.target.value } : prev))
              }
            />
            <FormField
              label="Expires"
              type="date"
              value={editDraft.expiresAt}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, expiresAt: event.target.value } : prev))
              }
            />
            <FormField
              as="select"
              label="Status"
              value={editDraft.status}
              onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, status: event.target.value } : prev))}
            >
              <option value="READY">READY</option>
              <option value="DISABLED">DISABLED</option>
            </FormField>
          </FormGrid>
        ) : null}

        {editDraft?.kind === "lease" ? (
          <FormField
            as="select"
            label="Status"
            value={editDraft.status}
            onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, status: event.target.value } : prev))}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="REVOKED">REVOKED</option>
          </FormField>
        ) : null}

        {editDraft?.kind === "operator" ? (
          <FormGrid>
            <FormField
              label="Display name"
              required
              value={editDraft.displayName ?? ""}
              onChange={(event) =>
                setEditDraft((prev) =>
                  prev ? { ...prev, displayName: event.target.value } : prev
                )
              }
            />
            <FormField
              as="select"
              label="Role"
              value={editDraft.role ?? "cashier"}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, role: event.target.value } : prev))
              }
            >
              {OPERATOR_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </FormField>
            <FormField
              as="select"
              label="Status"
              value={editDraft.status}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, status: event.target.value } : prev))
              }
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </FormField>
            <FormField
              label="Branch code"
              value={editDraft.branchCode ?? ""}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, branchCode: event.target.value } : prev))
              }
            />
            <FormField
              label="New password (optional)"
              type="password"
              value={editDraft.password ?? ""}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, password: event.target.value } : prev))
              }
            />
          </FormGrid>
        ) : null}

        {editDraft?.kind === "portal_user" ? (
          <FormGrid>
            <FormField label="Username" value={editDraft.username ?? ""} readOnly />
            <FormField
              label="Display name"
              required
              value={editDraft.displayName ?? ""}
              onChange={(event) =>
                setEditDraft((prev) =>
                  prev ? { ...prev, displayName: event.target.value } : prev
                )
              }
            />
            <FormField
              as="select"
              label="Role"
              value={editDraft.role ?? "admin"}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, role: event.target.value } : prev))
              }
            >
              {PORTAL_USER_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </FormField>
            <FormField
              as="select"
              label="Status"
              value={editDraft.status}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, status: event.target.value } : prev))
              }
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </FormField>
            <FormField
              label="New password (optional)"
              type="password"
              value={editDraft.password ?? ""}
              onChange={(event) =>
                setEditDraft((prev) => (prev ? { ...prev, password: event.target.value } : prev))
              }
            />
          </FormGrid>
        ) : null}
      </ManageModal>
      ) : null}
    </div>
  );
}

function roleLabel(role: string) {
  return OPERATOR_ROLES.find((entry) => entry.value === role)?.label ?? role;
}

function portalUserRoleLabel(role: string) {
  return PORTAL_USER_ROLES.find((entry) => entry.value === role)?.label ?? role;
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "ACTIVE" || value === "READY" || value === "success"
      ? "success"
      : value === "FAILED" ||
          value === "failed" ||
          value === "DISABLED" ||
          value === "INACTIVE" ||
          value === "REVOKED"
        ? "error"
        : "neutral";
  return <span className={`status-badge ${tone}`}>{value}</span>;
}

function SyncBucket({ title, buckets }: { title: string; buckets: SyncBuckets }) {
  const rows = Object.entries(buckets)
    .map(([key, value]) => `${key}: ${value.length}`)
    .filter((entry) => !entry.endsWith(": 0"));

  return (
    <div className="sync-bucket">
      <strong>{title}</strong>
      {rows.length === 0 ? <p className="muted">None</p> : rows.map((row) => <p key={row}>{row}</p>)}
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function shorten(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export default App;
