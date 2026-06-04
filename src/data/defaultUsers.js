import { ROLES } from "../auth/roles";

/** Default accounts — change passwords after first login in production. */
export const DEFAULT_USER_SEEDS = [
  { id: 1, username: "boss", password: "boss123", displayName: "Owner", role: ROLES.BOSS },
  { id: 2, username: "manager", password: "manager123", displayName: "Store Manager", role: ROLES.MANAGER },
  { id: 3, username: "cashier", password: "cashier123", displayName: "Cashier", role: ROLES.CASHIER },
];
