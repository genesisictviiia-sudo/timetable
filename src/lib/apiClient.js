/**
 * Thin wrapper around the backend REST API.
 * Token is kept in localStorage under "subst.auth.token".
 */

const BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "subst.auth.token";

export const API_BASE = BASE;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body, requiresAuth = true) {
  const headers = { "Content-Type": "application/json" };
  if (requiresAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  post:   (path, body, auth)    => request("POST",   path, body, auth),
  get:    (path, auth)          => request("GET",    path, undefined, auth),
  put:    (path, body, auth)    => request("PUT",    path, body, auth),
  patch:  (path, body, auth)    => request("PATCH",  path, body, auth),
  delete: (path, auth)          => request("DELETE", path, undefined, auth),
};
