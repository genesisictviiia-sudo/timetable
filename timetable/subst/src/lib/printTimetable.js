import { getCellCard } from "./timetableValidation";
import { loadSchoolStorageRaw, loadSubjects } from "./settingsStorage";
import { getTeacherLessonAt, listTeachersForView } from "./teacherTimetableView";

/** Read the institution / school name from settings. Returns "" if unset. */
export function loadInstitutionName() {
  try {
    const parsed = loadSchoolStorageRaw();
    return String(parsed?.schoolName || "").trim();
  } catch {
    return "";
  }
}

function formatPeriodTime(startTime, endTime) {
  const start = String(startTime || "").trim();
  const end = String(endTime || "").trim();
  if (start && end) return `${start}–${end}`;
  return start || end || "";
}

function buildSubjectShortMap() {
  const map = new Map();
  for (const s of loadSubjects()) {
    map.set(s.name, s.shortName);
  }
  return map;
}

function toShortSubject(subject, shortMap) {
  if (!subject) return "";
  return shortMap.get(subject) || subject;
}

/**
 * Period columns from School settings → Setting of periods (lessons + breaks).
 * Falls back to lesson-only columns from the timetable when school periods are missing.
 */
export function loadSchoolPeriodColumns(timetable) {
  try {
    const school = loadSchoolStorageRaw();
    if (!school) return buildPeriodColumnsFromTimetable(timetable);
    const rows = Array.isArray(school?.periods) ? school.periods : [];
    if (!rows.length) return buildPeriodColumnsFromTimetable(timetable);

    let lessonIndex = 0;
    return rows.map((p, slotIndex) => {
      const isBreak = p.type === "break";
      const label =
        String(p.name || "").trim() || (isBreak ? "Break" : `P${lessonIndex + 1}`);
      const col = {
        slotIndex,
        isBreak,
        label,
        timeLabel: formatPeriodTime(p.startTime, p.endTime),
        lessonPeriod: null,
      };
      if (!isBreak) {
        col.lessonPeriod = lessonIndex;
        lessonIndex += 1;
      }
      return col;
    });
  } catch {
    return buildPeriodColumnsFromTimetable(timetable);
  }
}

function buildPeriodColumnsFromTimetable(timetable) {
  const columns = timetable.columns || [];
  const periodsPerDay = timetable.periodsPerDay || 1;
  const out = [];
  for (let p = 0; p < periodsPerDay; p++) {
    const col = columns.find((c) => c.period === p) || columns[p];
    out.push({
      slotIndex: p,
      isBreak: false,
      label: col?.periodLabel || timetable.periodLabels?.[p] || `P${p + 1}`,
      timeLabel: "",
      lessonPeriod: p,
    });
  }
  return out;
}

function buildDayRows(timetable) {
  const columns = timetable.columns || [];
  const dayLabels = timetable.dayLabels || timetable.dayNames || [];
  const out = [];
  for (let d = 0; d < (timetable.daysPerWeek || 0); d++) {
    out.push({
      day: d,
      label: dayLabels[d] || columns.find((c) => c.day === d)?.dayLabel || `Day ${d + 1}`,
    });
  }
  return out;
}

function getLessonCell(timetable, kind, itemContext, day, lessonPeriod, shortMap) {
  if (lessonPeriod == null) return null;

  if (kind === "class") {
    const card = getCellCard(timetable, itemContext.classId, day, lessonPeriod);
    if (!card) return null;
    return {
      subject: toShortSubject(card.subject, shortMap),
      teachers: Array.isArray(card.teachers) ? card.teachers : [],
    };
  }

  const lesson = getTeacherLessonAt(timetable, itemContext.teacherName, day, lessonPeriod);
  if (!lesson) return null;
  return {
    subject: toShortSubject(lesson.subject, shortMap),
    classLabel: lesson.classLabel,
  };
}

/**
 * Build a print payload: list of items, each with a title (class/teacher name)
 * and a 2-D grid of cell contents aligned to school period columns.
 */
export function buildPrintData(timetable, kind, scope, current = {}) {
  if (!timetable) return { periods: [], days: [], items: [] };

  const periods = loadSchoolPeriodColumns(timetable);
  const days = buildDayRows(timetable);
  const shortMap = buildSubjectShortMap();
  const items = [];

  if (kind === "class") {
    const classes = Array.isArray(timetable.classes) ? timetable.classes : [];
    const targets =
      scope === "current" && current.classId
        ? classes.filter((c) => c.id === current.classId)
        : classes;
    for (const cls of targets) {
      const cells = days.map(({ day }) =>
        periods.map((col) => {
          if (col.isBreak) return null;
          return getLessonCell(
            timetable,
            "class",
            { classId: cls.id },
            day,
            col.lessonPeriod,
            shortMap
          );
        })
      );
      items.push({
        title: cls.title || cls.label || "Class",
        subtitle: cls.title && cls.label && cls.title !== cls.label ? cls.label : "",
        cells,
      });
    }
  } else {
    const teachers = listTeachersForView(timetable);
    const targets =
      scope === "current" && current.teacherName
        ? teachers.filter((t) => t === current.teacherName)
        : teachers;
    for (const teacher of targets) {
      const cells = days.map(({ day }) =>
        periods.map((col) => {
          if (col.isBreak) return null;
          return getLessonCell(
            timetable,
            "teacher",
            { teacherName: teacher },
            day,
            col.lessonPeriod,
            shortMap
          );
        })
      );
      items.push({ title: teacher, subtitle: "", cells });
    }
  }

  return { periods, days, items };
}
