import { mondayOfCalendarWeek, toISODate } from "./dates";
import { readUserJson, writeUserJson, readUserRaw, writeUserRaw } from "./userDataStorage";

/** Permanent browser database key (localStorage), same as other General Settings data. */
export const SUBSTITUTIONS_STORAGE_KEY = "substitution-assignments-v2";
const LEGACY_STORAGE_KEY = "substitution-assignments-v1";
const LAST_DATE_KEY = "substitution-last-date-v1";

function readJson(key, fallback) {
  return readUserJson(key, fallback);
}

function writeJson(key, value) {
  writeUserJson(key, value);
}

function migrateLegacyAssignments() {
  const legacy = readJson(LEGACY_STORAGE_KEY, null);
  if (!legacy || !Array.isArray(legacy)) return;
  const current = readJson(SUBSTITUTIONS_STORAGE_KEY, null);
  if (current?.assignments?.length) return;

  writeJson(SUBSTITUTIONS_STORAGE_KEY, {
    version: 2,
    updatedAt: new Date().toISOString(),
    assignments: legacy.map((entry) => ({
      date: entry.date,
      savedAt: entry.savedAt || new Date().toISOString(),
      leaveTeachers: entry.leaveTeachers || [],
      rows: entry.rows || [],
    })),
  });
}

function loadStore() {
  migrateLegacyAssignments();
  const store = readJson(SUBSTITUTIONS_STORAGE_KEY, null);
  if (store?.version === 2 && Array.isArray(store.assignments)) {
    return store;
  }
  return { version: 2, updatedAt: null, assignments: [] };
}

function persistStore(store) {
  writeJson(SUBSTITUTIONS_STORAGE_KEY, {
    ...store,
    version: 2,
    updatedAt: new Date().toISOString(),
  });
}

export function loadAllAssignments() {
  return loadStore().assignments;
}

function serializeRow(r) {
  return {
    absentTeacher: r.absentTeacher,
    period: r.period,
    substituteTeacher: r.substituteTeacher || "",
    classRef: r.classRef,
    subjectRef: r.subjectRef,
    slot: r.slot || "",
  };
}

export function saveLastSubstitutionDate(dateISO) {
  if (!dateISO) return;
  writeUserRaw(LAST_DATE_KEY, dateISO);
}

export function loadLastSubstitutionDate() {
  return readUserRaw(LAST_DATE_KEY) || "";
}

export function listSavedSubstitutionDates() {
  return loadAllAssignments()
    .map((a) => a.date)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
}

/** Save all substitution rows for one calendar date (permanent until deleted). */
export function saveAssignmentsForDate(dateISO, rows, { leaveTeachers = [] } = {}) {
  if (!dateISO) return false;
  const store = loadStore();
  const assignments = store.assignments.filter((a) => a.date !== dateISO);
  assignments.push({
    date: dateISO,
    savedAt: new Date().toISOString(),
    leaveTeachers: [...leaveTeachers],
    rows: rows.map(serializeRow),
  });
  assignments.sort((a, b) => a.date.localeCompare(b.date));
  persistStore({ ...store, assignments });
  saveLastSubstitutionDate(dateISO);
  return true;
}

export function loadAssignmentsForDate(dateISO) {
  if (!dateISO) return null;
  const entry = loadAllAssignments().find((a) => a.date === dateISO);
  if (!entry) return null;
  return {
    date: entry.date,
    leaveTeachers: entry.leaveTeachers || [],
    rows: entry.rows || [],
    savedAt: entry.savedAt || null,
  };
}

/** Remove saved substitutions for a date (e.g. on reset). */
export function clearAssignmentsForDate(dateISO) {
  if (!dateISO) return;
  const store = loadStore();
  const assignments = store.assignments.filter((a) => a.date !== dateISO);
  persistStore({ ...store, assignments });
}

export function getAssignmentsByDateInRange(startISO, endISO, overridesByDate = {}) {
  const byDate = {};

  for (const a of loadAllAssignments()) {
    if (a.date < startISO || a.date > endISO) continue;
    byDate[a.date] = a.rows || [];
  }

  for (const [date, rows] of Object.entries(overridesByDate)) {
    if (date < startISO || date > endISO) continue;
    byDate[date] = rows;
  }

  return byDate;
}

export function countSubstitutionsForTeacherInRange(
  teacherName,
  startISO,
  endISO,
  overridesByDate = {}
) {
  if (!teacherName || !startISO || !endISO) return 0;
  const byDate = getAssignmentsByDateInRange(startISO, endISO, overridesByDate);
  let n = 0;
  for (const rows of Object.values(byDate)) {
    for (const r of rows) {
      if (r.substituteTeacher === teacherName) n++;
    }
  }
  return n;
}

export function substitutionCountForTeacherInRange(
  teacherName,
  startISO,
  endISO,
  excludeDateISO = null,
  overridesByDate = {}
) {
  const overrides = { ...overridesByDate };
  if (excludeDateISO && overrides[excludeDateISO] === undefined) {
    overrides[excludeDateISO] = [];
  }
  return countSubstitutionsForTeacherInRange(teacherName, startISO, endISO, overrides);
}

export function weekBoundsISO(anchorDateISO) {
  const mon = mondayOfCalendarWeek(anchorDateISO);
  if (!mon) return { mondayISO: null, sundayISO: null };
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { mondayISO: toISODate(mon), sundayISO: toISODate(sun) };
}

export function substitutionCountForTeacherInWeek(
  teacherName,
  anchorDateISO,
  excludeDateISO = null,
  overridesByDate = {}
) {
  const { mondayISO, sundayISO } = weekBoundsISO(anchorDateISO);
  if (!mondayISO) return 0;
  return substitutionCountForTeacherInRange(
    teacherName,
    mondayISO,
    sundayISO,
    excludeDateISO,
    overridesByDate
  );
}

export function buildWorkloadReport(teacherList, baseByName, startISO, endISO, overridesByDate = {}) {
  return teacherList.map((name) => {
    const base = baseByName[name] ?? 0;
    const substitutions = countSubstitutionsForTeacherInRange(
      name,
      startISO,
      endISO,
      overridesByDate
    );
    return {
      name,
      base,
      substitutions,
      total: base + substitutions,
    };
  });
}
