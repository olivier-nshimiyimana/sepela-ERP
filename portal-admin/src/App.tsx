import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ManageModal } from "./components/ManageModal";
import { RowActions } from "./components/RowActions";
import { PortalPage } from "./components/PortalPage";
import { FormCard, FormGrid, FormSection } from "./components/ui/FormCard";
import { FormField } from "./components/ui/FormField";
import { SearchField } from "./components/ui/SearchField";
import type {
  ActivationCode,
  EditKind,
  Lease,
  Merchant,
  Operator,
  Overview,
  PortalTab,
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
import "./App.css";

const API_BASE_KEY = "sepela-portal-admin-api-base-url";
const API_TOKEN_KEY = "sepela-portal-admin-api-token";

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

const TABS: PortalTab[] = ["overview", "merchants", "accounts", "activation", "leases", "sync"];

const TAB_LABELS: Record<PortalTab, string> = {
  overview: "Overview",
  merchants: "Merchants",
  accounts: "Accounts",
  activation: "Activation",
  leases: "Leases",
  sync: "Sync",
};

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
  const [apiBaseUrl, setApiBaseUrl] = useState(
    localStorage.getItem(API_BASE_KEY) || import.meta.env.VITE_PORTAL_API_BASE_URL || "http://localhost:4000"
  );
  const [apiToken, setApiToken] = useState(localStorage.getItem(API_TOKEN_KEY) || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"neutral" | "success" | "error">("neutral");

  const [activeTab, setActiveTab] = useState<PortalTab>("overview");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [tenantFormOpen, setTenantFormOpen] = useState(false);
  const [branchFormMerchantId, setBranchFormMerchantId] = useState<string | null>(null);
  const [activationFormOpen, setActivationFormOpen] = useState(false);
  const [leaseFormOpen, setLeaseFormOpen] = useState(false);
  const [operatorFormOpen, setOperatorFormOpen] = useState(false);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [syncSearch, setSyncSearch] = useState("");
  const [expandedMerchantId, setExpandedMerchantId] = useState<string | null>(null);
  const [expandedAccountMerchant, setExpandedAccountMerchant] = useState<string | null>(null);
  const [expandedSyncMerchant, setExpandedSyncMerchant] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [syncIngestions, setSyncIngestions] = useState<SyncIngestion[]>([]);

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
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    localStorage.setItem(API_BASE_KEY, apiBaseUrl);
  }, [apiBaseUrl]);

  useEffect(() => {
    localStorage.setItem(API_TOKEN_KEY, apiToken);
  }, [apiToken]);

  const connectionReady = apiBaseUrl.trim().length > 0 && apiToken.trim().length > 0;

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

  const syncMerchantGroups = useMemo(() => {
    const grouped = groupSyncByMerchant(syncIngestions, merchants);
    return filterSyncMerchantGroups(grouped, syncSearch);
  }, [syncIngestions, merchants, syncSearch]);

  const endpointLabel = useMemo(() => {
    const trimmed = apiBaseUrl.trim();
    if (!trimmed) return "—";
    try {
      return new URL(trimmed).host;
    } catch {
      return trimmed;
    }
  }, [apiBaseUrl]);

  async function portalFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const base = apiBaseUrl.trim().replace(/\/+$/, "");
    if (!base) throw new Error("Set API URL.");
    if (!apiToken.trim()) throw new Error("Set bearer token.");

    const hasBody = init?.body !== undefined && init?.body !== null;
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiToken.trim()}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(body?.error || `Request failed (${response.status}).`);
    }
    return body as T;
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
      const [overviewRes, merchantsRes, operatorsRes, activationRes, leasesRes, syncRes] = await Promise.all([
        portalFetch<{ overview: Overview }>("/admin/overview"),
        portalFetch<{ merchants: Merchant[] }>("/admin/merchants"),
        portalFetch<{ operators: Operator[] }>("/admin/operators"),
        portalFetch<{ activationCodes: ActivationCode[] }>("/admin/activation-codes?limit=25"),
        portalFetch<{ leases: Lease[] }>("/admin/offline-leases?limit=25"),
        portalFetch<{ syncIngestions: SyncIngestion[] }>("/admin/sync-ingestions?limit=100"),
      ]);

      setOverview(overviewRes.overview);
      setMerchants(merchantsRes.merchants);
      setOperators(operatorsRes.operators);
      setActivationCodes(activationRes.activationCodes);
      setLeases(leasesRes.leases);
      setSyncIngestions(syncRes.syncIngestions);
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
    if (!editDraft) return;

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
      }
      setEditDraft(null);
    }, "Saved.");
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
          {TABS.map((tab) => (
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
          <button
            type="button"
            className={`ghost-button ${connectionOpen ? "active" : ""}`}
            onClick={() => setConnectionOpen((open) => !open)}
          >
            Connection
          </button>
          <button type="button" className="primary-button" onClick={() => void refreshAll()} disabled={busy}>
            {busy ? "…" : "Refresh"}
          </button>
        </div>
      </header>

      {connectionOpen ? (
        <section className="panel connection-panel">
          <FormGrid>
            <FormField
              label="API URL"
              placeholder="http://localhost:4000"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
            />
            <FormField
              label="Bearer token"
              type="password"
              placeholder="PORTAL_BEARER_TOKEN"
              value={apiToken}
              onChange={(event) => setApiToken(event.target.value)}
            />
          </FormGrid>
          <div className="connection-meta">
            <StatusPill tone={connectionReady ? "success" : "neutral"}>
              {connectionReady ? "Ready" : "Incomplete"}
            </StatusPill>
            <span className="muted">{endpointLabel}</span>
          </div>
        </section>
      ) : null}

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

        {(tenantFormOpen || branchFormMerchant) ? (
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
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setOperatorFormOpen((open) => !open)}
                >
                  {operatorFormOpen ? "Hide form" : "Add operator"}
                </button>
              </div>
            }
            filters={
              <>
                <SearchField
                  value={accountSearch}
                  onChange={setAccountSearch}
                  placeholder="Search name, username, role, merchant, branch…"
                />
                {operatorFormOpen ? (
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
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setActivationFormOpen((open) => !open)}
                >
                  {activationFormOpen ? "Hide form" : "Create code"}
                </button>
              </div>
            }
            filters={
              activationFormOpen ? (
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
                <button type="button" className="ghost-button" onClick={() => setLeaseFormOpen((open) => !open)}>
                  {leaseFormOpen ? "Hide form" : "Issue lease"}
                </button>
              </div>
            }
            filters={
              leaseFormOpen ? (
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
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PortalPage>
        )}

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
      </ManageModal>
    </div>
  );
}

function roleLabel(role: string) {
  return OPERATOR_ROLES.find((entry) => entry.value === role)?.label ?? role;
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

function StatusPill({ tone, children }: { tone: "success" | "neutral" | "brand"; children: ReactNode }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
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
