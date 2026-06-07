import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  loginOperatorOnCloud,
  fetchOperatorRosterOnCloud,
  isPortalUnreachableError,
} from "../db/authCloud";
import {
  ACTIVATION_SUPPORT_MESSAGE,
  TERMINAL_NOT_CONFIGURED_MESSAGE,
  resolvePortalConnection,
} from "../config/portalDefaults";
import {
  accountFromCloudLogin,
  accountsFromCloudRoster,
  findCachedOperatorForLogin,
  loadOperatorAccounts,
  upsertOperatorCache,
} from "../db/operators";
import { useDatabase } from "./DatabaseContext";

const SESSION_KEY = "sepela-session";
const SESSION_TOKEN_KEY = "sepela-session-token";
const SESSION_EXPIRES_KEY = "sepela-session-expires";

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(session, sessionToken, sessionExpiresAt) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (sessionToken) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    sessionStorage.setItem(SESSION_EXPIRES_KEY, sessionExpiresAt ?? "");
  } else {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_EXPIRES_KEY);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const db = useDatabase();
  const cloudSync = db?.cloudSync ?? {};
  const portal = resolvePortalConnection(cloudSync);
  const merchantCode =
    String(user?.merchantCode ?? db?.activeTenant?.merchantCode ?? cloudSync.merchantCode ?? "").trim() ||
    "local";

  const [user, setUser] = useState(loadSession);
  const [operators, setOperators] = useState([]);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState("local");
  const [lastAuthMessage, setLastAuthMessage] = useState("");

  const refreshOperators = useCallback(async () => {
    const accounts = await loadOperatorAccounts(merchantCode);
    setOperators(accounts);
    return accounts;
  }, [merchantCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!db?.ready) return;
      const accounts = await loadOperatorAccounts(merchantCode);
      if (!cancelled) {
        setOperators(accounts);
        setReady(true);
      }

      if (!cancelled && portal.configured && cloudSync.leaseToken) {
        try {
          const roster = await fetchOperatorRosterOnCloud(
            portal.apiBaseUrl,
            { merchantCode, leaseToken: cloudSync.leaseToken },
            { apiToken: portal.apiToken }
          );
          const cached = accountsFromCloudRoster(merchantCode, roster.operators ?? []);
          if (cached.length) {
            await upsertOperatorCache(merchantCode, cached);
            if (!cancelled) setOperators(cached);
          }
        } catch {
          /* keep local cache when roster sync fails */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    db?.ready,
    merchantCode,
    portal.configured,
    portal.apiBaseUrl,
    portal.apiToken,
    cloudSync.leaseToken,
  ]);

  const loginOfflineWithCache = useCallback(
    async (username, password) => {
      const account = await findCachedOperatorForLogin(username, password);
      if (!account) {
        return {
          ok: false,
          error:
            "Cannot reach the portal and no matching cached account was found. Sign in once while online, then you can work offline.",
        };
      }
      if (db?.applyActiveTenant) {
        await db.applyActiveTenant({
          merchantCode: account.merchantCode,
          branchCode: account.branchCode ?? "",
        });
      }
      const session = {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
        merchantCode: account.merchantCode,
      };
      persistSession(session, null, null);
      setUser(session);
      setAuthMode("offline");
      setOperators(await loadOperatorAccounts(account.merchantCode));
      setLastAuthMessage("Signed in offline using cached credentials.");
      return { ok: true, mode: "offline" };
    },
    [db]
  );

  useEffect(() => {
    if (!db?.ready || !db?.applyActiveTenant || !user?.merchantCode) return;
    db.applyActiveTenant({
      merchantCode: user.merchantCode,
      branchCode: cloudSync.branchCode,
    }).catch(() => {});
  }, [db?.ready, db?.applyActiveTenant, user?.merchantCode, cloudSync.branchCode]);

  const login = useCallback(
    async (username, password) => {
      const normalized = username.trim().toLowerCase();
      if (!normalized || password.length < 6) {
        return { ok: false, error: "Enter username and password (min 6 characters)." };
      }

      if (!portal.configured) {
        const offline = await loginOfflineWithCache(normalized, password);
        if (offline.ok) return offline;
        return { ok: false, error: TERMINAL_NOT_CONFIGURED_MESSAGE };
      }

      try {
        const result = await loginOperatorOnCloud(
          portal.apiBaseUrl,
          { username: normalized, password },
          { apiToken: portal.apiToken }
        );

        const binding = result.deviceBinding;
        if (!binding?.allowed) {
          return { ok: false, error: ACTIVATION_SUPPORT_MESSAGE };
        }

        const account = accountFromCloudLogin(result);
        const sessionMerchant = account.merchantCode;

        if (db?.applyActiveTenant) {
          await db.applyActiveTenant({
            merchantCode: sessionMerchant,
            branchCode: account.branchCode ?? "",
          });
        }

        if (db?.syncDeviceBindingFromPortal) {
          const synced = await db.syncDeviceBindingFromPortal(binding, {
            apiBaseUrl: portal.apiBaseUrl,
            apiToken: portal.apiToken,
          });
          if (!synced?.ok) {
            return { ok: false, error: ACTIVATION_SUPPORT_MESSAGE };
          }
        }
        await upsertOperatorCache(sessionMerchant, [account]);

        try {
          const roster = await fetchOperatorRosterOnCloud(
            portal.apiBaseUrl,
            { merchantCode: sessionMerchant, leaseToken: binding.lease.leaseToken },
            { apiToken: portal.apiToken }
          );
          const cached = accountsFromCloudRoster(sessionMerchant, roster.operators ?? []);
          if (cached.length) {
            await upsertOperatorCache(sessionMerchant, cached);
            setOperators(cached);
          }
        } catch {
          setOperators(await loadOperatorAccounts(sessionMerchant));
        }

        if (db?.pushPendingSync) {
          try {
            await db.pushPendingSync();
          } catch {
            /* sync can be retried from settings */
          }
        }

        const session = {
          id: account.id,
          username: account.username,
          displayName: account.displayName,
          role: account.role,
          merchantCode: account.merchantCode,
        };
        persistSession(session, result.sessionToken, result.sessionExpiresAt);
        setUser(session);
        setAuthMode("online");
        setLastAuthMessage("Signed in and synced with the portal.");
        return { ok: true, mode: "online" };
      } catch (error) {
        const message = String(error?.message ?? "Cloud sign-in failed.");
        const unreachable = isPortalUnreachableError(error);

        if (!unreachable) {
          if (error?.status === 409 || message.includes("CONFLICT:")) {
            return { ok: false, error: message.replace(/^CONFLICT:\s*/i, "") };
          }
          if (error?.status === 403) {
            return { ok: false, error: ACTIVATION_SUPPORT_MESSAGE };
          }
          if (error?.status === 401) {
            const detail = message.replace(/^(UNAUTHORIZED|FORBIDDEN|BAD_REQUEST):\s*/i, "");
            if (/bearer token/i.test(detail)) {
              return {
                ok: false,
                error:
                  "Terminal API token is invalid. Check VITE_PORTAL_API_TOKEN in .env matches portal-api PORTAL_BEARER_TOKEN, then restart the app.",
              };
            }
            return {
              ok: false,
              error:
                detail ||
                "Invalid username or password. If this account was edited in portal-admin, use the latest password.",
            };
          }
          return { ok: false, error: message.replace(/^(UNAUTHORIZED|FORBIDDEN|BAD_REQUEST):\s*/i, "") };
        }

        const offline = await loginOfflineWithCache(normalized, password);
        if (offline.ok) {
          setLastAuthMessage("Portal unreachable — signed in offline with cached credentials.");
          return offline;
        }
        return { ok: false, error: offline.error };
      }
    },
    [portal, db, loginOfflineWithCache]
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setAuthMode("local");
  }, []);

  const value = useMemo(
    () => ({
      user,
      users: operators,
      ready: db?.ready ? ready : false,
      login,
      logout,
      authMode,
      lastAuthMessage,
      cloudConfigured: portal.configured,
      merchantCode,
      isLoggedIn: !!user,
      addUser: async () => ({
        ok: false,
        error: "Operator accounts are managed in the cloud portal.",
      }),
      setUserActive: async () => ({
        ok: false,
        error: "Operator accounts are managed in the cloud portal.",
      }),
      restoreUsers: async (nextUsers) => {
        if (!Array.isArray(nextUsers) || nextUsers.length === 0) {
          return { ok: false, error: "Backup must contain at least one user account." };
        }
        const normalized = nextUsers.map((account, index) => ({
          id: String(account.id ?? index + 1),
          merchantCode: account.merchantCode ?? merchantCode,
          branchCode: account.branchCode ?? null,
          username: account.username,
          displayName: account.displayName,
          role: account.role,
          salt: account.salt,
          passwordHash: account.passwordHash,
          active: account.active !== false,
          credentialsVersion: account.credentialsVersion ?? 1,
          syncedAt: new Date().toISOString(),
        }));
        await upsertOperatorCache(merchantCode, normalized);
        setOperators(normalized);
        return { ok: true };
      },
      refreshOperators,
    }),
    [
      user,
      operators,
      ready,
      db?.ready,
      login,
      logout,
      authMode,
      lastAuthMessage,
      portal.configured,
      merchantCode,
      refreshOperators,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
