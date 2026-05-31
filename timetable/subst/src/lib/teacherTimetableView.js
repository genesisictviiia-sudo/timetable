import { listTeachersFromTimetable } from "./timetableSnapshot";
import {
  canPlaceCardAt,
  findCardById,
  normalizeCard,
  parseSlotKey,
} from "./timetableValidation";

/** Teachers for teacher timetable view (frozen snapshot when available). */
export function listTeachersForView(timetable) {
  return listTeachersFromTimetable(timetable);
}

/** Card placed for this teacher at day/period (same data as class timetable cells). */
export function getTeacherCardAt(timetable, teacherName, day, period) {
  if (!timetable?.cells || !teacherName) return null;

  for (const [slotKey, raw] of Object.entries(timetable.cells)) {
    const parsed = parseSlotKey(slotKey);
    if (!parsed || parsed.day !== day || parsed.period !== period) continue;
    const card = normalizeCard(raw);
    if (!card?.teachers?.includes(teacherName)) continue;
    return {
      card,
      classId: parsed.classId,
      slotKey,
      day: parsed.day,
      period: parsed.period,
    };
  }

  return null;
}

/** @deprecated use getTeacherCardAt */
export function getTeacherLessonAt(timetable, teacherName, day, period) {
  const entry = getTeacherCardAt(timetable, teacherName, day, period);
  if (!entry) return null;
  return {
    subject: entry.card.subject,
    classLabel: entry.card.classLabel,
    teachers: entry.card.teachers,
    fixed: entry.card.fixed,
  };
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

/** Preview valid drop targets when moving a card in teacher view (updates class cells). */
export function buildTeacherPlacementPreview(timetable, cardId, teacherName) {
  const preview = {};
  if (!timetable || !cardId || !teacherName) return preview;

  const found = findCardById(timetable, cardId);
  if (!found.card?.classId || !found.card.teachers?.includes(teacherName)) return preview;

  const classId = found.card.classId;
  const days = timetable.daysPerWeek || 0;
  const periods = timetable.periodsPerDay || 0;

  for (let day = 0; day < days; day++) {
    for (let period = 0; period < periods; period++) {
      preview[`${day}|${period}`] = canPlaceCardAt(
        timetable,
        cardId,
        classId,
        day,
        period
      ).ok;
    }
  }

  return preview;
}

export function teacherGridKey(day, period) {
  return `${day}|${period}`;
}
