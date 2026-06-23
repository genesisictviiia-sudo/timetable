/**
 * Per-user data storage backed by the Cloud Run API + Postgres.
 *
 * All read functions are synchronous (they read from an in-memory cache that
 * is populated on login/session-restore). Write functions update the cache
 * immediately and flush to the API in the background.
 *
 * Call initUserDataCache() after login; clearUserDataCache() on logout.
 */
import { api } from "./apiClient";

// In-memory cache: null = not loaded yet, object = ready.
let _cache = null;

export function isCacheReady() {
  return _cache !== null;
}

/**
 * Fetch all user data from the API and populate the in-memory cache.
 * Pass the user's email so any legacy localStorage data can be migrated.
 */
export async function initUserDataCache(email) {
  const data = await api.get("/api/data");
  _cache = data && typeof data === "object" ? data : {};

  // One-time migration: if Supabase has no data yet but localStorage does,
  // upload the localStorage data so it isn't lost.
  if (email && Object.keys(_cache).length === 0) {
    const uploads = [];
    for (const key of USER_SCOPED_DATA_KEYS) {
      // Old per-user scoped key format
      const raw =
        localStorage.getItem(`subst.userData.${email}.${key}`) ??
        localStorage.getItem(`subst.${key}`); // legacy global key
      if (raw == null) continue;
      try {
        const value = JSON.parse(raw);
        _cache[key] = value;
        uploads.push(
          api.put(`/api/data/${encodeURIComponent(key)}`, value).catch(() => {})
        );
      } catch {
        // skip unparseable values
      }
    }
    if (uploads.length) await Promise.all(uploads);
  }
}

/** Clear cache on logout. */
export function clearUserDataCache() {
  _cache = null;
}

// ── Synchronous read/write (mirrors old localStorage API) ─────────────────

export function readUserJson(baseKey, fallback) {
  if (!_cache) return fallback;
  const val = _cache[baseKey];
  return val !== undefined ? val : fallback;
}

export function writeUserJson(baseKey, value) {
  if (_cache) _cache[baseKey] = value;
  // Fire-and-forget persist to API
  api.put(`/api/data/${encodeURIComponent(baseKey)}`, value).catch((err) =>
    console.error("Failed to persist", baseKey, err)
  );
}

export function readUserRaw(baseKey) {
  const val = _cache?.[baseKey];
  if (val === undefined || val === null) return null;
  // Cache holds parsed JS values (objects/arrays) because the API returns JSON.
  // Callers of readUserRaw expect a raw string (like localStorage.getItem did),
  // so serialize non-strings back to JSON.
  return typeof val === "string" ? val : JSON.stringify(val);
}

export function writeUserRaw(baseKey, value) {
  if (_cache) _cache[baseKey] = value;
  api.put(`/api/data/${encodeURIComponent(baseKey)}`, value).catch((err) =>
    console.error("Failed to persist raw", baseKey, err)
  );
}

export function removeUserItem(baseKey) {
  if (_cache) delete _cache[baseKey];
  api.delete(`/api/data/${encodeURIComponent(baseKey)}`).catch((err) =>
    console.error("Failed to delete", baseKey, err)
  );
}

// Kept for compatibility — no-op now (migration handled server-side via schema).
export function getActiveUserEmail() {
  return null;
}

export function onUserSessionStarted(_email, _opts) {}

export function migrateLegacyGlobalDataForUser(_email) {}

export const USER_SCOPED_DATA_KEYS = [
  "teachers",
  "subjects",
  "classLessons",
  "classes",
  "school",
  "classTeacherInfo",
  "generatedTimetable-v1",
  "substitution-assignments-v2",
  "substitution-assignments-v1",
  "substitution-last-date-v1",
  "substitution-settings-v1",
];
