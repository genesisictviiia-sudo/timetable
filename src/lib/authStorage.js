import { api, setToken, clearToken, getToken } from "./apiClient";
import { initUserDataCache, clearUserDataCache } from "./userDataStorage";
import { sendPasswordResetEmail } from "./sendResetEmail";

// In-memory current user — set on login/restore, cleared on logout.
let _currentUser = null;

export function getCurrentUser() {
  return _currentUser;
}

/**
 * Attempt to restore an existing session from the stored JWT.
 * Returns the user object if valid, null otherwise.
 * Must be awaited before rendering the authenticated app.
 */
export async function restoreSession() {
  if (!getToken()) return null;
  try {
    const user = await api.get("/auth/me");
    _currentUser = user;
    // Separate data-load errors from auth errors — a failing /api/data call
    // should not log the user out.
    await initUserDataCache(user.email).catch(console.error);
    return user;
  } catch {
    clearToken();
    return null;
  }
}

export async function signup({ email, password, name }) {
  const { token, user } = await api.post("/auth/signup", { email, password, name });
  setToken(token);
  _currentUser = user;
  await initUserDataCache(user.email).catch(console.error);
  return user;
}

export async function login({ email, password }) {
  const { token, user } = await api.post("/auth/login", { email, password });
  setToken(token);
  _currentUser = user;
  await initUserDataCache(user.email).catch(console.error);
  return user;
}

export function logout() {
  clearToken();
  _currentUser = null;
  clearUserDataCache();
}

export async function updateProfile(patch) {
  const user = await api.patch("/auth/profile", patch);
  _currentUser = user;
  return user;
}

export async function changePassword({ currentPassword, newPassword }) {
  await api.post("/auth/change-password", { currentPassword, newPassword });
}

export async function setPasswordForCurrentUser({ newPassword }) {
  await api.post("/auth/set-password", { newPassword });
}

export async function requestPasswordReset(email) {
  // Backend generates + stores the code; we receive it here to send via EmailJS.
  const result = await api.post("/auth/request-reset", { email });
  const mailResult = await sendPasswordResetEmail(result.email, result.code);
  return {
    email: result.email,
    code: result.code,
    emailDelivered: mailResult.delivered,
    emailError: mailResult.detail || null,
  };
}

export async function resetPasswordWithCode({ email, code, newPassword }) {
  await api.post("/auth/reset-password", { email, code, newPassword });
}

// Kept for compatibility — not used with API-backed auth.
export function getAllUsers() { return {}; }
export function getSession() { return null; }
