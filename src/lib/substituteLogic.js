import { DEFAULT_MAX_WEEKLY_TOTAL } from "./substitutionSettings";

function norm(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normKey(cls, sub) {
  return `${norm(cls).toUpperCase()}|${norm(sub).toUpperCase()}`;
}

export function parseSlot(slot) {
  if (!slot || norm(slot) === "Free") return null;
  const parts = norm(slot).split(/\s+/);
  if (parts.length < 2) return { classRef: parts[0] || "", subjectRef: "" };
  return { classRef: parts[0], subjectRef: parts.slice(1).join(" ") };
}

function teachesClassSubjectEntry(teachesMap, teacherName) {
  return (
    teachesMap[teacherName] || {
      classes: [],
      classSubjectPairs: [],
    }
  );
}

function preferenceScore(teachesMap, teacherName, classRef, subjectRef) {
  const e = teachesClassSubjectEntry(teachesMap, teacherName);
  const ck = normKey(classRef, subjectRef);
  const clsU = norm(classRef).toUpperCase();
  if (e.classSubjectPairs.includes(ck)) return 2;
  if (e.classes.some((c) => norm(c).toUpperCase() === clsU)) return 1;
  return 0;
}

export function pickSubstitute({
  absentTeachers,
  excludedTeachers = [],
  dayName,
  periodIndex,
  classRef,
  subjectRef,
  teacherTimetable,
  teachesMap,
  baseByName,
  pendingRows,
  storedWeekSubsExcludingToday,
  maxWeeklyTotal = DEFAULT_MAX_WEEKLY_TOTAL,
}) {
  const subsFor = (name) =>
    storedWeekSubsExcludingToday(name) +
    pendingRows.filter((r) => r.substituteTeacher === name).length;

  const isFree = (name) => {
    const row = teacherTimetable[name]?.[dayName];
    return row && norm(row[periodIndex]) === "Free";
  };

  const candidates = [];
  for (const name of Object.keys(teacherTimetable)) {
    if (absentTeachers.includes(name)) continue;
    if (excludedTeachers.includes(name)) continue;
    if (!isFree(name)) continue;
    const base = baseByName[name] ?? 0;
    if (base + subsFor(name) + 1 > maxWeeklyTotal) continue;
    const pref = preferenceScore(teachesMap, name, classRef, subjectRef);
    candidates.push({
      name,
      pref,
      load: base + subsFor(name),
    });
  }

  candidates.sort((a, b) => {
    if (b.pref !== a.pref) return b.pref - a.pref;
    return a.load - b.load;
  });

  return candidates[0]?.name ?? "";
}

export function buildSubstitutionRows({
  leaveTeachers,
  excludedTeachers = [],
  dayName,
  teacherTimetable,
  teachesMap,
  baseByName,
  storedWeekSubsExcludingToday,
  periodsPerDay = 6,
  maxWeeklyTotal = DEFAULT_MAX_WEEKLY_TOTAL,
}) {
  const pending = [];
  const rows = [];

  const storedExcl = (name) => storedWeekSubsExcludingToday(name);

  for (const absent of leaveTeachers) {
    const sched = teacherTimetable[absent]?.[dayName];
    if (!sched) continue;
    for (let p = 0; p < periodsPerDay; p++) {
      const slot = sched[p];
      const parsed = parseSlot(slot);
      if (!parsed) continue;

      const sub = pickSubstitute({
        absentTeachers: leaveTeachers,
        excludedTeachers,
        dayName,
        periodIndex: p,
        classRef: parsed.classRef,
        subjectRef: parsed.subjectRef,
        teacherTimetable,
        teachesMap,
        baseByName,
        pendingRows: pending,
        storedWeekSubsExcludingToday: storedExcl,
        maxWeeklyTotal,
      });

      const row = {
        id: crypto.randomUUID(),
        absentTeacher: absent,
        period: p + 1,
        slot,
        classRef: parsed.classRef,
        subjectRef: parsed.subjectRef,
        substituteTeacher: sub,
      };
      rows.push(row);
      pending.push(row);
    }
  }

  return rows;
}

export function workloadDisplay({ teacherName, baseByName, substitutionCount = 0 }) {
  const base = baseByName[teacherName] ?? 0;
  const subs = substitutionCount;
  return { base, subs, total: base + subs };
}

export function freeTeachersForSlot({
  leaveTeachers,
  excludedTeachers = [],
  dayName,
  periodIndex,
  teacherTimetable,
  currentSubstitute,
  baseByName = {},
  maxWeeklyTotal = null,
  getSubsCount = null,  // fn(name) → number of subs already assigned this week
}) {
  const out = [];
  for (const name of Object.keys(teacherTimetable)) {
    if (leaveTeachers.includes(name)) continue;
    if (excludedTeachers.includes(name) && name !== currentSubstitute) continue;
    const cell = teacherTimetable[name]?.[dayName]?.[periodIndex];
    const free = cell && norm(cell) === "Free";

    if (!free && name !== currentSubstitute) continue;

    // Enforce max workload — always allow the current substitute so they remain
    // selectable (avoids the dropdown losing its current value), but mark them
    // over-limit in the UI instead of silently hiding them.
    if (maxWeeklyTotal != null && name !== currentSubstitute && getSubsCount) {
      const base = baseByName[name] ?? 0;
      const subs = getSubsCount(name);
      if (base + subs + 1 > maxWeeklyTotal) continue;
    }

    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export { DEFAULT_MAX_WEEKLY_TOTAL as MAX_WEEKLY_TOTAL };
