const MAILTO_TOTAL_LIMIT = 1800;

export function buildMailtoHref(to, subject, body) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  const recipient = String(to ?? "").trim();
  return query ? `mailto:${recipient}?${query}` : `mailto:${recipient}`;
}

function buildGmailComposeUrl(to, subject, body) {
  const params = new URLSearchParams({ view: "cm", fs: "1" });
  if (to) params.set("to", to);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function buildOutlookComposeUrl(to, subject, body) {
  const params = new URLSearchParams();
  if (to) params.set("to", to);
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
}

function emailDomain(to) {
  return String(to ?? "")
    .trim()
    .split("@")[1]
    ?.toLowerCase() ?? "";
}

/**
 * Pick a compose URL that works in the browser (Gmail/Outlook web) or native mailto.
 * Chrome as the mailto handler often opens a blank tab when the URL is long or malformed.
 */
export function pickEmailComposeHref(to, subject, body) {
  const shortBody = String(body ?? "").slice(0, 800);
  const domain = emailDomain(to);

  if (!domain || domain === "gmail.com" || domain === "googlemail.com") {
    return buildGmailComposeUrl(to, subject, shortBody);
  }

  if (
    ["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain) ||
    domain.endsWith(".onmicrosoft.com")
  ) {
    return buildOutlookComposeUrl(to, subject, shortBody);
  }

  const mailto = buildMailtoHref(to, subject, shortBody.slice(0, 500));
  if (mailto.length <= MAILTO_TOTAL_LIMIT) return mailto;

  return buildGmailComposeUrl(to, subject, shortBody);
}
