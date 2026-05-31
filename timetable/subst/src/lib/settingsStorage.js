import {
  readUserJson,
  writeUserJson,
  removeUserItem,
} from "./userDataStorage";

export const TEACHERS_STORAGE_KEY = "teachers";
export const SUBJECTS_STORAGE_KEY = "subjects";
export const CLASS_LESSONS_STORAGE_KEY = "classLessons";
export const CLASSES_STORAGE_KEY = "classes";
export const SCHOOL_STORAGE_KEY = "school";
export { SUBSTITUTIONS_STORAGE_KEY } from "./assignmentsStorage";

function readJson(key, fallback) {
  return readUserJson(key, fallback);
}

function writeJson(key, value) {
  writeUserJson(key, value);
}

export function loadTeachersFull() {
  const parsed = readJson(TEACHERS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((t) => t && (t.name || t.id))
    .map((t) => normalizeTeacher(t));
}

/** @param {{ name?: string, shortName?: string }} t */
export function loadTeachers() {
  return loadTeachersFull()
    .filter((t) => t.name?.trim())
    .map((t) => ({
      name: t.name.trim(),
      shortName: String(t.shortName || t.name).trim(),
    }));
}

const DEFAULT_WORK_DAYS = 5;

export function weeklySlotIndex(day, period, periodsPerDay) {
  return day * periodsPerDay + period;
}

/** Whether this day/period is within the school's periods-per-week limit (filled from Mon P1 onward). */
export function isSlotWithinPeriodsPerWeek(day, period, periodsPerDay, periodsPerWeek) {
  const max = Number(periodsPerWeek);
  if (!Number.isFinite(max) || max < 1) return true;
  return weeklySlotIndex(day, period, periodsPerDay) < max;
}

function resolvePeriodsPerWeek(daysPerWeek, lessonPeriodsPerDay, periodsPerWeek) {
  const gridSlots = daysPerWeek * lessonPeriodsPerDay;
  const n = Number(periodsPerWeek);
  if (Number.isFinite(n) && n > 0) return Math.min(n, gridSlots);
  return gridSlots;
}

export function applyPeriodsPerWeekCapToTimeOffGrid(
  grid,
  daysPerWeek,
  lessonPeriodsPerDay,
  periodsPerWeek
) {
  const allowed = resolvePeriodsPerWeek(daysPerWeek, lessonPeriodsPerDay, periodsPerWeek);
  return grid.map((row, d) =>
    row.map((cell, p) => {
      if (!isSlotWithinPeriodsPerWeek(d, p, lessonPeriodsPerDay, allowed)) return false;
      return cell;
    })
  );
}

/** Default time off grid: all lesson slots available until the teacher marks them off. */
export function createDefaultTimeOffGrid(daysPerWeek, lessonPeriodsPerDay, _periodsPerWeek) {
  return Array.from({ length: daysPerWeek }, () =>
    Array.from({ length: lessonPeriodsPerDay }, () => true)
  );
}

function lessonSlotIndicesFromSchool(school) {
  const rows = Array.isArray(school?.periods) ? school.periods : [];
  if (!rows.length) return null;
  const indices = rows.map((p, i) => (p.type === "break" ? -1 : i)).filter((i) => i >= 0);
  return indices.length ? indices : null;
}

/** Map a saved grid that included break columns to lesson-only columns. */
function migrateSavedTimeOffToLessonGrid(
  saved,
  daysPerWeek,
  lessonPeriodsPerDay,
  periodsPerWeek
) {
  const grid = createDefaultTimeOffGrid(daysPerWeek, lessonPeriodsPerDay, periodsPerWeek);
  if (!saved?.cells || !Array.isArray(saved.cells)) return grid;

  const savedCols = saved.cells[0]?.length ?? 0;
  if (savedCols === lessonPeriodsPerDay) {
    for (let d = 0; d < daysPerWeek; d++) {
      for (let p = 0; p < lessonPeriodsPerDay; p++) {
        if (saved.cells[d]?.[p] !== undefined) grid[d][p] = Boolean(saved.cells[d][p]);
      }
    }
    return grid;
  }

  const school = readJson(SCHOOL_STORAGE_KEY, null);
  const lessonSlots = lessonSlotIndicesFromSchool(school);
  if (!lessonSlots || lessonSlots.length !== lessonPeriodsPerDay) {
    return grid;
  }

  for (let d = 0; d < daysPerWeek; d++) {
    for (let lp = 0; lp < lessonPeriodsPerDay; lp++) {
      const slot = lessonSlots[lp];
      if (saved.cells[d]?.[slot] !== undefined) grid[d][lp] = Boolean(saved.cells[d][slot]);
    }
  }
  return grid;
}

export function normalizeTimeOffGrid(saved, daysPerWeek, lessonPeriodsPerDay, periodsPerWeek) {
  const cols = lessonPeriodsPerDay;
  const grid = createDefaultTimeOffGrid(daysPerWeek, lessonPeriodsPerDay, periodsPerWeek);

  const savedCols = saved?.cells?.[0]?.length ?? 0;
  const dimsMatch =
    saved?.cells &&
    Array.isArray(saved.cells) &&
    saved.daysPerWeek === daysPerWeek &&
    (saved.lessonPeriodsPerDay === lessonPeriodsPerDay || saved.periodsPerDay === lessonPeriodsPerDay) &&
    savedCols === cols;

  if (!dimsMatch) {
    return migrateSavedTimeOffToLessonGrid(saved, daysPerWeek, lessonPeriodsPerDay, periodsPerWeek);
  }

  for (let d = 0; d < daysPerWeek; d++) {
    for (let p = 0; p < cols; p++) {
      if (saved.cells[d]?.[p] !== undefined) {
        grid[d][p] = Boolean(saved.cells[d][p]);
      }
    }
  }
  return grid;
}

export function loadSchoolScheduleDimensions() {
  const school = readJson(SCHOOL_STORAGE_KEY, null);
  const daysPerWeek = Number(school?.daysPerWeek);
  const lessonPeriodsPerDay = Number(school?.periodsPerDay);
  const periodRows = Array.isArray(school?.periods) ? school.periods : [];
  const totalPeriodSlots = periodRows.length > 0 ? periodRows.length : lessonPeriodsPerDay;

  if (
    !Number.isFinite(daysPerWeek) ||
    daysPerWeek < 1 ||
    !Number.isFinite(lessonPeriodsPerDay) ||
    lessonPeriodsPerDay < 1
  ) {
    return null;
  }

  const lessonPeriodRows = periodRows.filter((p) => p.type !== "break");
  const lessonPeriodLabels =
    lessonPeriodRows.length > 0
      ? lessonPeriodRows.map((p, i) => p.name?.trim() || `P${i + 1}`)
      : Array.from({ length: lessonPeriodsPerDay }, (_, i) => `P${i + 1}`);

  const periodsPerWeekRaw = Number(school?.periodsPerWeek);
  const periodsPerWeek =
    Number.isFinite(periodsPerWeekRaw) && periodsPerWeekRaw > 0
      ? Math.min(periodsPerWeekRaw, daysPerWeek * lessonPeriodsPerDay)
      : daysPerWeek * lessonPeriodsPerDay;

  return {
    daysPerWeek,
    lessonPeriodsPerDay,
    periodsPerWeek,
    totalPeriodSlots: Math.max(totalPeriodSlots, lessonPeriodsPerDay),
    periodLabels: lessonPeriodLabels,
  };
}

export function defaultSchoolConstraints() {
  return {
    classTeacherFirstPeriod: false,
    maxClassesPerDay: "",
    maxConsecutiveClassesPerDay: "",
  };
}

export function normalizeSchoolConstraints(raw) {
  const defaults = defaultSchoolConstraints();
  if (!raw || typeof raw !== "object") return { ...defaults };
  return {
    classTeacherFirstPeriod: Boolean(raw.classTeacherFirstPeriod),
    maxClassesPerDay:
      raw.maxClassesPerDay === "" || raw.maxClassesPerDay == null
        ? ""
        : String(raw.maxClassesPerDay),
    maxConsecutiveClassesPerDay:
      raw.maxConsecutiveClassesPerDay === "" || raw.maxConsecutiveClassesPerDay == null
        ? ""
        : String(raw.maxConsecutiveClassesPerDay),
  };
}

export function loadSchoolConstraints() {
  const school = readJson(SCHOOL_STORAGE_KEY, null);
  return normalizeSchoolConstraints(school?.constraints);
}

export function resolveClassTitleForLabel(classLabel) {
  const label = String(classLabel || "").trim();
  if (!label) return "";
  const cls = loadClassesList().find((c) => c.label === label);
  if (!cls) return label;
  return String(cls.title || "").trim() || label;
}

/** Class title for the lesson marked as class teacher (Teachers → Lessons). */
export function deriveClassTeacherFromLessons(lessons) {
  const row = (lessons || []).find((l) => l.isClassTeacher && l.classLabel);
  if (!row) return "";
  return resolveClassTitleForLabel(row.classLabel);
}

function normalizeTeacher(t) {
  const lessons = Array.isArray(t.lessons) ? t.lessons : [];
  const classTeacher =
    String(t.classTeacher || "").trim() || deriveClassTeacherFromLessons(lessons);
  return {
    id: t.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    name: String(t.name || "").trim(),
    phone: String(t.phone || "").trim(),
    email: String(t.email || "").trim(),
    shortName: String(t.shortName || t.name || "").trim(),
    lessons,
    classTeacher,
    timeOffGrid: t.timeOffGrid ?? null,
  };
}

export function saveTeachersFull(teachers) {
  const payload = teachers.map(({ constraints: _c, ...rest }) => rest);
  writeJson(TEACHERS_STORAGE_KEY, payload);
}

export function formatTimeOffSummary(timeOffGrid) {
  if (!timeOffGrid?.cells) return "—";
  let off = 0;
  let total = 0;
  for (const row of timeOffGrid.cells) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      total++;
      if (!cell) off++;
    }
  }
  if (!total) return "—";
  if (!off) return "All available";
  return `${off} slot(s) off`;
}

export function teacherListSummary(teacher) {
  const lessons = teacher.lessons || [];
  const lessonsPerWeek = lessons.reduce((sum, l) => sum + (Number(l.periodsPerWeek) || 0), 0);
  const classTeacher =
    String(teacher.classTeacher || "").trim() || deriveClassTeacherFromLessons(lessons);
  return {
    classTeacher: classTeacher || "—",
    lessonsPerWeek: lessonsPerWeek || "—",
    timeOff: formatTimeOffSummary(teacher.timeOffGrid),
  };
}

export function loadSubjects() {
  const parsed = readJson(SUBJECTS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((s) => (typeof s === "string" ? { name: s, shortName: s } : s))
    .filter((s) => s?.name?.trim())
    .map((s) => ({ name: String(s.name).trim(), shortName: String(s.shortName || s.name).trim() }));
}

export function loadClassesList() {
  const parsed = readJson(CLASSES_STORAGE_KEY, null);
  let list = [];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed?.classes) list = parsed.classes;
  return list.map((c) => ({
    id: c.id,
    label: [c.grade, c.section].filter(Boolean).join("") || c.title || "Class",
    grade: c.grade,
    section: c.section,
    title: c.title,
  }));
}

export function loadClassLessonsMap() {
  const parsed = readJson(CLASS_LESSONS_STORAGE_KEY, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function newTeacherLessonId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

/**
 * Rebuild every teacher's `lessons` array from all saved class lessons.
 * Preserves `isClassTeacher` when the class label still matches.
 */
export function syncTeacherLessonsFromClassLessons() {
  const classes = loadClassesList();
  const classLessonsMap = loadClassLessonsMap();
  const lessonsByTeacherName = new Map();

  const addLesson = (teacherName, { subject, classLabel, periodsPerWeek }) => {
    const name = String(teacherName || "").trim();
    if (!name) return;
    if (!lessonsByTeacherName.has(name)) lessonsByTeacherName.set(name, []);
    lessonsByTeacherName.get(name).push({
      id: newTeacherLessonId(),
      subject: String(subject || "").trim(),
      classLabel: String(classLabel || "").trim(),
      periodsPerWeek: Number(periodsPerWeek) || 0,
      isClassTeacher: false,
    });
  };

  for (const cls of classes) {
    const classLessons = Array.isArray(classLessonsMap[cls.id]) ? classLessonsMap[cls.id] : [];
    for (const row of classLessons) {
      const periodsPerWeek = Number(row.lessonsPerWeek) || 0;
      if (!periodsPerWeek) continue;
      const payload = {
        subject: row.subject,
        classLabel: cls.label,
        periodsPerWeek,
      };
      addLesson(row.primaryTeacher, payload);
      const extras = Array.isArray(row.additionalTeachers) ? row.additionalTeachers : [];
      for (const extra of extras) addLesson(extra, payload);
    }
  }

  const teachers = loadTeachersFull();
  const updated = teachers.map((t) => {
    const classTeacherLabels = new Set(
      (t.lessons || []).filter((l) => l.isClassTeacher && l.classLabel).map((l) => l.classLabel)
    );
    const lessons = (lessonsByTeacherName.get(t.name) || []).map((l) => ({
      ...l,
      isClassTeacher: classTeacherLabels.has(l.classLabel),
    }));
    return {
      ...t,
      lessons,
      classTeacher: deriveClassTeacherFromLessons(lessons),
    };
  });

  saveTeachersFull(updated);
  return updated;
}

export function saveClassLessonsForClass(classId, lessons) {
  const map = loadClassLessonsMap();
  map[classId] = lessons;
  writeJson(CLASS_LESSONS_STORAGE_KEY, map);
  syncTeacherLessonsFromClassLessons();
}

export function saveSubjectsList(subjects) {
  writeJson(SUBJECTS_STORAGE_KEY, subjects);
}

export function clearSubjectsList() {
  removeUserItem(SUBJECTS_STORAGE_KEY);
}

export function loadClassesStorageRaw() {
  return readJson(CLASSES_STORAGE_KEY, null);
}

export function saveClassesStorageRaw(payload) {
  writeJson(CLASSES_STORAGE_KEY, payload);
}

export function loadSchoolStorageRaw() {
  return readJson(SCHOOL_STORAGE_KEY, null);
}

export function saveSchoolStorageRaw(payload) {
  writeJson(SCHOOL_STORAGE_KEY, payload);
}

export function clearSchoolStorage() {
  removeUserItem(SCHOOL_STORAGE_KEY);
}

export function getClassLessons(classId) {
  const map = loadClassLessonsMap();
  return Array.isArray(map[classId]) ? map[classId] : [];
}

/** Saved lesson rows and total periods/week for a class (from Class → Lessons). */
export function getClassLessonStats(classId) {
  const lessons = getClassLessons(classId);
  const lessonCount = lessons.length;
  const periodsTotal = lessons.reduce((sum, row) => {
    const n = Number(row.lessonsPerWeek);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  return { lessonCount, periodsTotal };
}

export function loadSchoolPeriodsPerWeek() {
  const school = readJson(SCHOOL_STORAGE_KEY, null);
  const n = Number(school?.periodsPerWeek);
  return Number.isFinite(n) && n > 0 ? n : null;
}
