import { sendPasswordResetEmail, sendSignupOtpEmail } from "./sendResetEmail";
import { api, setToken, getToken } from "./apiClient";
import { onUserSessionStarted, hydrateFromApi } from "./userDataStorage";

const SESSION_KEY = "subst.auth.session";

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

function writeSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser() {
  if (!getToken()) return null;
  const session = readSession();
  if (!session?.email) return null;
  return session;
}

export function getSession() {
  return readSession();
}

/**
 * Re-pull userType/profile from the server. The session set at login is
 * otherwise frozen for the life of the JWT (30 days), so an admin-side
 * plan change (e.g. free -> pro) would not take effect until the user
 * manually logged out and back in.
 */
export async function refreshSession() {
  if (!getToken()) return null;
  try {
    const data = await api.get("/auth/me");
    const existing = readSession();
    const session = {
      ...existing,
      email: data.email,
      userId: data.userId,
      userType: data.userType || "free",
      profile: data.profile || existing?.profile || {},
    };
    writeSession(session);
    return session;
  } catch (err) {
    console.warn("[auth] Could not refresh session from server:", err.message);
    return null;
  }
}

/**
 * Step 1 of signup: call the backend to validate + generate OTP,
 * then send it via EmailJS. Returns { email, userId, emailDelivered, otp }.
 */
export async function initiateSignup({ userId, email, password, confirmPassword }) {
  const data = await api.post("/auth/initiate-signup", { userId, email, password, confirmPassword }, false);
  // data.otp is returned by the backend so we can send it via EmailJS
  const mailResult = await sendSignupOtpEmail(data.email, userId, data.otp);
  return {
    email: data.email,
    userId,
    emailDelivered: mailResult.delivered,
    emailError: mailResult.detail || null,
    otp: data.otp,
  };
}

/**
 * Step 2 of signup: verify OTP on the backend, get JWT, start session.
 */
export async function verifySignupOtp({ email, otp }) {
  const data = await api.post("/auth/verify-signup", { email, otp }, false);
  setToken(data.token);
  const session = { email: data.user.email, userId: data.user.userId, userType: data.user.userType || "free", profile: data.user.profile || {} };
  writeSession(session);
  await hydrateFromApi();
  onUserSessionStarted(data.user.email, { isNewAccount: true });
  return session;
}

export async function login({ userId, password }) {
  const data = await api.post("/auth/login", { userId, password }, false);
  setToken(data.token);
  const session = { email: data.user.email, userId: data.user.userId, userType: data.user.userType || "free", profile: data.user.profile || {} };
  writeSession(session);
  await hydrateFromApi();
  onUserSessionStarted(data.user.email, { isNewAccount: false });
  return session;
}

export function logout() {
  setToken(null);
  writeSession(null);
}

export function updateProfile(patch) {
  // Optimistic local update; async sync to backend
  const session = readSession();
  if (!session) throw new Error("Not signed in.");
  const updated = { ...session, profile: { ...session.profile, ...patch } };
  writeSession(updated);
  api.patch("/auth/profile", { name: patch.name, role: patch.role, school: patch.school }).catch(console.warn);
  return updated;
}

export async function setPasswordForCurrentUser({ newPassword }) {
  await api.post("/auth/set-password", { newPassword });
}

export async function changePassword({ currentPassword, newPassword }) {
  await api.post("/auth/change-password", { currentPassword, newPassword });
}

export async function requestPasswordReset(email) {
  const data = await api.post("/auth/request-reset", { email }, false);
  const mailResult = await sendPasswordResetEmail(data.email, data.code);
  return {
    email: data.email,
    code: data.code,
    emailDelivered: mailResult.delivered,
    emailError: mailResult.detail || null,
  };
}

export async function resetPasswordWithCode({ email, code, newPassword }) {
  await api.post("/auth/reset-password", { email, code, newPassword }, false);
}

// Legacy exports (no longer used but kept so nothing breaks if imported elsewhere)
export function getAllUsers() { return {}; }
