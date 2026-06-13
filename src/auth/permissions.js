import { ROLES } from "./roles";

export const PERMISSIONS = {
  POS_SELL: "pos_sell",
  MANAGE_PRODUCTS: "manage_products",
  MANAGE_STOCK: "manage_stock",
  MANAGE_SETTINGS: "manage_settings",
  VIEW_REPORTS: "view_reports",
  MANAGE_USERS: "manage_users",
  VIEW_INVOICES: "view_invoices",
  REFUND_SALE: "refund_sale",
  APPLY_CART_DISCOUNT: "apply_cart_discount",
};

const ROLE_PERMISSIONS = {
  [ROLES.CASHIER]: [PERMISSIONS.POS_SELL, PERMISSIONS.VIEW_INVOICES],
  [ROLES.MANAGER]: [
    PERMISSIONS.POS_SELL,
    PERMISSIONS.MANAGE_PRODUCTS,
    PERMISSIONS.MANAGE_STOCK,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.REFUND_SALE,
    PERMISSIONS.APPLY_CART_DISCOUNT,
  ],
  [ROLES.BOSS]: [
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.REFUND_SALE,
  ],
};

export function can(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canSell(role) {
  return can(role, PERMISSIONS.POS_SELL);
}
