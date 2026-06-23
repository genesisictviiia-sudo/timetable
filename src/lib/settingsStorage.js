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
export const CLASS_TEACHER_INFO_KEY = "classTeacherInfo";
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

/** Default: available from Mon P1 through the school's periods-per-week cap; rest unavailable. */
export function createDefaultTimeOffGrid(daysPerWeek, lessonPeriodsPerDay, periodsPerWeek) {
  const allowed = resolvePeriodsPerWeek(daysPerWeek, lessonPeriodsPerDay, periodsPerWeek);
  return Array.from({ length: daysPerWeek }, (_, day) =>
    Array.from({ length: lessonPeriodsPerDay }, (_, period) =>
      isSlotWithinPeriodsPerWeek(day, period, lessonPeriodsPerDay, allowed)
    )
  );
}

export function isUserSavedTimeOffGrid(saved) {
  return Boolean(saved?.cells && Array.isArray(saved.cells) && saved.cells.length > 0);
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
        if (saved.cells[d]?.[p] !== undefined)
          grid[d][p] = Boolean(saved.cells[d][p]) && isSlotWithinPeriodsPerWeek(d, p, lessonPeriodsPerDay, periodsPerWeek);
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
      if (saved.cells[d]?.[slot] !== undefined)
        grid[d][lp] = Boolean(saved.cells[d][slot]) && isSlotWithinPeriodsPerWeek(d, lp, lessonPeriodsPerDay, periodsPerWeek);
    }
  }
  return grid;
}

export function normalizeTimeOffGrid(saved, daysPerWeek, lessonPeriodsPerDay, periodsPerWeek) {
  const ppw = resolvePeriodsPerWeek(daysPerWeek, lessonPeriodsPerDay, periodsPerWeek);

  if (!isUserSavedTimeOffGrid(saved)) {
    return createDefaultTimeOffGrid(daysPerWeek, lessonPeriodsPerDay, ppw);
  }

  const cols = lessonPeriodsPerDay;
  const savedCols = saved.cells[0]?.length ?? 0;
  const dimsMatch =
    saved.daysPerWeek === daysPerWeek &&
    (saved.lessonPeriodsPerDay === lessonPeriodsPerDay || saved.periodsPerDay === lessonPeriodsPerDay) &&
    savedCols === cols;

  if (!dimsMatch) {
    return migrateSavedTimeOffToLessonGrid(saved, daysPerWeek, lessonPeriodsPerDay, ppw);
  }

  const grid = createDefaultTimeOffGrid(daysPerWeek, lessonPeriodsPerDay, ppw);
  for (let d = 0; d < daysPerWeek; d++) {
    for (let p = 0; p < cols; p++) {
      if (saved.cells[d]?.[p] !== undefined) {
        // Never enable slots that are beyond the periodsPerWeek cap
        grid[d][p] = Boolean(saved.cells[d][p]) && isSlotWithinPeriodsPerWeek(d, p, lessonPeriodsPerDay, ppw);
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
    classTeacherSubject: String(t.classTeacherSubject || "").trim(),
    timeOffGrid: t.timeOffGrid ?? null,
  };
}

export function saveTeachersFull(teachers) {
  const payload = teachers.map(({ constraints: _c, ...rest }) => rest);
  writeJson(TEACHERS_STORAGE_KEY, payload);
}

// ── Class teacher info storage (classId → { teacherName, subject }) ──────────
// This is the single source of truth for class teacher name + subject.
// All other locations (teacher record classTeacher/classTeacherSubject, lesson
// isClassTeacher flags) are derived from this map.

function loadClassTeacherInfoMap() {
  const v = readJson(CLASS_TEACHER_INFO_KEY, {});
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function writeClassTeacherInfoMap(map) {
  writeJson(CLASS_TEACHER_INFO_KEY, map);
}

/** Save class teacher name + subject for a class (keyed by classId). */
export function saveClassTeacherInfo(classId, teacherName, subject) {
  const map = loadClassTeacherInfoMap();
  map[String(classId)] = {
    teacherName: String(teacherName || "").trim(),
    subject: String(subject || "").trim(),
  };
  writeClassTeacherInfoMap(map);
}

/** Return { teacherName, subject } for the class, or { teacherName: "", subject: "" }. */
export function getClassTeacherInfo(classId) {
  const map = loadClassTeacherInfoMap();
  const entry = map[String(classId)];
  if (entry && typeof entry === "object") {
    return {
      teacherName: String(entry.teacherName || "").trim(),
      subject: String(entry.subject || "").trim(),
    };
  }
  return { teacherName: "", subject: "" };
}

/**
 * Set `teacherName` as the class teacher for `classLabel`, clearing the flag
 * from whoever previously held it. Pass `teacherName = ""` to clear without
 * assigning a new one.
 */
export function saveClassTeacherForClass(classLabel, teacherName, subject, classId) {
  const label = String(classLabel || "").trim();
  const name  = String(teacherName || "").trim();
  const subj  = String(subject     || "").trim();

  // Single source of truth: write classId-keyed map first.
  if (classId) saveClassTeacherInfo(classId, name, subj);

  const teachers = loadTeachersFull();
  const updated = teachers.map((t) => {
    const isNewCT  = t.name === name;
    // Teacher who previously held the class-teacher flag for this class.
    const wasOldCT = (t.lessons || []).some((l) => l.isClassTeacher && l.classLabel === label);

    if (!isNewCT && !wasOldCT) return t; // unrelated teacher — skip

    // Recompute isClassTeacher on every lesson row for this class:
    //   • New CT + exact subject match           → true
    //   • All other rows for this class          → false  (clears Math, English-extra, etc.)
    //   • Rows for other classes                 → unchanged
    const newLessons = (t.lessons || []).map((l) => {
      if (l.classLabel !== label) return l;
      // Require a non-empty subject to avoid flagging every row when subject is blank.
      return { ...l, isClassTeacher: isNewCT && Boolean(subj) && l.subject === subj };
    });

    // classTeacherSubject: set for the new CT; explicitly CLEAR it for the old CT
    // that just lost the role (so their stale subject doesn't linger on the record).
    const newCTSubject = isNewCT
      ? subj
      : wasOldCT
        ? ""                           // old CT lost the role → clear
        : (t.classTeacherSubject || ""); // unrelated CT assignment on another class → keep

    return {
      ...t,
      lessons: newLessons,
      classTeacher:        isNewCT ? label : deriveClassTeacherFromLessons(newLessons),
      classTeacherSubject: newCTSubject,
    };
  });
  saveTeachersFull(updated);
}

/** Return the subject the class teacher teaches for classLabel/classId, or "". */
export function getClassTeacherSubjectForClass(classLabel, classId) {
  // Primary: classId-keyed map (always accurate).
  if (classId) {
    const info = getClassTeacherInfo(classId);
    if (info.subject) return info.subject;
  }
  // Fallback: scan teacher records by label.
  const label = String(classLabel || "").trim();
  if (!label) return "";
  const teachers = loadTeachersFull();
  const ct = teachers.find(
    (t) =>
      String(t.classTeacher || "").trim() === label ||
      (t.lessons || []).some((l) => l.isClassTeacher && l.classLabel === label)
  );
  if (!ct) return "";
  if (ct.classTeacherSubject) return ct.classTeacherSubject;
  const ctLesson = (ct.lessons || []).find((l) => l.isClassTeacher && l.classLabel === label);
  return String(ctLesson?.subject || "").trim();
}

/** Return the name of the teacher currently marked as class teacher for classLabel, or "". */
export function getClassTeacherNameForClass(classLabel, classId) {
  // Primary: classId-keyed map.
  if (classId) {
    const info = getClassTeacherInfo(classId);
    if (info.teacherName) return info.teacherName;
  }
  const label = String(classLabel || "").trim();
  if (!label) return "";
  const teachers = loadTeachersFull();
  const ct = teachers.find(
    (t) =>
      String(t.classTeacher || "").trim() === label ||
      (t.lessons || []).some((l) => l.isClassTeacher && l.classLabel === label)
  );
  return ct?.name ?? "";
}

export function formatTimeOffSummary(timeOffGrid) {
  if (!isUserSavedTimeOffGrid(timeOffGrid)) return "Default (school schedule)";
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

function normalizeSubjectRecord(s, index = 0) {
  const name = String(s?.name || "").trim();
  if (!name) return null;
  return {
    id: s.id || `subject-${index}-${name}`,
    name,
    shortName: String(s.shortName || s.name).trim(),
    timeOffGrid: s.timeOffGrid ?? null,
  };
}

export function loadSubjects() {
  const parsed = readJson(SUBJECTS_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((s, i) =>
      typeof s === "string"
        ? normalizeSubjectRecord({ name: s, shortName: s }, i)
        : normalizeSubjectRecord(s, i)
    )
    .filter(Boolean);
}

export function getSubjectTimeOffGrid(subject, daysPerWeek, lessonPeriodsPerDay, periodsPerWeek) {
  return normalizeTimeOffGrid(
    subject?.timeOffGrid,
    daysPerWeek,
    lessonPeriodsPerDay,
    periodsPerWeek
  );
}

export function subjectListSummary(subject) {
  return {
    timeOff: formatTimeOffSummary(subject?.timeOffGrid),
  };
}

/** Map full subject name → short name from General Settings → Subjects. */
export function buildSubjectShortMap() {
  const map = new Map();
  for (const s of loadSubjects()) {
    map.set(s.name, s.shortName);
  }
  return map;
}

export function toSubjectShortName(subject, shortMap) {
  const name = String(subject || "").trim();
  if (!name) return "";
  const map = shortMap || buildSubjectShortMap();
  return map.get(name) || name;
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

  const addLesson = (teacherName, { subject, classLabel, periodsPerWeek, isClassTeacher }) => {
    const name = String(teacherName || "").trim();
    if (!name) return;
    if (!lessonsByTeacherName.has(name)) lessonsByTeacherName.set(name, []);
    lessonsByTeacherName.get(name).push({
      id: newTeacherLessonId(),
      subject: String(subject || "").trim(),
      classLabel: String(classLabel || "").trim(),
      periodsPerWeek: Number(periodsPerWeek) || 0,
      isClassTeacher: Boolean(isClassTeacher),
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
        isClassTeacher: Boolean(row.isClassTeacher),
      };
      addLesson(row.primaryTeacher, payload);
      // Additional teachers are never the class teacher for this row
      const extras = Array.isArray(row.additionalTeachers) ? row.additionalTeachers : [];
      for (const extra of extras) addLesson(extra, { ...payload, isClassTeacher: false });
    }
  }

  const teachers = loadTeachersFull();
  const updated = teachers.map((t) => {
    // isClassTeacher is now carried directly from the class lesson rows (authoritative).
    // Fall back to t.classTeacher only for teachers who have no class-lesson-map entry yet
    // (e.g. the flag was set via the teacher page before any class lessons were saved).
    const newLessons = lessonsByTeacherName.get(t.name) || [];
    const anyFlagSet = newLessons.some((l) => l.isClassTeacher);

    let lessons;
    if (anyFlagSet) {
      // Class lessons already carry the correct flags — use them as-is.
      lessons = newLessons;
    } else {
      // No flag from class lessons: use classTeacherInfo (single source of truth) to
      // identify which specific subject should be flagged. Only fall back to the legacy
      // t.classTeacher + t.classTeacherSubject fields if classTeacherInfo has no entry.
      const ctInfoMap = loadClassTeacherInfoMap();
      lessons = newLessons.map((l) => {
        const cls = classes.find((c) => c.label === l.classLabel);
        if (cls) {
          const info = ctInfoMap[cls.id];
          // classTeacherInfo is authoritative: match teacher name AND subject
          if (info && info.teacherName && info.subject) {
            return { ...l, isClassTeacher: info.teacherName === t.name && l.subject === info.subject };
          }
        }
        // Legacy fallback: t.classTeacher field + t.classTeacherSubject
        const directCT = String(t.classTeacher || "").trim();
        if (!directCT) return l;
        const matchesClass =
          l.classLabel === directCT ||
          classes.some(
            (c) =>
              c.label === l.classLabel &&
              (c.label === directCT || String(c.title || "").trim() === directCT)
          );
        if (!matchesClass) return l;
        const ctSubj = String(t.classTeacherSubject || "").trim();
        // If a specific subject is stored, only flag that subject; otherwise flag all (old behavior).
        return { ...l, isClassTeacher: !ctSubj || l.subject === ctSubj };
      });
    }

    // Safety net: ensure only the first isClassTeacher row per class label wins.
    const seenCTClass = new Set();
    const dedupedLessons = lessons.map((l) => {
      if (!l.isClassTeacher) return l;
      if (seenCTClass.has(l.classLabel)) return { ...l, isClassTeacher: false };
      seenCTClass.add(l.classLabel);
      return l;
    });

    return {
      ...t,
      lessons: dedupedLessons,
      classTeacher: deriveClassTeacherFromLessons(dedupedLessons),
    };
  });

  saveTeachersFull(updated);
  return updated;
}

/** Enforce: at most one isClassTeacher:true row in a class lesson array. */
function enforceOneClassTeacher(lessons) {
  let seen = false;
  return lessons.map((l) => {
    if (!l.isClassTeacher) return l;
    if (seen) return { ...l, isClassTeacher: false };
    seen = true;
    return l;
  });
}

export function saveClassLessonsForClass(classId, lessons) {
  const map = loadClassLessonsMap();
  map[classId] = enforceOneClassTeacher(lessons);
  writeJson(CLASS_LESSONS_STORAGE_KEY, map);
  syncTeacherLessonsFromClassLessons();
}

/**
 * Upsert teacher-lesson entries into the class lesson map without triggering
 * a full teacher-lesson sync. Called when teacher lessons are saved directly,
 * so that ClassLessonsModal for each class stays in sync.
 *
 * entries: [{ subject, classLabel, primaryTeacher, additionalTeachers: string[], periodsPerWeek, isClassTeacher? }]
 *
 * When an entry has isClassTeacher: true, the flag is set on that row and
 * cleared from all other rows in the same class (one class teacher per class).
 */
export function upsertLessonsIntoClassMap(entries) {
  if (!entries || !entries.length) return;
  const classes = loadClassesList();
  const map = loadClassLessonsMap();

  for (const entry of entries) {
    const cls = classes.find((c) => c.label === entry.classLabel || (c.title && c.title === entry.classLabel));
    if (!cls) continue;

    const existing = Array.isArray(map[cls.id]) ? [...map[cls.id]] : [];
    const isNewCT = Boolean(entry.isClassTeacher);

    // If this entry claims to be class teacher, clear the flag from every other row.
    const cleared = isNewCT
      ? existing.map((l) =>
          l.subject === entry.subject && l.primaryTeacher === entry.primaryTeacher
            ? l
            : { ...l, isClassTeacher: false }
        )
      : existing;

    const idx = cleared.findIndex(
      (l) => l.subject === entry.subject && l.primaryTeacher === entry.primaryTeacher
    );
    const record = {
      subject: entry.subject,
      primaryTeacher: entry.primaryTeacher,
      additionalTeachers: Array.isArray(entry.additionalTeachers) ? entry.additionalTeachers : [],
      lessonsPerWeek: entry.periodsPerWeek,
      isClassTeacher: isNewCT,
    };

    if (idx >= 0) {
      cleared[idx] = record;
    } else {
      cleared.push(record);
    }
    map[cls.id] = cleared;
  }

  // Final dedup: if multiple entries in this call each claimed isClassTeacher:true
  // for the same class, only the first survives.
  for (const id of Object.keys(map)) {
    map[id] = enforceOneClassTeacher(map[id]);
  }

  writeJson(CLASS_LESSONS_STORAGE_KEY, map);
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
