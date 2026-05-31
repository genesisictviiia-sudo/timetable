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
