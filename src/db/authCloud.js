function buildHeaders(apiToken, includeJson = true) {
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
  };
}

async function parseResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }
  if (!response.ok) {
    const detail = body?.error ?? body?.message ?? `Cloud request failed (${response.status}).`;
    const error = new Error(detail);
    error.status = response.status;
    error.isNetwork = isPortalUnreachableError({ status: response.status, message: detail });
    throw error;
  }
  if (body?.ok === false) {
    const error = new Error(body.error ?? body.message ?? "Cloud request failed.");
    error.status = 400;
    throw error;
  }
  return body;
}

function isPortalUnreachableError(error) {
  if (!error) return true;
  if (error.isNetwork) return true;
  const message = String(error.message ?? error).toLowerCase();
  const status = Number(error.status ?? 0);
  if (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("getaddrinfo") ||
    message.includes("etimedout") ||
    message.includes("eai_again") ||
    message.includes("socket hang up") ||
    message.includes("connection refused") ||
    message.includes("internet") ||
    message.includes("offline")
  ) {
    return true;
  }
  if (status === 502 || status === 503 || status === 504) return true;
  if (status >= 500) {
    return (
      message.includes("enotfound") ||
      message.includes("econnrefused") ||
      message.includes("getaddrinfo") ||
      message.includes("timeout") ||
      message.includes("connect") ||
      message.includes("database") ||
      message.includes("neon.tech")
    );
  }
  return false;
}

function isNetworkError(error) {
  return isPortalUnreachableError(error);
}

export async function loginOperatorOnCloud(apiBaseUrl, { username, password, merchantCode }, options = {}) {
  const base = String(apiBaseUrl ?? "").trim().replace(/\/+$/, "");
  const body = { username, password };
  const merchant = String(merchantCode ?? "").trim();
  if (merchant) body.merchantCode = merchant;
  try {
    const response = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: buildHeaders(options.apiToken),
      body: JSON.stringify(body),
    });
    return { ...(await parseResponse(response)), mode: "online" };
  } catch (error) {
    if (isNetworkError(error)) {
      const offline = new Error("Cloud portal is unreachable. Trying offline credentials.");
      offline.isNetwork = true;
      throw offline;
    }
    throw error;
  }
}

export async function fetchOperatorRosterOnCloud(
  apiBaseUrl,
  { merchantCode, leaseToken },
  options = {}
) {
  const base = String(apiBaseUrl ?? "").trim().replace(/\/+$/, "");
  const params = new URLSearchParams({ merchantCode, leaseToken });
  const response = await fetch(`${base}/auth/operator-roster?${params.toString()}`, {
    method: "GET",
    headers: buildHeaders(options.apiToken, false),
  });
  return parseResponse(response);
}

export { isNetworkError, isPortalUnreachableError };
