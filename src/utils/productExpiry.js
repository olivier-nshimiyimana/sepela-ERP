export const DEFAULT_EXPIRY_ALERT_DAYS = 30;

export function parseExpiryDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysUntilExpiry(expirationDate) {
  const exp = parseExpiryDate(expirationDate);
  if (!exp) return null;
  return Math.ceil((exp.getTime() - startOfToday().getTime()) / 86400000);
}

/** @returns {'ok' | 'soon' | 'expired' | 'missing'} */
export function getExpiryStatus(expirationDate, alertDays = DEFAULT_EXPIRY_ALERT_DAYS) {
  const days = daysUntilExpiry(expirationDate);
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= alertDays) return "soon";
  return "ok";
}

export function isProductSellable(product, alertDays = DEFAULT_EXPIRY_ALERT_DAYS) {
  if (product.stock <= 0) return false;
  return getExpiryStatus(product.expirationDate, alertDays) !== "expired";
}

export function formatExpiryDate(expirationDate) {
  const d = parseExpiryDate(expirationDate);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function expiryStatusLabel(status, days) {
  switch (status) {
    case "expired":
      return "Expired";
    case "soon":
      return days === 0 ? "Expires today" : `Expires in ${days}d`;
    case "missing":
      return "No expiry date";
    default:
      return days !== null ? `${days}d left` : "";
  }
}

export function getExpiryAlerts(products, alertDays = DEFAULT_EXPIRY_ALERT_DAYS) {
  const expiringSoon = [];
  const expired = [];

  for (const product of products) {
    const status = getExpiryStatus(product.expirationDate, alertDays);
    if (status === "expired") expired.push(product);
    else if (status === "soon") expiringSoon.push(product);
  }

  expiringSoon.sort(
    (a, b) => daysUntilExpiry(a.expirationDate) - daysUntilExpiry(b.expirationDate)
  );
  expired.sort(
    (a, b) => daysUntilExpiry(a.expirationDate) - daysUntilExpiry(b.expirationDate)
  );

  return { expiringSoon, expired };
}
