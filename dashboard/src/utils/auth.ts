// dashboard/src/utils/auth.ts
// Single source of truth for auth in the dashboard (admin-token header flow)

const TOKEN_KEY = "upr_token";

/** Basic token helpers */
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
export function clearToken(): void { setToken(null); }
export function isAuthed(): boolean { return Boolean(getToken()); }

/** Header helper for admin-protected API routes */
export function getAuthHeader(): Record<string, string> {
  const t = getToken();
  return t ? { "x-admin-token": t } : {};
}

/** Fetch wrapper that adds admin header and handles 401 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const auth = getAuthHeader();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    try { clearToken(); } finally {
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }
  return res;
}

/** Log out client-side and bounce to login */
export function logout(): void {
  try { clearToken(); } finally {
    if (typeof window !== "undefined") window.location.href = "/login";
  }
}

/**
 * Verify an admin token by calling an admin-only endpoint.
 * We POST an empty bulk payload:
 *  - 403 => invalid token
 *  - 200/400/422 => endpoint reached with token (valid)
 */
export async function verifyToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("/api/hr-leads/bulk", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": token,
      },
      body: JSON.stringify({ items: [] }),
    });
    if (res.status === 403 || res.status === 401) return false;
    // 200/400/422 means we passed adminOnly and hit handler
    return true;
  } catch {
    return false;
  }
}

/** Try to verify, then persist the token if valid */
export async function loginWithToken(token: string): Promise<boolean> {
  const ok = await verifyToken(token);
  if (ok) setToken(token);
  return ok;
}

/* --------------------------------------------------------------------
   Back-compat aliases (some pages import these names):
   - getAdminToken: same as getToken()
   - adminFetch:    same as authFetch()
--------------------------------------------------------------------- */
export const getAdminToken = getToken;
export const adminFetch = authFetch;
