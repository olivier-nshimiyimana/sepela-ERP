import { useCallback, useEffect, useState } from "react";
import { createSalt, hashPassword, verifyPassword } from "../auth/password";
import { ROLES } from "../auth/roles";
import { DEFAULT_USER_SEEDS } from "../data/defaultUsers";

const USERS_KEY = "sepela-users";
const SESSION_KEY = "sepela-session";

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function seedDefaultUsers() {
  const users = [];
  for (const seed of DEFAULT_USER_SEEDS) {
    const salt = createSalt();
    const passwordHash = await hashPassword(seed.password, salt);
    users.push({
      id: seed.id,
      username: seed.username,
      displayName: seed.displayName,
      role: seed.role,
      salt,
      passwordHash,
      active: true,
    });
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return users;
}

export function useAuth() {
  const [user, setUser] = useState(loadSession);
  const [users, setUsers] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored = loadUsers();
      if (!stored?.length) {
        stored = await seedDefaultUsers();
      }
      if (!cancelled) {
        setUsers(stored);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (username, password) => {
      const account = users.find(
        (u) => u.username === username.trim().toLowerCase() && u.active
      );
      if (!account) {
        return { ok: false, error: "Invalid username or password." };
      }
      const valid = await verifyPassword(password, account.salt, account.passwordHash);
      if (!valid) {
        return { ok: false, error: "Invalid username or password." };
      }
      const session = {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setUser(session);
      return { ok: true };
    },
    [users]
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  const addUser = useCallback(
    async ({ username, password, displayName, role }) => {
      const normalized = username.trim().toLowerCase();
      if (!normalized || password.length < 6) {
        return { ok: false, error: "Username required; password min 6 characters." };
      }
      if (![ROLES.CASHIER, ROLES.MANAGER, ROLES.BOSS].includes(role)) {
        return { ok: false, error: "Invalid role." };
      }
      if (users.some((u) => u.username === normalized)) {
        return { ok: false, error: "Username already exists." };
      }
      const salt = createSalt();
      const passwordHash = await hashPassword(password, salt);
      const id = users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
      const next = [
        ...users,
        {
          id,
          username: normalized,
          displayName: displayName.trim() || normalized,
          role,
          salt,
          passwordHash,
          active: true,
        },
      ];
      localStorage.setItem(USERS_KEY, JSON.stringify(next));
      setUsers(next);
      return { ok: true };
    },
    [users]
  );

  const setUserActive = useCallback(
    (userId, active) => {
      if (user?.id === userId && !active) {
        return { ok: false, error: "You cannot deactivate your own account." };
      }
      const next = users.map((u) => (u.id === userId ? { ...u, active } : u));
      localStorage.setItem(USERS_KEY, JSON.stringify(next));
      setUsers(next);
      return { ok: true };
    },
    [users, user]
  );

  const restoreUsers = useCallback(
    (nextUsers) => {
      if (!Array.isArray(nextUsers) || nextUsers.length === 0) {
        return { ok: false, error: "Backup must contain at least one user account." };
      }

      localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
      setUsers(nextUsers);

      if (user) {
        const matched = nextUsers.find((account) => account.id === user.id && account.active);
        if (!matched) {
          sessionStorage.removeItem(SESSION_KEY);
          setUser(null);
        } else {
          const session = {
            id: matched.id,
            username: matched.username,
            displayName: matched.displayName,
            role: matched.role,
          };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
          setUser(session);
        }
      }

      return { ok: true };
    },
    [user]
  );

  return {
    user,
    users,
    ready,
    login,
    logout,
    addUser,
    setUserActive,
    restoreUsers,
    isLoggedIn: !!user,
  };
}
