import { getSnapshotTeachers } from "./timetableSnapshot";
import {
  getClassLessons,
  getSubjectTimeOffGrid,
  loadClassLessonsMap,
  loadSchoolPeriodsPerWeek,
  loadSubjects,
  loadTeachersFull,
  normalizeTimeOffGrid,
  isSlotWithinPeriodsPerWeek,
  getClassLessonStats,
} from "./settingsStorage";

export function makeSlotKey(classId, day, period) {
  return `${classId}|${day}|${period}`;
}

export function parseSlotKey(key) {
  const parts = String(key).split("|");
  if (parts.length !== 3) return null;
  return {
    classId: parts[0],
    day: Number(parts[1]),
    period: Number(parts[2]),
  };
}

export function createCardId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeCard(card) {
  if (!card) return null;
  return {
    id: card.id || createCardId(),
    classId: card.classId,
    classLabel: String(card.classLabel || "").trim(),
    subject: String(card.subject || "").trim(),
    teachers: Array.isArray(card.teachers) ? card.teachers.filter(Boolean) : [],
    fixed: Boolean(card.fixed),
    day: card.day != null ? Number(card.day) : undefined,
    period: card.period != null ? Number(card.period) : undefined,
    isClassTeacherSlot: Boolean(card.isClassTeacherSlot),
    lessonId: card.lessonId || null,
    // Links this card to its sibling cards in every other class that share
    // the same multi-class lesson (same subject/teachers, taught to several
    // classes simultaneously) — see moveCardToSlot / getPlacementConflicts.
    groupId: card.groupId || null,
    // Which weekly occurrence of that shared lesson this is (0, 1, 2…) —
    // needed to correlate TRAY siblings, which have no day/period yet to
    // match by the way grid siblings do.
    instanceIndex: card.instanceIndex != null ? Number(card.instanceIndex) : null,
  };
}

function teacherBusyKey(teacher, day, period) {
  return `${teacher}|${day}|${period}`;
}

export function getClassById(timetable, classId) {
  return timetable?.classes?.find((c) => c.id === classId) ?? null;
}

export function getCellCard(timetable, classId, day, period) {
  const key = makeSlotKey(classId, day, period);
  return normalizeCard(timetable?.cells?.[key] ?? null);
}

export function findCardById(timetable, cardId) {
  if (!timetable || !cardId) return { card: null, location: null, slotKey: null };

  for (const [slotKey, raw] of Object.entries(timetable.cells || {})) {
    const card = normalizeCard(raw);
    if (card?.id === cardId) {
      const parsed = parseSlotKey(slotKey);
      return { card, location: "grid", slotKey, ...parsed };
    }
  }

  const tray = timetable.tray || [];
  const idx = tray.findIndex((c) => normalizeCard(c)?.id === cardId);
  if (idx >= 0) {
    return { card: normalizeCard(tray[idx]), location: "tray", slotKey: null, trayIndex: idx };
  }

  return { card: null, location: null, slotKey: null };
}

export function buildColumns(dayLabels, periodLabels, daysPerWeek, periodsPerDay) {
  const columns = [];
  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      const dayLabel = dayLabels[day] || `Day ${day + 1}`;
      const periodLabel = periodLabels[period] || `P${period + 1}`;
      columns.push({
        day,
        period,
        label: `${dayLabel} · ${periodLabel}`,
        dayLabel,
        periodLabel,
      });
    }
  }
  return columns;
}

function getTeacherTimeOffGrid(teacher, daysPerWeek, periodsPerDay, periodsPerWeek) {
  const ppw =
    periodsPerWeek ??
    loadSchoolPeriodsPerWeek() ??
    daysPerWeek * periodsPerDay;
  return normalizeTimeOffGrid(teacher.timeOffGrid, daysPerWeek, periodsPerDay, ppw);
}

function resolvePeriodsPerWeek(timetable) {
  const fromTimetable = Number(timetable?.periodsPerWeek);
  if (Number.isFinite(fromTimetable) && fromTimetable > 0) return fromTimetable;
  const fromSnapshot = Number(timetable?.snapshot?.periodsPerWeek);
  if (Number.isFinite(fromSnapshot) && fromSnapshot > 0) return fromSnapshot;
  const fromSnapshotSchool = Number(timetable?.snapshot?.school?.periodsPerWeek);
  if (Number.isFinite(fromSnapshotSchool) && fromSnapshotSchool > 0) return fromSnapshotSchool;
  return loadSchoolPeriodsPerWeek();
}

/** Periods per week from General Settings → School settings (always live). */
export function getSchoolPeriodsPerWeek() {
  return loadSchoolPeriodsPerWeek() ?? 0;
}

/** Total lessons/week allotted to a class from General Settings → Class → Lessons (always live). */
export function getAllottedLessonsPerWeek(classId) {
  if (!classId) return 0;
  return getClassLessonStats(classId).periodsTotal;
}

/** Schedulable slots per class (respects General Settings → periods per week). */
export function getSlotsPerClass(timetable) {
  if (!timetable) return 0;
  const days = timetable.daysPerWeek || 0;
  const periods = timetable.periodsPerDay || 0;
  const gridSlots = days * periods;
  const ppw = resolvePeriodsPerWeek(timetable);
  if (ppw) return Math.min(ppw, gridSlots);
  return gridSlots;
}

/** Count all placed lessons on the grid. */
export function countPlacedSlotsOnGrid(timetable) {
  if (!timetable?.cells) return 0;
  return Object.keys(timetable.cells).length;
}

/** Count placed lessons for a class, excluding slots outside the weekly cap. */
export function countPlacedSlotsForClass(timetable, classId) {
  if (!timetable || !classId) return 0;
  const periodsPerDay = timetable.periodsPerDay || 0;
  const ppw = resolvePeriodsPerWeek(timetable);
  let n = 0;
  for (const key of Object.keys(timetable.cells || {})) {
    if (!key.startsWith(`${classId}|`)) continue;
    const parsed = parseSlotKey(key);
    if (!parsed) continue;
    if (ppw && !isSlotWithinPeriodsPerWeek(parsed.day, parsed.period, periodsPerDay, ppw)) {
      continue;
    }
    n++;
  }
  return n;
}

export function buildTeacherOccupancy(timetable, ignoreCardId = null) {
  // Accepts a single id, an array, or a Set — the grouped (multi-class)
  // move/conflict logic needs to ignore every sibling card at once.
  const ignoreSet =
    ignoreCardId == null
      ? null
      : ignoreCardId instanceof Set
      ? ignoreCardId
      : new Set(Array.isArray(ignoreCardId) ? ignoreCardId : [ignoreCardId]);

  const occupancy = new Map();

  const register = (card, classId, day, period) => {
    if (!card || (ignoreSet && ignoreSet.has(card.id))) return;
    for (const teacher of card.teachers) {
      occupancy.set(teacherBusyKey(teacher, day, period), {
        cardId: card.id,
        classId,
        classLabel: card.classLabel,
        subject: card.subject,
        teacher,
      });
    }
  };

  for (const [slotKey, raw] of Object.entries(timetable?.cells || {})) {
    const parsed = parseSlotKey(slotKey);
    const card = normalizeCard(raw);
    if (!parsed || !card) continue;
    register(card, parsed.classId, parsed.day, parsed.period);
  }

  return occupancy;
}

function isTeacherAllowed(teachers, classLessonsMap, classId, classLabel, subject, teacherName) {
  const t = teachers.find((x) => x.name === teacherName);
  if (t) {
    const fromLessons = (t.lessons || []).some(
      (l) => l.classLabel === classLabel && l.subject === subject
    );
    if (fromLessons) return true;
  }

  const rows = Array.isArray(classLessonsMap[classId]) ? classLessonsMap[classId] : [];
  for (const row of rows) {
    if (row.subject !== subject) continue;
    if (row.primaryTeacher === teacherName) return true;
    if ((row.additionalTeachers || []).includes(teacherName)) return true;
  }

  return false;
}

function resolveTeachersForValidation(timetable) {
  const snapshot = getSnapshotTeachers(timetable);
  if (snapshot) return snapshot;
  return loadTeachersFull();
}

export function checkSubjectTimeOff(timetable, card, day, period) {
  const subjects = loadSubjects();
  const subject = subjects.find((s) => s.name === card.subject);
  if (!subject) return false;

  const periodsPerWeek = resolvePeriodsPerWeek(timetable);
  const grid = getSubjectTimeOffGrid(
    subject,
    timetable.daysPerWeek,
    timetable.periodsPerDay,
    periodsPerWeek
  );
  return !grid[day]?.[period];
}

export function checkTeacherTimeOff(timetable, card, day, period) {
  const teachers = resolveTeachersForValidation(timetable);
  const daysPerWeek = timetable.daysPerWeek;
  const periodsPerDay = timetable.periodsPerDay;
  const unavailable = [];

  for (const name of card.teachers) {
    const teacher = teachers.find((t) => t.name === name);
    if (!teacher) continue;
    const periodsPerWeek = resolvePeriodsPerWeek(timetable);
    const grid = getTeacherTimeOffGrid(
      teacher,
      daysPerWeek,
      periodsPerDay,
      periodsPerWeek
    );
    if (!grid[day]?.[period]) {
      unavailable.push(name);
    }
  }

  return unavailable;
}

export function checkTeacherClash(timetable, card, targetClassId, targetDay, targetPeriod, ignoreCardId = null) {
  const occupancy = buildTeacherOccupancy(timetable, ignoreCardId);
  const clashes = [];

  for (const teacher of card.teachers) {
    const key = teacherBusyKey(teacher, targetDay, targetPeriod);
    const existing = occupancy.get(key);
    if (existing) {
      clashes.push({
        teacher,
        existingClassLabel: existing.classLabel,
        existingSubject: existing.subject,
      });
    }
  }

  return clashes;
}

export function validatePlacement(timetable, card, targetClassId, targetDay, targetPeriod, options = {}) {
  const normalized = normalizeCard(card);
  if (!normalized) {
    return { ok: false, message: "Invalid lesson card." };
  }

  if (normalized.fixed && !options.allowFixedMove) {
    return { ok: false, message: "This lesson is fixed. Unfix it before moving." };
  }

  if (!normalized.subject) {
    return { ok: false, message: "Lesson card has no subject." };
  }

  if (!normalized.teachers.length) {
    return { ok: false, message: "Lesson card has no teachers assigned." };
  }

  const cls = getClassById(timetable, targetClassId);
  if (!cls) {
    return { ok: false, message: "Unknown class." };
  }

  if (!timetable.frozen) {
    const teachers = loadTeachersFull();
    const classLessonsMap = loadClassLessonsMap();
    const notAllowed = normalized.teachers.filter(
      (name) => !isTeacherAllowed(teachers, classLessonsMap, targetClassId, cls.label, normalized.subject, name)
    );

    if (notAllowed.length) {
      return {
        ok: false,
        message: `Teacher(s) not assigned to ${cls.label} / ${normalized.subject}: ${notAllowed.join(", ")}`,
      };
    }

    const unknownTeachers = normalized.teachers.filter((name) => !teachers.some((t) => t.name === name));
    if (unknownTeachers.length) {
      return { ok: false, message: `Unknown teacher(s): ${unknownTeachers.join(", ")}` };
    }
  }

  const ignoreCardId = options.ignoreCardId ?? normalized.id;
  const clashes = checkTeacherClash(
    timetable,
    normalized,
    targetClassId,
    targetDay,
    targetPeriod,
    ignoreCardId
  );

  if (clashes.length) {
    const detail = clashes
      .map(
        (c) =>
          `${c.teacher} is already teaching ${c.existingClassLabel} (${c.existingSubject}) at this time`
      )
      .join("; ");
    return { ok: false, message: `Teacher clash: ${detail}` };
  }

  const timeOff = checkTeacherTimeOff(timetable, normalized, targetDay, targetPeriod);
  if (timeOff.length && !options.ignoreTimeOff) {
    return {
      ok: false,
      message: `Teacher time off: ${timeOff.join(", ")} unavailable on this slot`,
    };
  }

  if (checkSubjectTimeOff(timetable, normalized, targetDay, targetPeriod) && !options.ignoreTimeOff) {
    return {
      ok: false,
      message: `Subject time off: ${normalized.subject} cannot be taught on this slot`,
    };
  }

  return { ok: true, message: "" };
}

/** Whether a card can be dropped on this class slot (same rules as moveCardToSlot). */
export function canPlaceCardAt(timetable, cardId, targetClassId, targetDay, targetPeriod) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found." };
  }

  if (found.card.fixed) {
    return { ok: false, message: "Fixed lessons cannot be moved." };
  }

  const validation = validatePlacement(timetable, found.card, targetClassId, targetDay, targetPeriod, {
    ignoreCardId: cardId,
  });

  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const targetKey = makeSlotKey(targetClassId, targetDay, targetPeriod);
  const displaced = normalizeCard(timetable.cells?.[targetKey]);

  if (displaced && displaced.id !== cardId && displaced.fixed) {
    return { ok: false, message: "Target cell has a fixed lesson." };
  }

  return { ok: true, message: "" };
}

/** Map slotKey → true if the card can be placed in that cell. */
export function buildPlacementPreview(timetable, cardId, classId) {
  const preview = {};
  if (!timetable || !cardId || !classId) return preview;

  const days = timetable.daysPerWeek || 0;
  const periods = timetable.periodsPerDay || 0;

  for (let day = 0; day < days; day++) {
    for (let period = 0; period < periods; period++) {
      const key = makeSlotKey(classId, day, period);
      preview[key] = canPlaceCardAt(timetable, cardId, classId, day, period).ok;
    }
  }

  return preview;
}

function cloneTimetable(timetable) {
  return {
    ...timetable,
    cells: { ...(timetable.cells || {}) },
    tray: [...(timetable.tray || [])],
    classes: [...(timetable.classes || [])],
    columns: [...(timetable.columns || [])],
  };
}

function removeCardFromLocation(timetable, cardId) {
  for (const key of Object.keys(timetable.cells)) {
    if (timetable.cells[key]?.id === cardId) {
      delete timetable.cells[key];
      return "grid";
    }
  }
  const idx = (timetable.tray || []).findIndex((c) => c?.id === cardId);
  if (idx >= 0) {
    timetable.tray.splice(idx, 1);
    return "tray";
  }
  return null;
}

/**
 * Move a card to a new grid slot. A multi-class (grouped) card — the same
 * lesson shared by several classes at once — is delegated to
 * moveGroupedCardToSlot so every class in the group moves together, to the
 * same new day/period, instead of only the one class being dragged in.
 */
export function moveCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod) {
  const found = findCardById(timetable, cardId);
  if (found.card?.groupId && found.location === "grid") {
    return moveGroupedCardToSlot(timetable, cardId, targetDay, targetPeriod);
  }
  if (found.card?.groupId && found.location === "tray") {
    return moveGroupedTrayCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod);
  }
  return moveSingleCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod);
}

/**
 * Place a grouped lesson that's still in the tray — dragging one class's
 * tray card onto the grid places every OTHER class's still-tray sibling for
 * the same weekly occurrence at the same time, each into its own class at
 * the same day/period. If any sibling can't legally go there (clash, fixed
 * target, time off), the whole placement is declined rather than only
 * seating some of the group.
 */
function moveGroupedTrayCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }

  const dragged = normalizeCard(found.card);
  const traySiblings = findGroupSiblingsInTray(timetable, dragged.groupId, dragged.instanceIndex, cardId);
  const group = [{ ...dragged, classId: targetClassId }, ...traySiblings];
  const groupIds = new Set(group.map((c) => c.id));

  // Validate every member's own target slot, ignoring clashes against the
  // group's own members (same classes/teachers moving together).
  for (const member of group) {
    const validation = validatePlacement(timetable, member, member.classId, targetDay, targetPeriod, {
      ignoreCardId: groupIds,
    });
    if (!validation.ok) {
      return { ok: false, message: `${member.classLabel}: ${validation.message}`, timetable };
    }
    const targetKey = makeSlotKey(member.classId, targetDay, targetPeriod);
    const occupant = normalizeCard(timetable.cells?.[targetKey]);
    if (occupant && occupant.fixed) {
      return {
        ok: false,
        message: `${member.classLabel}: target cell has a fixed lesson. Unfix it or choose another cell.`,
        timetable,
      };
    }
  }

  const next = cloneTimetable(timetable);
  for (const member of group) {
    removeCardFromLocation(next, member.id);
    const targetKey = makeSlotKey(member.classId, targetDay, targetPeriod);
    const displaced = normalizeCard(next.cells[targetKey]);
    if (displaced) {
      delete next.cells[targetKey];
      const { day: _d, period: _p, ...rest } = displaced;
      next.tray.push({ ...rest, fixed: displaced.fixed });
    }
    const { day: _d2, period: _p2, ...memberRest } = member;
    next.cells[targetKey] = { ...memberRest, day: targetDay, period: targetPeriod };
  }

  return { ok: true, message: "", timetable: next };
}

function moveSingleCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }

  if (found.card.fixed) {
    return { ok: false, message: "Fixed lessons cannot be moved. Unfix first.", timetable };
  }

  const validation = validatePlacement(timetable, found.card, targetClassId, targetDay, targetPeriod, {
    ignoreCardId: cardId,
  });

  if (!validation.ok) {
    return { ok: false, message: validation.message, timetable };
  }

  const targetKey = makeSlotKey(targetClassId, targetDay, targetPeriod);
  const displaced = normalizeCard(timetable.cells?.[targetKey]);

  if (displaced && displaced.id !== cardId) {
    if (displaced.fixed) {
      return {
        ok: false,
        message: "Target cell has a fixed lesson. Unfix it or choose another cell.",
        timetable,
      };
    }
  }

  const next = cloneTimetable(timetable);
  removeCardFromLocation(next, cardId);

  if (displaced && displaced.id !== cardId) {
    delete next.cells[targetKey];
    const { day: _d, period: _p, ...rest } = displaced;
    next.tray.push({ ...rest, fixed: displaced.fixed });
  }

  const cls = getClassById(next, targetClassId);
  next.cells[targetKey] = {
    ...found.card,
    classId: targetClassId,
    classLabel: cls?.label || found.card.classLabel,
    day: targetDay,
    period: targetPeriod,
    fixed: found.card.fixed,
  };

  return { ok: true, message: "", timetable: next };
}

/**
 * Move every class's card for a shared multi-class lesson together, to the
 * same new day/period, each staying in its own class. Teacher-clash checks
 * ignore the group's own sibling cards (same classes/teachers moving as one
 * unit is never a conflict with itself) — a real clash against a lesson
 * outside the group still blocks the move so the caller can offer the
 * Remove-collisions/Ignore choice via getPlacementConflicts.
 */
function moveGroupedCardToSlot(timetable, cardId, targetDay, targetPeriod) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }
  if (found.card.fixed) {
    return { ok: false, message: "Fixed lessons cannot be moved. Unfix first.", timetable };
  }

  const card = normalizeCard(found.card);
  const siblings = findGroupSiblingsAtSlot(timetable, card.groupId, found.day, found.period);
  if (!siblings.length) {
    return moveSingleCardToSlot(timetable, cardId, found.classId, targetDay, targetPeriod);
  }
  const siblingIds = new Set(siblings.map((s) => s.id));

  if (found.day === targetDay && found.period === targetPeriod) {
    return { ok: true, message: "", timetable };
  }

  // Validate every sibling's own slot — teacher availability, time-off, and
  // daily/consecutive limits — ignoring clashes against the group's own members.
  for (const sib of siblings) {
    const validation = validatePlacement(timetable, sib, sib.classId, targetDay, targetPeriod, {
      ignoreCardId: siblingIds,
    });
    if (!validation.ok) {
      return { ok: false, message: `${sib.classLabel}: ${validation.message}`, timetable };
    }

    const targetKey = makeSlotKey(sib.classId, targetDay, targetPeriod);
    const occupant = normalizeCard(timetable.cells?.[targetKey]);
    if (occupant && !siblingIds.has(occupant.id) && occupant.fixed) {
      return {
        ok: false,
        message: `${sib.classLabel}: target cell has a fixed lesson. Unfix it or choose another cell.`,
        timetable,
      };
    }
  }

  // All clear — apply the move for every sibling at once.
  const next = cloneTimetable(timetable);
  for (const sib of siblings) {
    delete next.cells[sib.slotKey];
    const targetKey = makeSlotKey(sib.classId, targetDay, targetPeriod);

    const displaced = normalizeCard(next.cells[targetKey]);
    if (displaced && !siblingIds.has(displaced.id)) {
      delete next.cells[targetKey];
      const { day: _d, period: _p, ...rest } = displaced;
      next.tray.push({ ...rest, fixed: displaced.fixed });
    }

    const { slotKey: _sk, ...sibRest } = sib;
    next.cells[targetKey] = { ...sibRest, day: targetDay, period: targetPeriod };
  }

  return { ok: true, message: "", timetable: next };
}

/**
 * Every card, across every class, that shares `groupId` and currently sits at
 * (day, period) — i.e. the full set of synchronized siblings for one weekly
 * occurrence of a multi-class lesson (same subject/teachers taught to several
 * classes at once). Moving one of them must move all of them together.
 */
function findGroupSiblingsAtSlot(timetable, groupId, day, period) {
  const siblings = [];
  for (const [slotKey, raw] of Object.entries(timetable?.cells || {})) {
    const card = normalizeCard(raw);
    if (!card || card.groupId !== groupId) continue;
    const parsed = parseSlotKey(slotKey);
    if (!parsed || parsed.day !== day || parsed.period !== period) continue;
    siblings.push({ ...card, classId: parsed.classId, day: parsed.day, period: parsed.period, slotKey });
  }
  return siblings;
}

/**
 * Every OTHER class's tray card for the same weekly occurrence of a shared
 * multi-class lesson — i.e. the group's remaining unplaced siblings, still
 * waiting in their own class's tray. Tray cards have no day/period to
 * correlate by (unlike grid siblings), so this matches on groupId +
 * instanceIndex instead. Cards saved before that field existed (instanceIndex
 * null) can't be reliably correlated and are left out.
 */
function findGroupSiblingsInTray(timetable, groupId, instanceIndex, excludeCardId) {
  if (groupId == null || instanceIndex == null) return [];
  return (timetable?.tray || [])
    .map((raw) => normalizeCard(raw))
    .filter(
      (card) =>
        card &&
        card.id !== excludeCardId &&
        card.groupId === groupId &&
        card.instanceIndex === instanceIndex
    );
}

/**
 * Cards (in any class) whose teachers clash with placing `cardId` at the
 * given day/period — used to offer "Remove collisions / Ignore" choices.
 *
 * For a multi-class (grouped) card, every sibling's own target slot is
 * checked, and the group's own sibling cards are never reported as a
 * conflict with each other — same classes, same teachers, so moving the
 * whole group together is never a collision with itself.
 */
export function getPlacementConflicts(timetable, cardId, targetDay, targetPeriod) {
  const found = findCardById(timetable, cardId);
  const card = found.card ? normalizeCard(found.card) : null;
  if (!card) return [];

  if (card.groupId && (found.location === "grid" || found.location === "tray")) {
    const siblings =
      found.location === "grid"
        ? findGroupSiblingsAtSlot(timetable, card.groupId, found.day, found.period)
        : [card, ...findGroupSiblingsInTray(timetable, card.groupId, card.instanceIndex, cardId)];
    const siblingIds = new Set(siblings.map((s) => s.id));
    const occupancy = buildTeacherOccupancy(timetable, siblingIds);
    const seen = new Set();
    const conflicts = [];
    for (const sib of siblings) {
      for (const teacher of sib.teachers) {
        const existing = occupancy.get(teacherBusyKey(teacher, targetDay, targetPeriod));
        if (existing && !seen.has(existing.cardId)) {
          seen.add(existing.cardId);
          conflicts.push({ ...existing, day: targetDay, period: targetPeriod });
        }
      }
    }
    return conflicts;
  }

  const occupancy = buildTeacherOccupancy(timetable, cardId);
  const seen = new Set();
  const conflicts = [];
  for (const teacher of card.teachers) {
    const existing = occupancy.get(teacherBusyKey(teacher, targetDay, targetPeriod));
    if (existing && !seen.has(existing.cardId)) {
      seen.add(existing.cardId);
      conflicts.push({ ...existing, day: targetDay, period: targetPeriod });
    }
  }
  return conflicts;
}

/**
 * Place the card at the slot bypassing teacher-clash validation.
 * `removeConflictIds`: clashing cards to move to the tray first ("Remove
 * collisions and place"); pass [] to leave them where they are ("Ignore
 * conflicts and place"). Fixed cards are still protected.
 *
 * A multi-class (grouped) card is delegated to forceMoveGroupedCardToSlot so
 * every class in the group moves together.
 */
export function forceMoveCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod, removeConflictIds = []) {
  const found = findCardById(timetable, cardId);
  if (found.card?.groupId && found.location === "grid") {
    return forceMoveGroupedCardToSlot(timetable, cardId, targetDay, targetPeriod, removeConflictIds);
  }
  if (found.card?.groupId && found.location === "tray") {
    return forceMoveGroupedTrayCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod, removeConflictIds);
  }
  return forceMoveSingleCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod, removeConflictIds);
}

/** Same as moveGroupedTrayCardToSlot, but bumps removeConflictIds first ("Remove collisions"). */
function forceMoveGroupedTrayCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod, removeConflictIds = []) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }

  const dragged = normalizeCard(found.card);
  const traySiblings = findGroupSiblingsInTray(timetable, dragged.groupId, dragged.instanceIndex, cardId);
  const group = [{ ...dragged, classId: targetClassId }, ...traySiblings];

  for (const member of group) {
    const targetKey = makeSlotKey(member.classId, targetDay, targetPeriod);
    const displaced = normalizeCard(timetable.cells?.[targetKey]);
    if (displaced && displaced.fixed) {
      return {
        ok: false,
        message: `${member.classLabel}: target cell has a fixed lesson. Unfix it or choose another cell.`,
        timetable,
      };
    }
  }

  const next = cloneTimetable(timetable);

  for (const conflictId of removeConflictIds) {
    if (!conflictId) continue;
    for (const key of Object.keys(next.cells)) {
      const cell = next.cells[key];
      if (cell?.id !== conflictId) continue;
      const c = normalizeCard(cell);
      delete next.cells[key];
      if (c && !c.fixed) {
        const { day: _d, period: _p, ...rest } = c;
        next.tray.push({ ...rest, fixed: c.fixed });
      } else if (c?.fixed) {
        next.cells[key] = cell;
      }
      break;
    }
  }

  for (const member of group) {
    removeCardFromLocation(next, member.id);
    const targetKey = makeSlotKey(member.classId, targetDay, targetPeriod);
    const displaced = normalizeCard(next.cells[targetKey]);
    if (displaced) {
      delete next.cells[targetKey];
      const { day: _d, period: _p, ...rest } = displaced;
      next.tray.push({ ...rest, fixed: displaced.fixed });
    }
    const { day: _d2, period: _p2, ...memberRest } = member;
    next.cells[targetKey] = { ...memberRest, day: targetDay, period: targetPeriod };
  }

  return { ok: true, message: "", timetable: next };
}

function forceMoveSingleCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod, removeConflictIds = []) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }
  if (found.card.fixed) {
    return { ok: false, message: "Fixed lessons cannot be moved. Unfix first.", timetable };
  }

  const targetKey = makeSlotKey(targetClassId, targetDay, targetPeriod);
  const displaced = normalizeCard(timetable.cells?.[targetKey]);
  if (displaced && displaced.id !== cardId && displaced.fixed) {
    return { ok: false, message: "Target cell has a fixed lesson. Unfix it or choose another cell.", timetable };
  }

  const next = cloneTimetable(timetable);

  // Move the clashing cards (usually in other classes) to the tray.
  for (const conflictId of removeConflictIds) {
    if (!conflictId || conflictId === cardId) continue;
    for (const key of Object.keys(next.cells)) {
      const cell = next.cells[key];
      if (cell?.id !== conflictId) continue;
      const c = normalizeCard(cell);
      delete next.cells[key];
      if (c && !c.fixed) {
        const { day: _d, period: _p, ...rest } = c;
        next.tray.push({ ...rest, fixed: c.fixed });
      } else if (c?.fixed) {
        // Never silently drop a fixed lesson — leave it in place.
        next.cells[key] = cell;
      }
      break;
    }
  }

  removeCardFromLocation(next, cardId);

  const displacedNow = normalizeCard(next.cells?.[targetKey]);
  if (displacedNow && displacedNow.id !== cardId) {
    delete next.cells[targetKey];
    const { day: _d, period: _p, ...rest } = displacedNow;
    next.tray.push({ ...rest, fixed: displacedNow.fixed });
  }

  const cls = getClassById(next, targetClassId);
  next.cells[targetKey] = {
    ...found.card,
    classId: targetClassId,
    classLabel: cls?.label || found.card.classLabel,
    day: targetDay,
    period: targetPeriod,
    fixed: found.card.fixed,
  };

  return { ok: true, message: "", timetable: next };
}

/**
 * Same as forceMoveSingleCardToSlot, but for a multi-class lesson: every
 * sibling (one per class in the group) moves to the same new day/period in
 * its own class, atomically. `removeConflictIds` are bumped to their class's
 * tray first; fixed cards block the whole move (never partially fragmented).
 */
function forceMoveGroupedCardToSlot(timetable, cardId, targetDay, targetPeriod, removeConflictIds = []) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }
  if (found.card.fixed) {
    return { ok: false, message: "Fixed lessons cannot be moved. Unfix first.", timetable };
  }

  const card = normalizeCard(found.card);
  const siblings = findGroupSiblingsAtSlot(timetable, card.groupId, found.day, found.period);
  const siblingIds = new Set(siblings.map((s) => s.id));

  for (const sib of siblings) {
    const targetKey = makeSlotKey(sib.classId, targetDay, targetPeriod);
    const displaced = normalizeCard(timetable.cells?.[targetKey]);
    if (displaced && !siblingIds.has(displaced.id) && displaced.fixed) {
      return {
        ok: false,
        message: `${sib.classLabel}: target cell has a fixed lesson. Unfix it or choose another cell.`,
        timetable,
      };
    }
  }

  const next = cloneTimetable(timetable);

  // Move the identified clashing cards (in other classes) to their tray.
  for (const conflictId of removeConflictIds) {
    if (!conflictId || siblingIds.has(conflictId)) continue;
    for (const key of Object.keys(next.cells)) {
      const cell = next.cells[key];
      if (cell?.id !== conflictId) continue;
      const c = normalizeCard(cell);
      delete next.cells[key];
      if (c && !c.fixed) {
        const { day: _d, period: _p, ...rest } = c;
        next.tray.push({ ...rest, fixed: c.fixed });
      } else if (c?.fixed) {
        next.cells[key] = cell;
      }
      break;
    }
  }

  // Move every sibling to its own new slot (same day/period, own classId).
  for (const sib of siblings) {
    delete next.cells[sib.slotKey];
    const targetKey = makeSlotKey(sib.classId, targetDay, targetPeriod);
    const displacedNow = normalizeCard(next.cells[targetKey]);
    if (displacedNow && !siblingIds.has(displacedNow.id)) {
      delete next.cells[targetKey];
      const { day: _d, period: _p, ...rest } = displacedNow;
      next.tray.push({ ...rest, fixed: displacedNow.fixed });
    }
    const { slotKey: _sk, ...sibRest } = sib;
    next.cells[targetKey] = { ...sibRest, day: targetDay, period: targetPeriod };
  }

  return { ok: true, message: "", timetable: next };
}

/**
 * Send a card to the tray. A multi-class (grouped) card sends every class's
 * sibling card to the tray together — leaving some siblings on the grid and
 * only one in the tray would desynchronize the shared lesson.
 */
export function removeCardToTray(timetable, cardId) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }

  if (found.card.fixed) {
    return { ok: false, message: "Fixed lessons cannot be removed. Unfix first.", timetable };
  }

  if (found.location === "tray") {
    return { ok: true, message: "", timetable };
  }

  const card = normalizeCard(found.card);
  if (card.groupId) {
    const siblings = findGroupSiblingsAtSlot(timetable, card.groupId, found.day, found.period);
    const fixedSibling = siblings.find((s) => s.fixed);
    if (fixedSibling) {
      return {
        ok: false,
        message: `${fixedSibling.classLabel}: this lesson is fixed there. Unfix it in every class before removing the group.`,
        timetable,
      };
    }
    const next = cloneTimetable(timetable);
    for (const sib of siblings) {
      delete next.cells[sib.slotKey];
      const { day: _d, period: _p, slotKey: _sk, ...rest } = sib;
      next.tray.push(rest);
    }
    return { ok: true, message: "", timetable: next };
  }

  const next = cloneTimetable(timetable);
  removeCardFromLocation(next, cardId);
  const { day: _d, period: _p, ...rest } = found.card;
  next.tray.push(rest);

  return { ok: true, message: "", timetable: next };
}

export function toggleCardFixed(timetable, cardId) {
  const found = findCardById(timetable, cardId);
  if (!found.card) {
    return { ok: false, message: "Lesson card not found.", timetable };
  }

  const next = cloneTimetable(timetable);
  const fixed = !found.card.fixed;

  if (found.location === "grid" && found.slotKey) {
    next.cells[found.slotKey] = { ...found.card, fixed };
  } else if (found.trayIndex != null) {
    next.tray[found.trayIndex] = { ...found.card, fixed };
  }

  return { ok: true, message: "", timetable: next };
}

export function migrateTimetableFormat(raw) {
  if (!raw) return null;
  if (raw.version === 2 && raw.cells && raw.columns) {
    const periodsPerWeek =
      Number(raw.periodsPerWeek) > 0
        ? Number(raw.periodsPerWeek)
        : resolvePeriodsPerWeek(raw) ?? (raw.daysPerWeek || 0) * (raw.periodsPerDay || 0);
    return {
      ...raw,
      periodsPerWeek,
      frozen: Boolean(raw.frozen),
      frozenAt: raw.frozenAt || null,
      snapshot: raw.snapshot || null,
      cells: Object.fromEntries(
        Object.entries(raw.cells).map(([k, v]) => [k, normalizeCard(v)])
      ),
      tray: (raw.tray || []).map((c) => normalizeCard(c)).filter(Boolean),
    };
  }

  if (!Array.isArray(raw.classes) || !raw.daysPerWeek || !raw.periodsPerDay) {
    return null;
  }

  const daysPerWeek = raw.daysPerWeek;
  const periodsPerDay = raw.periodsPerDay;
  const dayLabels = raw.dayLabels || raw.dayNames || [];
  const periodLabels = raw.periodLabels || [];
  const columns = buildColumns(dayLabels, periodLabels, daysPerWeek, periodsPerDay);

  const classes = raw.classes.map((c) => ({
    id: c.id,
    label: c.label,
    title: c.title || c.label,
    grade: c.grade,
    section: c.section,
  }));

  const cells = {};

  for (const cls of raw.classes) {
    const grid = cls.grid;
    if (!grid) continue;
    for (let day = 0; day < daysPerWeek; day++) {
      for (let period = 0; period < periodsPerDay; period++) {
        const cell = grid[day]?.[period];
        if (!cell) continue;
        const key = makeSlotKey(cls.id, day, period);
        cells[key] = normalizeCard({
          id: createCardId(),
          classId: cls.id,
          classLabel: cls.label,
          subject: cell.subject,
          teachers: cell.teachers || [],
          fixed: false,
          day,
          period,
        });
      }
    }
  }

  const tray = (raw.unassigned || []).map((u) => {
    const cls = classes.find((c) => c.label === u.classLabel);
    return normalizeCard({
      id: createCardId(),
      classId: cls?.id || "",
      classLabel: u.classLabel,
      subject: u.subject,
      teachers: u.teachers || [],
      fixed: false,
    });
  });

  return {
    version: 2,
    generatedAt: raw.generatedAt,
    schoolName: raw.schoolName || "",
    academicYear: raw.academicYear || "",
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek:
      Number(raw.periodsPerWeek) > 0
        ? Number(raw.periodsPerWeek)
        : resolvePeriodsPerWeek(raw) ?? daysPerWeek * periodsPerDay,
    dayLabels,
    dayNames: raw.dayNames || dayLabels,
    periodLabels,
    columns,
    classes,
    cells,
    tray,
    unassigned: raw.unassigned || [],
    relaxations: raw.relaxations || {},
    stats: raw.stats || {},
    constraints: raw.constraints || {},
  };
}

export function buildInteractiveTimetableFromGeneration({
  school,
  classes,
  classGrids,
  daysPerWeek,
  periodsPerDay,
  periodsPerWeek,
  dayNames,
  dayLabels,
  periodLabels,
  unassigned,
  relaxations,
  stats,
  constraints,
}) {
  const columns = buildColumns(dayLabels, periodLabels, daysPerWeek, periodsPerDay);
  const classRows = classes.map((cls) => ({
    id: cls.id,
    label: cls.label,
    title: cls.title || cls.label,
    grade: cls.grade,
    section: cls.section,
  }));

  const cells = {};
  const grid = classGrids || {};

  for (const cls of classRows) {
    const classGrid = grid[cls.id];
    if (!classGrid) continue;
    for (let day = 0; day < daysPerWeek; day++) {
      for (let period = 0; period < periodsPerDay; period++) {
        const slot = classGrid[day]?.[period];
        if (!slot) continue;
        cells[makeSlotKey(cls.id, day, period)] = normalizeCard({
          id: createCardId(),
          classId: cls.id,
          classLabel: cls.label,
          subject: slot.subject,
          teachers: slot.teachers || [],
          fixed: false,
          day,
          period,
          lessonId: slot.lessonId,
          groupId: slot.groupId || null,
          instanceIndex: slot.instanceIndex,
        });
      }
    }
  }

  const tray = (unassigned || [])
    .map((u) => {
      const cls = classRows.find((c) => c.label === u.classLabel);
      if (!cls) return null;
      return normalizeCard({
        id: createCardId(),
        classId: cls.id,
        classLabel: u.classLabel,
        subject: u.subject,
        teachers: u.teachers || [],
        fixed: false,
        lessonId: u.lessonId || null,
        groupId: u.groupId || null,
        instanceIndex: u.instanceIndex,
      });
    })
    .filter(Boolean);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    frozen: false,
    schoolName: school?.schoolName || "",
    academicYear: school?.academicYear || "",
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek: periodsPerWeek ?? daysPerWeek * periodsPerDay,
    dayNames,
    dayLabels,
    periodLabels,
    columns,
    classes: classRows,
    cells,
    tray,
    unassigned: unassigned || [],
    relaxations: relaxations || {},
    stats: stats || {},
    constraints: constraints || {},
  };
}
