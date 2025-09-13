// dashboard/src/utils/auth.ts
// Centralized auth + admin helpers for the dashboard (TypeScript)

//
// ──────────────────────────────────────────────────────────────────────────────
// User auth token helpers (non-admin)
// ──────────────────────────────────────────────────────────────────────────────
//

const AUTH_TOKEN_KEY = "AUTH_TOKEN";

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token || "");
}

export function getAuthToken(): string {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

/** Returns Authorization header if a user token exists */
export function getAuthHeader(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** fetch wrapper that automatically merges JSON + auth headers */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...getAuthHeader(),
  } as Record<string, string>;

  return fetch(input, { ...init, headers });
}

//
// ──────────────────────────────────────────────────────────────────────────────
// Admin token helpers (x-admin-token)
// ──────────────────────────────────────────────────────────────────────────────
//

const ADMIN_TOKEN_KEY = "ADMIN_TOKEN";

/** Persist admin token in localStorage */
export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token || "");
}

/** Read admin token from localStorage */
export function getAdminToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

/** Returns { "x-admin-token": "<token>" } when present */
export function getAdminHeaders(): Record<string, string> {
  const t = getAdminToken();
  return t ? { "x-admin-token": t } : {};
}

/** fetch wrapper that merges JSON + user auth + admin headers */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...getAuthHeader(),
    ...getAdminHeaders(),
  } as Record<string, string>;

  return fetch(input, { ...init, headers });
}
