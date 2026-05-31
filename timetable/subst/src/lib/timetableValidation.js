import { getSnapshotTeachers } from "./timetableSnapshot";
import {
  getClassLessons,
  loadClassLessonsMap,
  loadSchoolPeriodsPerWeek,
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
  const occupancy = new Map();

  const register = (card, classId, day, period) => {
    if (!card || card.id === ignoreCardId) return;
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

export function moveCardToSlot(timetable, cardId, targetClassId, targetDay, targetPeriod) {
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
