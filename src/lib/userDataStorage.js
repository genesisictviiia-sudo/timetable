/** Prefix for per-user app data in localStorage. */
const USER_DATA_PREFIX = "subst.userData.";

const SESSION_KEY = "subst.auth.session";
const LEGACY_MIGRATED_FLAG = "subst.legacyDataMigrated";

/** App data keys that are stored separately for each signed-in user. */
export const USER_SCOPED_DATA_KEYS = [
  "teachers",
  "subjects",
  "classLessons",
  "classes",
  "school",
  "generatedTimetable-v1",
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
}

export function readUserRaw(baseKey) {
  const email = getActiveUserEmail();
  if (!email) return null;
  return localStorage.getItem(scopedKey(email, baseKey));
}

export function writeUserRaw(baseKey, value) {
  const email = requireActiveUserEmail();
  localStorage.setItem(scopedKey(email, baseKey), value);
}

export function removeUserItem(baseKey) {
  const email = getActiveUserEmail();
  if (!email) return;
  localStorage.removeItem(scopedKey(email, baseKey));
}

/**
 * Move pre-login global data to the first account that signs in after this update.
 * New accounts created after migration always start with empty scoped storage.
 */
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

/** Called after login — existing users may receive one-time legacy data migration. */
export function onUserSessionStarted(email, { isNewAccount = false } = {}) {
  if (!isNewAccount) {
    migrateLegacyGlobalDataForUser(email);
  }
}
