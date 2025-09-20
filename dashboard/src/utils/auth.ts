// dashboard/src/utils/auth.ts
const TOKEN_KEY = "upr_admin_jwt";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string): void {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}
export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function getAuthHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * authFetch(url, options?)
 * Options:
 *  - noRedirect?: boolean  // do NOT auto-logout on 401
 *  - ...any fetch init...
 */
export async function authFetch(input: RequestInfo, init: RequestInit & { noRedirect?: boolean } = {}) {
  const { noRedirect, headers, ...rest } = init;

  const mergedHeaders: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...getAuthHeader(),
    ...(headers as Record<string, string> | undefined),
  };

  const res = await fetch(input as string, {
    credentials: "include", // send cookies for session-based auth
    headers: mergedHeaders,
    ...rest,
  });

  if (res.status === 401) {
    if (noRedirect) {
      return res; // let caller handle it (no auto logout)
    }
    // Auto logout only for full-page protected flows
    clearToken();
    try { sessionStorage.setItem("upr_post_login_redirect", location.pathname + location.search); } catch {}
    // avoid loops if already on /login
    if (!location.pathname.startsWith("/login")) {
      location.replace("/login");
    }
  }
  return res;
}

/** Convenience helpers */
export function logout() {
  clearToken();
  if (!location.pathname.startsWith("/login")) {
    location.replace("/login");
  }
}
