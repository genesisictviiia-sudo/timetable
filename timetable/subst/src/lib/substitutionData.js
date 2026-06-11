import { listTeachersFromTimetable } from "./timetableSnapshot";
import { loadGeneratedTimetable } from "./timetableStorage";
import { loadSchoolScheduleDimensions, loadTeachersFull } from "./settingsStorage";
import { normKey } from "./substituteLogic";
import { normalizeCard, parseSlotKey } from "./timetableValidation";

const FULL_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_TO_FULL = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function norm(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function resolveDayName(timetable, dayIndex) {
  const labels = timetable.dayNames || timetable.dayLabels || [];
  const raw = labels[dayIndex];
  if (!raw) return FULL_DAY_NAMES[dayIndex] || `Day ${dayIndex + 1}`;
  const trimmed = String(raw).trim();
  return SHORT_TO_FULL[trimmed] || trimmed;
}

function formatSlotLabel(classLabel, subject) {
  const cls = norm(classLabel);
  const sub = norm(subject);
  if (!cls) return "Free";
  return sub ? `${cls} ${sub}` : cls;
}

function buildTeachesMap(teachers) {
  const teachesMap = {};

  for (const t of teachers) {
    const classes = new Set();
    const pairs = new Set();

    for (const lesson of t.lessons || []) {
      const classLabel = norm(lesson.classLabel);
      const subject = norm(lesson.subject);
      if (!classLabel) continue;
      classes.add(classLabel.toUpperCase());
      if (subject) pairs.add(normKey(classLabel, subject));
    }

    teachesMap[t.name] = {
      classes: [...classes],
      classSubjectPairs: [...pairs],
    };
  }

  return teachesMap;
}

function buildBaseWorkload(teachers) {
  const baseByName = {};
  for (const t of teachers) {
    const total = (t.lessons || []).reduce((sum, l) => sum + (Number(l.periodsPerWeek) || 0), 0);
    baseByName[t.name] = total;
  }
  return baseByName;
}

function buildTeacherTimetableFromGenerated(timetable, teacherNames) {
  const daysPerWeek = timetable.daysPerWeek || 0;
  const periodsPerDay = timetable.periodsPerDay || 0;
  const dayNames = Array.from({ length: daysPerWeek }, (_, d) => resolveDayName(timetable, d));

  const teacherTimetable = {};
  for (const name of teacherNames) {
    teacherTimetable[name] = {};
    for (const dayName of dayNames) {
      teacherTimetable[name][dayName] = Array(periodsPerDay).fill("Free");
    }
  }

  for (const [slotKey, raw] of Object.entries(timetable.cells || {})) {
    const parsed = parseSlotKey(slotKey);
    const card = normalizeCard(raw);
    if (!parsed || !card) continue;

    const dayName = dayNames[parsed.day];
    if (!dayName) continue;

    const slotText = formatSlotLabel(card.classLabel, card.subject);
    for (const teacherName of card.teachers || []) {
      if (!teacherTimetable[teacherName]) {
        teacherTimetable[teacherName] = {};
        for (const dn of dayNames) {
          teacherTimetable[teacherName][dn] = Array(periodsPerDay).fill("Free");
        }
      }
      teacherTimetable[teacherName][dayName][parsed.period] = slotText;
    }
  }

  return { teacherTimetable, dayNames, periodsPerDay, daysPerWeek };
}

/**
 * Substitution dataset from General Settings + generated class timetable only.
 * Does not use Excel/PDF imports.
 */
export function buildSubstitutionDataset() {
  const errors = [];
  const timetable = loadGeneratedTimetable();
  const schedule = loadSchoolScheduleDimensions();
  const teachersDb = loadTeachersFull().filter((t) => t.name);

  if (!timetable?.cells || !Object.keys(timetable.cells).length) {
    errors.push("No generated timetable found. Open Time Table and click Generate Timetable first.");
  }

  if (!teachersDb.length) {
    errors.push("No teachers in General Settings → Teachers. Add and save teachers first.");
  }

  if (!schedule?.daysPerWeek || !schedule?.lessonPeriodsPerDay) {
    errors.push("School schedule is incomplete. Save School settings (days and periods per day).");
  }

  if (errors.length) {
    return {
      ok: false,
      errors,
      teacherList: [],
      baseByName: {},
      teacherTimetable: {},
      teachesMap: {},
      periodsPerDay: schedule?.lessonPeriodsPerDay ?? 6,
      daysPerWeek: schedule?.daysPerWeek ?? 6,
      dayNames: FULL_DAY_NAMES.slice(0, schedule?.daysPerWeek ?? 6),
    };
  }

  const teacherList = listTeachersFromTimetable(timetable);
  const teachersByName = new Map(teachersDb.map((t) => [t.name, t]));

  for (const name of teacherList) {
    if (!teachersByName.has(name)) {
      teachersByName.set(name, { name, lessons: [], timeOffGrid: null });
    }
  }

  const teachers = [...teachersByName.values()];
  const { teacherTimetable, dayNames, periodsPerDay, daysPerWeek } = buildTeacherTimetableFromGenerated(
    timetable,
    teacherList
  );

  return {
    ok: true,
    errors: [],
    teacherList,
    baseByName: buildBaseWorkload(teachers),
    teacherTimetable,
    teachesMap: buildTeachesMap(teachers),
    periodsPerDay,
    daysPerWeek,
    dayNames,
  };
}
