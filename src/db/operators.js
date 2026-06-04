import { createSalt, hashPassword, verifyPassword } from "../auth/password";
import { ROLES } from "../auth/roles";
import { DEFAULT_USER_SEEDS } from "../data/defaultUsers";
import { getDatabase, isTauriRuntime } from "./client";
import { dbExecute, dbSelect } from "./sqlParams";

const LOCAL_MERCHANT_CODE = "local";
const OPERATORS_LS_KEY = "sepela-operators-cache";

function nowIso() {
  return new Date().toISOString();
}

function rowToAccount(row) {
  return {
    id: row.id,
    merchantCode: row.merchant_code ?? row.merchantCode ?? LOCAL_MERCHANT_CODE,
    branchCode: row.branch_code ?? row.branchCode ?? null,
    username: row.username,
    displayName: row.display_name ?? row.displayName,
    role: row.role,
    salt: row.password_salt ?? row.salt,
    passwordHash: row.password_hash ?? row.passwordHash,
    active: row.active === 1 || row.active === true,
    credentialsVersion: row.credentials_version ?? row.credentialsVersion ?? 1,
    syncedAt: row.synced_at ?? row.syncedAt ?? null,
  };
}

export function isCloudAuthConfigured(cloudSync) {
  return !!(
    String(cloudSync?.apiBaseUrl ?? "").trim() &&
    String(cloudSync?.apiToken ?? "").trim()
  );
}

export async function findMerchantCodesForUsername(username) {
  const normalized = String(username ?? "").trim().toLowerCase();
  if (!normalized) return [];

  if (isTauriRuntime()) {
    const db = await getDatabase();
    if (!db) return [];
    const rows = await dbSelect(
      db,
      `SELECT DISTINCT merchant_code FROM operators WHERE username = ? AND active = 1`,
      [normalized]
    );
    return rows.map((row) => String(row.merchant_code ?? "").trim()).filter(Boolean);
  }

  try {
    const raw = localStorage.getItem(OPERATORS_LS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const codes = [];
    for (const [merchantCode, accounts] of Object.entries(map)) {
      if (!Array.isArray(accounts)) continue;
      if (accounts.some((row) => String(row.username ?? "").toLowerCase() === normalized)) {
        codes.push(merchantCode);
      }
    }
    return codes;
  } catch {
    return [];
  }
}

export async function loadOperatorAccounts(merchantCode = LOCAL_MERCHANT_CODE) {
  const code = String(merchantCode ?? LOCAL_MERCHANT_CODE).trim() || LOCAL_MERCHANT_CODE;

  if (isTauriRuntime()) {
    const db = await getDatabase();
    if (!db) return [];
    const rows = await dbSelect(
      db,
      `SELECT id, merchant_code, branch_code, username, display_name, role,
              password_salt, password_hash, active, credentials_version, synced_at
       FROM operators
       WHERE merchant_code = ? AND active = 1
       ORDER BY display_name ASC`,
      [code]
    );
    if (rows.length) {
      return rows.map(rowToAccount);
    }
    if (code === LOCAL_MERCHANT_CODE) {
      return seedLocalOperatorsSqlite(db);
    }
    return [];
  }

  const cached = loadOperatorsFromLocalStorage(code);
  if (cached.length) return cached;
  if (code === LOCAL_MERCHANT_CODE) {
    return await seedLocalOperatorsLocalStorage();
  }
  return [];
}

async function seedLocalOperatorsLocalStorage() {
  const accounts = [];
  for (const seed of DEFAULT_USER_SEEDS) {
    const salt = createSalt();
    const passwordHash = await hashPassword(seed.password, salt);
    accounts.push({
      id: String(seed.id),
      merchantCode: LOCAL_MERCHANT_CODE,
      branchCode: null,
      username: seed.username,
      displayName: seed.displayName,
      role: seed.role,
      salt,
      passwordHash,
      active: true,
      credentialsVersion: 1,
      syncedAt: nowIso(),
    });
  }
  saveOperatorsToLocalStorage(LOCAL_MERCHANT_CODE, accounts);
  return accounts;
}

async function seedLocalOperatorsSqlite(db) {
  const accounts = [];
  for (const seed of DEFAULT_USER_SEEDS) {
    const salt = createSalt();
    const passwordHash = await hashPassword(seed.password, salt);
    const account = {
      id: String(seed.id),
      merchantCode: LOCAL_MERCHANT_CODE,
      branchCode: null,
      username: seed.username,
      displayName: seed.displayName,
      role: seed.role,
      salt,
      passwordHash,
      active: true,
      credentialsVersion: 1,
      syncedAt: nowIso(),
    };
    await upsertOperatorSqlite(db, account);
    accounts.push(account);
  }
  return accounts;
}

function loadOperatorsFromLocalStorage(merchantCode) {
  try {
    const raw = localStorage.getItem(OPERATORS_LS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const rows = map[merchantCode] ?? [];
    return rows.map(rowToAccount).filter((row) => row.active);
  } catch {
    return [];
  }
}

function saveOperatorsToLocalStorage(merchantCode, accounts) {
  try {
    const raw = localStorage.getItem(OPERATORS_LS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[merchantCode] = accounts.map((account) => ({
      id: account.id,
      merchant_code: account.merchantCode,
      branch_code: account.branchCode,
      username: account.username,
      display_name: account.displayName,
      role: account.role,
      password_salt: account.salt,
      password_hash: account.passwordHash,
      active: account.active ? 1 : 0,
      credentials_version: account.credentialsVersion,
      synced_at: account.syncedAt ?? nowIso(),
    }));
    localStorage.setItem(OPERATORS_LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export async function upsertOperatorCache(merchantCode, operators) {
  const code = String(merchantCode ?? "").trim();
  if (!code) return;

  if (isTauriRuntime()) {
    const db = await getDatabase();
    if (!db) return;
    for (const operator of operators) {
      await upsertOperatorSqlite(db, operator);
    }
    return;
  }

  saveOperatorsToLocalStorage(code, operators);
}

async function upsertOperatorSqlite(db, operator) {
  const ts = operator.syncedAt ?? nowIso();
  await dbExecute(
    db,
    `INSERT INTO operators (
       id, merchant_code, branch_code, username, display_name, role,
       password_salt, password_hash, active, credentials_version, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(merchant_code, username) DO UPDATE SET
       id = excluded.id,
       branch_code = excluded.branch_code,
       display_name = excluded.display_name,
       role = excluded.role,
       password_salt = excluded.password_salt,
       password_hash = excluded.password_hash,
       active = excluded.active,
       credentials_version = excluded.credentials_version,
       synced_at = excluded.synced_at`,
    [
      operator.id,
      operator.merchantCode,
      operator.branchCode ?? null,
      operator.username,
      operator.displayName,
      operator.role,
      operator.salt,
      operator.passwordHash,
      operator.active ? 1 : 0,
      operator.credentialsVersion ?? 1,
      ts,
    ]
  );
}

export async function verifyOperatorPassword(account, password) {
  if (!account?.salt || !account?.passwordHash) return false;
  return verifyPassword(password, account.salt, account.passwordHash);
}

/** Find operator by username across all cached merchants (for offline sign-in). */
export async function findCachedOperatorForLogin(username, password) {
  const normalized = String(username ?? "").trim().toLowerCase();
  if (!normalized || !password) return null;

  if (isTauriRuntime()) {
    const db = await getDatabase();
    if (!db) return null;
    const rows = await dbSelect(
      db,
      `SELECT id, merchant_code, branch_code, username, display_name, role,
              password_salt, password_hash, active, credentials_version, synced_at
       FROM operators
       WHERE LOWER(username) = ? AND active = 1`,
      [normalized]
    );
    for (const row of rows) {
      const account = rowToAccount(row);
      if (await verifyOperatorPassword(account, password)) {
        return account;
      }
    }
    return null;
  }

  try {
    const raw = localStorage.getItem(OPERATORS_LS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    for (const accounts of Object.values(map)) {
      if (!Array.isArray(accounts)) continue;
      for (const row of accounts) {
        const account = rowToAccount(row);
        if (account.username !== normalized || !account.active) continue;
        if (await verifyOperatorPassword(account, password)) {
          return account;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function accountFromCloudLogin(payload) {
  const user = payload?.user ?? {};
  const credential = payload?.credential ?? {};
  return {
    id: user.id,
    merchantCode: user.merchantCode,
    branchCode: user.branchCode ?? null,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    salt: credential.passwordSalt,
    passwordHash: credential.passwordHash,
    active: true,
    credentialsVersion: credential.credentialsVersion ?? 1,
    syncedAt: nowIso(),
  };
}

export function accountsFromCloudRoster(merchantCode, roster = []) {
  return roster.map((entry) => ({
    id: entry.id,
    merchantCode: entry.merchantCode ?? merchantCode,
    branchCode: entry.branchCode ?? null,
    username: entry.username,
    displayName: entry.displayName,
    role: entry.role,
    salt: entry.credential?.passwordSalt ?? "",
    passwordHash: entry.credential?.passwordHash ?? "",
    active: true,
    credentialsVersion: entry.credential?.credentialsVersion ?? 1,
    syncedAt: nowIso(),
  }));
}

export function isValidRole(role) {
  return [ROLES.CASHIER, ROLES.MANAGER, ROLES.BOSS].includes(role);
}
