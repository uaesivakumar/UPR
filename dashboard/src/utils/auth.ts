// dashboard/src/utils/auth.ts
// Centralized auth helpers for UPR Admin Console

export const TOKEN_KEY = "upr_admin_token";

/** Types */
export interface VerifyResponse {
  ok: boolean;
  error?: string;
}

export interface AuthResult {
  success: boolean;
  message?: string;
}

/** Read token from localStorage */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    console.error("[auth] getToken failed:", err);
    return null;
  }
}

/** Persist token to localStorage */
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    console.error("[auth] setToken failed:", err);
  }
}

/** Remove token from localStorage */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    console.error("[auth] clearToken failed:", err);
  }
}

/** Call backend to verify if a token is valid */
export async function verifyToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("/api/auth/verify", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data: VerifyResponse = await res.json();
    return data.ok === true;
  } catch (err) {
    console.error("[auth] verifyToken failed:", err);
    return false;
  }
}

/** Convenience: check current auth state using stored token */
export async function isAuthed(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  return verifyToken(token);
}

/** Try to login with a given token */
export async function loginWithToken(token: string): Promise<AuthResult> {
  const valid = await verifyToken(token);
  if (!valid) {
    return { success: false, message: "Invalid token" };
  }
  setToken(token);
  return { success: true };
}

/** Logout the current user */
export function logout(): void {
  clearToken();
  window.location.href = "/login";
}

/** Utility: get Authorization header */
export function getAuthHeader(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/** Utility: fetch wrapper with Authorization header */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}
