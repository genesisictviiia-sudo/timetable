import { getCellCard } from "./timetableValidation";
import { getTeacherLessonAt, listTeachersForView } from "./teacherTimetableView";

const SCHOOL_STORAGE_KEY = "school";

/** Read the institution / school name from settings. Returns "" if unset. */
export function loadInstitutionName() {
  try {
    const raw = localStorage.getItem(SCHOOL_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.schoolName || "").trim();
  } catch {
    return "";
  }
}

function buildPeriodColumns(timetable) {
  const columns = timetable.columns || [];
  const periodsPerDay = timetable.periodsPerDay || 1;
  const out = [];
  for (let p = 0; p < periodsPerDay; p++) {
    const col = columns.find((c) => c.period === p) || columns[p];
    out.push({
      period: p,
      label: col?.periodLabel || timetable.periodLabels?.[p] || `P${p + 1}`,
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

/**
 * Build a print payload: list of items, each with a title (class/teacher name)
 * and a 2-D grid of cell contents.
 *
 * @param {object} timetable Generated timetable from storage
 * @param {"class"|"teacher"} kind
 * @param {"all"|"current"} scope
 * @param {object} current  { classId?, teacherName? }
 * @returns {{ periods: Array, days: Array, items: Array<{ title: string, subtitle?: string, cells: Array<Array<{ subject?: string, teachers?: string[], classLabel?: string } | null>> }> }}
 */
export function buildPrintData(timetable, kind, scope, current = {}) {
  if (!timetable) return { periods: [], days: [], items: [] };
  const periods = buildPeriodColumns(timetable);
  const days = buildDayRows(timetable);

  const items = [];

  if (kind === "class") {
    const classes = Array.isArray(timetable.classes) ? timetable.classes : [];
    const targets =
      scope === "current" && current.classId
        ? classes.filter((c) => c.id === current.classId)
        : classes;
    for (const cls of targets) {
      const cells = days.map(({ day }) =>
        periods.map(({ period }) => {
          const card = getCellCard(timetable, cls.id, day, period);
          if (!card) return null;
          return {
            subject: card.subject,
            teachers: Array.isArray(card.teachers) ? card.teachers : [],
          };
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
        periods.map(({ period }) => {
          const lesson = getTeacherLessonAt(timetable, teacher, day, period);
          if (!lesson) return null;
          return {
            subject: lesson.subject,
            classLabel: lesson.classLabel,
          };
        })
      );
      items.push({ title: teacher, subtitle: "", cells });
    }
  }

  return { periods, days, items };
}
