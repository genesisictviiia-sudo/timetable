import { captureTimetableSnapshotFromTimetable, freezeTimetable } from "./timetableSnapshot";
import { migrateTimetableFormat } from "./timetableValidation";
import {
  readUserJson,
  writeUserJson,
  removeUserItem,
  readUserRaw,
  writeUserRaw,
} from "./userDataStorage";

export const TIMETABLE_STORAGE_KEY = "generatedTimetable-v1";

function readRawTimetable() {
  const raw = readUserRaw(TIMETABLE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Load persisted timetable only — never rebuilds from current General Settings. */
export function loadGeneratedTimetable() {
  const parsed = readRawTimetable();
  if (!parsed) return null;
  const migrated = migrateTimetableFormat(parsed);
  if (!migrated) return null;
  if (migrated.frozen) return migrated;
  if (migrated.cells && Object.keys(migrated.cells).length > 0) {
    const snapshot =
      parsed.snapshot ||
      captureTimetableSnapshotFromTimetable(migrated);
    return freezeTimetable(migrated, snapshot);
  }
  return migrated;
}

export function saveGeneratedTimetable(data, { freeze = false } = {}) {
  let payload = migrateTimetableFormat(data) || data;
  if (!payload) return;

  const existing = readRawTimetable();
  if (payload.frozen && existing?.snapshot && !payload.snapshot) {
    payload = { ...payload, snapshot: existing.snapshot, frozenAt: existing.frozenAt };
  }

  if (freeze) {
    payload = freezeTimetable(payload);
  }

  writeUserJson(TIMETABLE_STORAGE_KEY, payload);
}

export function clearGeneratedTimetable() {
  removeUserItem(TIMETABLE_STORAGE_KEY);
}

/* ── Named saved timetables ─────────────────────────────────────────── */

export const SAVED_TIMETABLES_KEY = "savedTimetables-v1";

export function listSavedTimetables() {
  const list = readUserJson(SAVED_TIMETABLES_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Save (or overwrite, matched by name case-insensitively) under a name. */
export function saveTimetableAs(name, timetable) {
  const trimmed = String(name || "").trim();
  if (!trimmed || !timetable) return listSavedTimetables();
  const entry = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: trimmed,
    savedAt: new Date().toISOString(),
    timetable,
  };
  const next = [
    entry,
    ...listSavedTimetables().filter((e) => e.name.toLowerCase() !== trimmed.toLowerCase()),
  ];
  writeUserJson(SAVED_TIMETABLES_KEY, next);
  return next;
}

/** Update an existing named save in place (used to auto-save edits). */
export function updateSavedTimetable(name, timetable) {
  const trimmed = String(name || "").trim();
  const list = listSavedTimetables();
  const idx = list.findIndex((e) => e.name.toLowerCase() === trimmed.toLowerCase());
  if (idx < 0 || !timetable) return list;
  const next = [...list];
  next[idx] = { ...next[idx], timetable, savedAt: new Date().toISOString() };
  writeUserJson(SAVED_TIMETABLES_KEY, next);
  return next;
}

export function deleteSavedTimetable(id) {
  const next = listSavedTimetables().filter((e) => e.id !== id);
  writeUserJson(SAVED_TIMETABLES_KEY, next);
  return next;
}
