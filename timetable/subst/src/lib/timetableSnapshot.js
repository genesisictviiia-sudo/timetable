import {
  createDefaultTimeOffGrid,
  getClassLessons,
  loadClassLessonsMap,
  loadClassesList,
  loadSchoolConstraints,
  loadSchoolStorageRaw,
  loadSubjects,
  loadTeachersFull,
} from "./settingsStorage";
import { normalizeCard } from "./timetableValidation";

/** Capture school / teacher / class data at generation time (frozen copy). */
export function captureTimetableSnapshot() {
  const school = loadSchoolStorageRaw() || {};
  const teachers = loadTeachersFull();
  const classes = loadClassesList().filter((c) => c.label);
  const classLessonsMap = loadClassLessonsMap();

  const classLessons = {};
  for (const cls of classes) {
    classLessons[cls.id] = getClassLessons(cls.id).map((row) => ({
      id: row.id,
      subject: row.subject,
      primaryTeacher: row.primaryTeacher,
      additionalTeachers: [...(row.additionalTeachers || [])],
      lessonsPerWeek: row.lessonsPerWeek,
    }));
  }

  return {
    capturedAt: new Date().toISOString(),
    schoolName: school.schoolName || "",
    academicYear: school.academicYear || "",
    daysPerWeek: Number(school.daysPerWeek) || 5,
    periodsPerDay: Number(school.periodsPerDay) || 1,
    periodsPerWeek:
      Number(school.periodsPerWeek) > 0
        ? Number(school.periodsPerWeek)
        : (Number(school.daysPerWeek) || 5) * (Number(school.periodsPerDay) || 1),
    dayLabels: [...(school.dayLabels || school.dayNames || [])],
    dayNames: [...(school.dayNames || school.dayLabels || [])],
    periodLabels: [...(school.periodLabels || [])],
    constraints: loadSchoolConstraints(),
    classes: classes.map((c) => ({
      id: c.id,
      label: c.label,
      title: c.title || c.label,
      grade: c.grade,
      section: c.section,
    })),
    teachers: teachers
      .filter((t) => t.name?.trim())
      .map((t) => ({
        name: t.name.trim(),
        classTeacher: String(t.classTeacher || "").trim(),
        timeOffGrid: JSON.parse(JSON.stringify(t.timeOffGrid || [])),
        lessons: (t.lessons || []).map((l) => ({
          subject: l.subject,
          classLabel: l.classLabel,
          isClassTeacher: Boolean(l.isClassTeacher),
        })),
      })),
    classLessons,
    classLessonsMap: JSON.parse(JSON.stringify(classLessonsMap)),
    subjectOrder: loadSubjects().map((s) => s.name),
  };
}

/** Reconstruct snapshot from saved cells only (no live General Settings). */
export function captureTimetableSnapshotFromTimetable(timetable) {
  const daysPerWeek = timetable.daysPerWeek || 5;
  const periodsPerDay = timetable.periodsPerDay || 1;
  const periodsPerWeek =
    Number(timetable.periodsPerWeek) > 0
      ? Number(timetable.periodsPerWeek)
      : daysPerWeek * periodsPerDay;
  const timeOffGrid = createDefaultTimeOffGrid(daysPerWeek, periodsPerDay, periodsPerWeek);

  const teacherNames = listTeachersFromTimetable(timetable);
  const teachers = teacherNames.map((name) => ({
    name,
    timeOffGrid: JSON.parse(JSON.stringify(timeOffGrid)),
    lessons: [],
  }));

  return {
    capturedAt: timetable.generatedAt || timetable.frozenAt || new Date().toISOString(),
    schoolName: timetable.schoolName || "",
    academicYear: timetable.academicYear || "",
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek,
    dayLabels: [...(timetable.dayLabels || timetable.dayNames || [])],
    dayNames: [...(timetable.dayNames || timetable.dayLabels || [])],
    periodLabels: [...(timetable.periodLabels || [])],
    constraints: { ...(timetable.constraints || {}) },
    classes: [...(timetable.classes || [])],
    teachers,
    classLessons: {},
    classLessonsMap: {},
    subjectOrder: collectSubjectOrderFromTimetable(timetable),
  };
}

function collectSubjectOrderFromTimetable(timetable) {
  const seen = new Set();
  const order = [];
  for (const raw of Object.values(timetable?.cells || {})) {
    const subject = normalizeCard(raw)?.subject;
    if (!subject || seen.has(subject)) continue;
    seen.add(subject);
    order.push(subject);
  }
  return order.length ? order : loadSubjects().map((s) => s.name);
}

export function getSubjectOrder(timetable) {
  const fromSnapshot = timetable?.snapshot?.subjectOrder;
  if (Array.isArray(fromSnapshot) && fromSnapshot.length) return fromSnapshot;
  return loadSubjects().map((s) => s.name);
}

function getTeacherSubjects(teacherName, timetable) {
  const snapshotTeacher = timetable?.snapshot?.teachers?.find((t) => t.name === teacherName);
  if (snapshotTeacher?.lessons?.length) {
    return [...new Set(snapshotTeacher.lessons.map((l) => l.subject).filter(Boolean))];
  }

  const subjects = new Set();
  for (const raw of Object.values(timetable?.cells || {})) {
    const card = normalizeCard(raw);
    if (card?.teachers?.includes(teacherName) && card.subject) {
      subjects.add(card.subject);
    }
  }
  return [...subjects];
}

function subjectSortIndex(teacherName, subjectOrder, timetable) {
  const subjects = getTeacherSubjects(teacherName, timetable);
  let best = subjectOrder.length;
  for (const subject of subjects) {
    const idx = subjectOrder.indexOf(subject);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best;
}

function sortTeacherNamesBySubjectOrder(names, timetable) {
  const subjectOrder = getSubjectOrder(timetable);
  return [...names].sort((a, b) => {
    const bySubject = subjectSortIndex(a, subjectOrder, timetable) - subjectSortIndex(b, subjectOrder, timetable);
    if (bySubject !== 0) return bySubject;
    return a.localeCompare(b);
  });
}

export function freezeTimetable(timetable, snapshot = null) {
  if (!timetable) return null;
  const snap = snapshot || timetable.snapshot || captureTimetableSnapshot();
  return {
    ...timetable,
    frozen: true,
    frozenAt: timetable.frozenAt || new Date().toISOString(),
    snapshot: snap,
  };
}

export function getSnapshotTeachers(timetable) {
  const list = timetable?.snapshot?.teachers;
  if (Array.isArray(list) && list.length) return list;
  return null;
}

export function listTeachersFromTimetable(timetable) {
  const fromSnapshot = getSnapshotTeachers(timetable);
  const names = fromSnapshot
    ? fromSnapshot.map((t) => t.name).filter(Boolean)
    : collectTeacherNamesFromCells(timetable);

  return sortTeacherNamesBySubjectOrder(names, timetable);
}

function collectTeacherNamesFromCells(timetable) {
  const names = new Set();
  for (const raw of Object.values(timetable?.cells || {})) {
    const teachers = raw?.teachers;
    if (Array.isArray(teachers)) {
      teachers.forEach((n) => n && names.add(n));
    }
  }
  return [...names];
}

export function isTimetableFrozen(timetable) {
  return Boolean(timetable?.frozen);
}
