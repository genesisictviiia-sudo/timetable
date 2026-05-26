import { listTeachersFromTimetable } from "./timetableSnapshot";
import { normalizeCard, parseSlotKey } from "./timetableValidation";

/** Teachers for teacher timetable view (frozen snapshot when available). */
export function listTeachersForView(timetable) {
  return listTeachersFromTimetable(timetable);
}

/** Lesson at slot for this teacher (from class timetable cells). */
export function getTeacherLessonAt(timetable, teacherName, day, period) {
  if (!timetable?.cells || !teacherName) return null;

  for (const [slotKey, raw] of Object.entries(timetable.cells)) {
    const parsed = parseSlotKey(slotKey);
    if (!parsed || parsed.day !== day || parsed.period !== period) continue;
    const card = normalizeCard(raw);
    if (!card?.teachers?.includes(teacherName)) continue;
    return {
      subject: card.subject,
      classLabel: card.classLabel,
      teachers: card.teachers,
      fixed: card.fixed,
    };
  }

  return null;
}

export function countTeacherLessons(timetable, teacherName) {
  if (!timetable?.cells || !teacherName) return 0;
  let n = 0;
  for (const raw of Object.values(timetable.cells)) {
    const card = normalizeCard(raw);
    if (card?.teachers?.includes(teacherName)) n++;
  }
  return n;
}
