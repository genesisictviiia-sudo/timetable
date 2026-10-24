/**
 * Per-user data storage.
 *
 * localStorage is the fast synchronous cache (so all existing code keeps working).
 * Supabase (via the backend API) is the durable store.
 *
 * On login: hydrateFromApi() loads all keys from the server into localStorage.
 * On every write: writeUserJson() saves to localStorage AND async-syncs to the API.
 */
import { api, API_BASE, getToken } from "./apiClient";

const USER_DATA_PREFIX = "subst.userData.";
const SESSION_KEY = "subst.auth.session";
const LEGACY_MIGRATED_FLAG = "subst.legacyDataMigrated";

export const USER_SCOPED_DATA_KEYS = [
  "teachers",
  "subjects",
  "classLessons",
  "classes",
  "school",
  "generatedTimetable-v1",
  "savedTimetables-v1",
  "invigilations-v1",
  "invigilations-saved-v1",
  "substitution-assignments-v2",
  "substitution-assignments-v1",
  "substitution-last-date-v1",
  "substitution-settings-v1",
];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function scopedKey(email, baseKey) {
  return `${USER_DATA_PREFIX}${normalizeEmail(email)}.${baseKey}`;
}

export function getActiveUserEmail() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.email ? normalizeEmail(session.email) : null;
  } catch {
    return null;
  }
}

function requireActiveUserEmail() {
  const email = getActiveUserEmail();
  if (!email) throw new Error("Not signed in.");
  return email;
}

/**
 * Cloud-sync status, so the UI can tell the user when their changes are
 * NOT reaching the database instead of failing silently (a real outage —
 * the API being briefly unreachable — previously just logged a console
 * warning and looked identical to a successful save).
 */
const syncStatusListeners = new Set();
let lastSyncError = null;

export function getSyncError() {
  return lastSyncError;
}

export function subscribeSyncStatus(listener) {
  syncStatusListeners.add(listener);
  return () => syncStatusListeners.delete(listener);
}

function setSyncError(message) {
  lastSyncError = message;
  for (const listener of syncStatusListeners) listener(lastSyncError);
}

/**
 * Sync a single key to the backend — debounced per key so rapid changes
 * (e.g. typing in a form) produce one write instead of one per keystroke.
 * localStorage is always written immediately; only the server PUT is delayed.
 */
const SYNC_DEBOUNCE_MS = 2500;
const pendingSyncValues = new Map();
const pendingSyncTimers = new Map();

function flushSyncKey(baseKey) {
  const value = pendingSyncValues.get(baseKey);
  pendingSyncValues.delete(baseKey);
  clearTimeout(pendingSyncTimers.get(baseKey));
  pendingSyncTimers.delete(baseKey);
  if (value === undefined || !getToken()) return;
  api
    .put(`/api/data/${encodeURIComponent(baseKey)}`, value)
    .then(() => setSyncError(null))
    .catch((err) => {
      console.warn(`[sync] Failed to sync "${baseKey}" to server:`, err.message);
      setSyncError("Could not save your latest changes to the cloud. They are kept on this device only until the connection is restored.");
    });
}

function syncKeyToApi(baseKey, value) {
  if (!getToken()) return;
  pendingSyncValues.set(baseKey, value);
  clearTimeout(pendingSyncTimers.get(baseKey));
  pendingSyncTimers.set(
    baseKey,
    setTimeout(() => flushSyncKey(baseKey), SYNC_DEBOUNCE_MS)
  );
}

/**
 * Push every pending (debounced) write to the server right now. Called by
 * explicit "Save" buttons so a clicked save is permanent immediately.
 */
export function flushPendingSyncs() {
  for (const baseKey of [...pendingSyncValues.keys()]) {
    flushSyncKey(baseKey);
  }
}

// Flush any pending (debounced) writes when the tab is closed or hidden so
// the last change still reaches the server.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    const token = getToken();
    if (!token) return;
    for (const [baseKey, value] of pendingSyncValues) {
      try {
        fetch(`${API_BASE}/api/data/${encodeURIComponent(baseKey)}`, {
          method: "PUT",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(value),
        });
      } catch {
        /* best effort */
      }
    }
    pendingSyncValues.clear();
  });
}

/** Load all user data from the backend into localStorage. Called once on login. */
export async function hydrateFromApi() {
  if (!getToken()) return;
  try {
    const allData = await api.get("/api/data");
    const email = getActiveUserEmail();
    if (!email) return;
    for (const [key, value] of Object.entries(allData)) {
      localStorage.setItem(scopedKey(email, key), JSON.stringify(value));
    }
    setSyncError(null);
  } catch (err) {
    console.warn("[hydrate] Could not load data from server:", err.message);
    setSyncError("Could not load your latest data from the cloud. You may be seeing an older version saved on this device.");
  }
}

export function readUserJson(baseKey, fallback) {
  const email = getActiveUserEmail();
  if (!email) return fallback;
  try {
    const raw = localStorage.getItem(scopedKey(email, baseKey));
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeUserJson(baseKey, value) {
  const email = requireActiveUserEmail();
  localStorage.setItem(scopedKey(email, baseKey), JSON.stringify(value));
  syncKeyToApi(baseKey, value);
}

export function readUserRaw(baseKey) {
  const email = getActiveUserEmail();
  if (!email) return null;
  return localStorage.getItem(scopedKey(email, baseKey));
}

export function writeUserRaw(baseKey, value) {
  const email = requireActiveUserEmail();
  localStorage.setItem(scopedKey(email, baseKey), value);
  try {
    syncKeyToApi(baseKey, JSON.parse(value));
  } catch {
    // not valid JSON — skip API sync
  }
}

export function removeUserItem(baseKey) {
  const email = getActiveUserEmail();
  if (!email) return;
  localStorage.removeItem(scopedKey(email, baseKey));
  if (getToken()) {
    api.delete(`/api/data/${encodeURIComponent(baseKey)}`).catch(console.warn);
  }
}

/** Migrate pre-login global data to the first account that signs in after this update. */
export function migrateLegacyGlobalDataForUser(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || localStorage.getItem(LEGACY_MIGRATED_FLAG)) return;

  let moved = false;
  for (const baseKey of USER_SCOPED_DATA_KEYS) {
    const legacy = localStorage.getItem(baseKey);
    if (legacy === null) continue;
    localStorage.setItem(scopedKey(normalized, baseKey), legacy);
    localStorage.removeItem(baseKey);
    moved = true;
  }

  if (moved) {
    localStorage.setItem(LEGACY_MIGRATED_FLAG, normalized);
  }
}

/** Called after login. */
export function onUserSessionStarted(email, { isNewAccount = false } = {}) {
  if (!isNewAccount) {
    migrateLegacyGlobalDataForUser(email);
  }
}
