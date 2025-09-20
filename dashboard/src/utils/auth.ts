// dashboard/src/utils/auth.ts
//
// Hardened auth utilities for cookie + bearer flows.
// - Always send credentials (cookies) and Bearer (if stored)
// - On 401, verify once and RETRY the original request
// - If still unauthorized, logout -> /login
// - Keeps your existing API (getToken/setToken/clearToken, getAuthHeader, authFetch, loginWithPassword, verifyToken, logout)

const TOKEN_KEY = "upr_admin_jwt";

/* ---------------------------- token helpers ---------------------------- */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {}
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getAuthHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ------------------------------ verify ------------------------------- */

/** Server-side verify that accepts cookie and/or bearer. */
export async function verifySession(): Promise<boolean> {
  try {
    const token = getToken();
    const res = await fetch("/api/auth/verify", {
      method: "GET",
      credentials: "include", // send HttpOnly cookie if present
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Backward-compatible alias (your code may already import verifyToken). */
export async function verifyToken(): Promise<boolean> {
  return verifySession();
}

/* ------------------------------ logout ------------------------------- */

export async function logout(): Promise<void> {
  try {
    // If your server exposes a logout endpoint that clears the cookie:
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // ignore
  } finally {
    clearToken();
    if (typeof window !== "undefined") window.location.replace("/login");
  }
}

/* ------------------------------ authFetch ---------------------------- */

/**
 * authFetch
 * - Includes cookies and Bearer header
 * - On 401: verify once and retry the original request
 * - If opts.noRedirect === true, do not logout/redirect; return the 401 to the caller (useful on /login)
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts?: { noRedirect?: boolean }
): Promise<Response> {
  const token = getToken();

  // Build base options (merge headers but do not mutate caller's object)
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const baseOpts: RequestInit = {
    credentials: "include",
    cache: init.cache || "no-store",
    ...init,
    headers,
  };

  // First attempt
  let res = await fetch(input, baseOpts);
  if (res.status !== 401) return res;

  // If the caller wants to handle the 401 (e.g. Login page), just return it.
  if (opts?.noRedirect) return res;

  // Verify once
  const ok = await verifySession();
  if (!ok) {
    await logout();
    throw new Error("unauthorized");
  }

  // Retry once after verify
  res = await fetch(input, baseOpts);
  if (res.status === 401) {
    await logout();
    throw new Error("unauthorized");
  }
  return res;
}

/* ------------------------------- login ------------------------------- */

export interface LoginResult {
  ok: boolean;
  token?: string;
  error?: string;
}

/**
 * Username/password login. Works with cookie-based auth and optional Bearer.
 * If the server returns { ok, token }, we keep storing it for dual-mode auth.
 */
export async function loginWithPassword(
  username: string,
  password: string
): Promise<LoginResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include", // receive/set HttpOnly cookie
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await safeJson(res);
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || "Login failed" };
  }

  if (data.token && typeof data.token === "string") {
    setToken(data.token); // keep supporting Bearer if the server provides it
  }

  return { ok: true, token: data?.token };
}

/* ------------------------------ helpers ------------------------------ */

async function safeJson<T = any>(resp: Response): Promise<T | null> {
  try {
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}
