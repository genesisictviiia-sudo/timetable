const USERS_KEY = "subst.auth.users";
const SESSION_KEY = "subst.auth.session";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}::${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function getAllUsers() {
  return readJson(USERS_KEY, {});
}

export function getSession() {
  return readJson(SESSION_KEY, null);
}

export function getCurrentUser() {
  const session = getSession();
  if (!session?.email) return null;
  const users = getAllUsers();
  const record = users[session.email];
  if (!record) return null;
  return { email: session.email, profile: record.profile || {} };
}

export async function signup({ email, password, name }) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Please enter a valid email address.");
  }
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
  const users = getAllUsers();
  if (users[normalized]) throw new Error("An account with this email already exists.");
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  users[normalized] = {
    salt,
    hash,
    profile: {
      name: name?.trim() || "",
      role: "",
      school: "",
      createdAt: new Date().toISOString(),
    },
  };
  writeJson(USERS_KEY, users);
  writeJson(SESSION_KEY, { email: normalized, startedAt: Date.now() });
  return { email: normalized, profile: users[normalized].profile };
}

export async function login({ email, password }) {
  const normalized = normalizeEmail(email);
  const users = getAllUsers();
  const record = users[normalized];
  if (!record) throw new Error("No account found with that email.");
  const hash = await hashPassword(password, record.salt);
  if (hash !== record.hash) throw new Error("Incorrect password.");
  writeJson(SESSION_KEY, { email: normalized, startedAt: Date.now() });
  return { email: normalized, profile: record.profile };
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function updateProfile(patch) {
  const session = getSession();
  if (!session?.email) throw new Error("Not signed in.");
  const users = getAllUsers();
  const record = users[session.email];
  if (!record) throw new Error("Account no longer exists.");
  record.profile = { ...record.profile, ...patch };
  writeJson(USERS_KEY, users);
  return { email: session.email, profile: record.profile };
}

export async function changePassword({ currentPassword, newPassword }) {
  const session = getSession();
  if (!session?.email) throw new Error("Not signed in.");
  const users = getAllUsers();
  const record = users[session.email];
  if (!record) throw new Error("Account no longer exists.");
  const currentHash = await hashPassword(currentPassword, record.salt);
  if (currentHash !== record.hash) throw new Error("Current password is incorrect.");
  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters.");
  }
  const salt = randomSalt();
  record.salt = salt;
  record.hash = await hashPassword(newPassword, salt);
  writeJson(USERS_KEY, users);
}
