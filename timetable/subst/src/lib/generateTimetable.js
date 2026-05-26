import {
  SCHOOL_STORAGE_KEY,
  getClassLessons,
  loadClassLessonsMap,
  loadClassesList,
  loadSchoolConstraints,
  loadSubjects,
  loadTeachersFull,
  normalizeTimeOffGrid,
} from "./settingsStorage";
import { buildInteractiveTimetableFromGeneration } from "./timetableValidation";

const SCHOOL_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadSchoolRecord() {
  return readJson(SCHOOL_STORAGE_KEY, null);
}

function teacherBusyKey(teacher, day, period) {
  return `${teacher}|${day}|${period}`;
}

function createRelaxationLevels() {
  return [
    {
      id: "strict",
      label: "All constraints",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: false,
        ignoreMaxConsecutive: false,
        ignoreTimeOff: false,
      },
    },
    {
      id: "relaxConsecutive",
      label: "Consecutive class limit",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: false,
        ignoreMaxConsecutive: true,
        ignoreTimeOff: false,
      },
    },
    {
      id: "relaxMaxPerDay",
      label: "Maximum classes per day",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
        ignoreTimeOff: false,
      },
    },
    {
      id: "relaxClassTeacherFirst",
      label: "Class teacher first period",
      flags: {
        ignoreClassTeacherFirst: true,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
        ignoreTimeOff: false,
      },
    },
    {
      id: "relaxTimeOff",
      label: "Teacher time off",
      flags: {
        ignoreClassTeacherFirst: true,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
        ignoreTimeOff: true,
      },
    },
  ];
}

function emptyClassGrid(daysPerWeek, periodsPerDay) {
  return Array.from({ length: daysPerWeek }, () =>
    Array.from({ length: periodsPerDay }, () => null)
  );
}

function findClassTeacherForClass(teachers, cls) {
  const classLabel = cls.label;
  const classTitle = String(cls.title || "").trim() || classLabel;

  for (const t of teachers) {
    const stored = String(t.classTeacher || "").trim();
    if (!stored) continue;
    if (stored !== classTitle && stored !== classLabel) continue;
    const row =
      (t.lessons || []).find((l) => l.classLabel === classLabel) ||
      (t.lessons || []).find((l) => l.isClassTeacher);
    if (row) {
      return { teacherName: t.name, subject: row.subject };
    }
  }

  for (const t of teachers) {
    const row = (t.lessons || []).find((l) => l.isClassTeacher && l.classLabel === classLabel);
    if (row) {
      return { teacherName: t.name, subject: row.subject };
    }
  }
  return null;
}

function buildAllowedTeacherSet(teachers, classLessonsMap, classId, classLabel, subject) {
  const allowed = new Set();

  for (const t of teachers) {
    const match = (t.lessons || []).some(
      (l) => l.classLabel === classLabel && l.subject === subject
    );
    if (match) allowed.add(t.name);
  }

  const rows = Array.isArray(classLessonsMap[classId]) ? classLessonsMap[classId] : [];
  for (const row of rows) {
    if (row.subject !== subject) continue;
    const primary = String(row.primaryTeacher || "").trim();
    if (primary) allowed.add(primary);
    for (const extra of row.additionalTeachers || []) {
      const name = String(extra || "").trim();
      if (name) allowed.add(name);
    }
  }

  return allowed;
}

function getTeacherTimeOffGrid(teacher, daysPerWeek, periodsPerDay) {
  return normalizeTimeOffGrid(teacher.timeOffGrid, daysPerWeek, periodsPerDay, periodsPerDay);
}

function maxConsecutiveRun(periods) {
  if (!periods.length) return 0;
  const sorted = [...periods].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

function wouldExceedConsecutive(existingPeriods, newPeriod, limit) {
  const next = [...existingPeriods, newPeriod];
  return maxConsecutiveRun(next) > limit;
}

function createGeneratorState({ classes, daysPerWeek, periodsPerDay, teachers, constraints }) {
  const classGrids = {};
  for (const cls of classes) {
    classGrids[cls.id] = emptyClassGrid(daysPerWeek, periodsPerDay);
  }

  const teacherBusy = new Set();
  const teacherDayCount = {};
  const teacherDayPeriods = {};
  const teacherTimeOff = {};

  for (const t of teachers) {
    teacherTimeOff[t.name] = getTeacherTimeOffGrid(t, daysPerWeek, periodsPerDay);
    teacherDayCount[t.name] = Array(daysPerWeek).fill(0);
    teacherDayPeriods[t.name] = Array.from({ length: daysPerWeek }, () => []);
  }

  const maxPerDay =
    constraints.maxClassesPerDay === "" ? null : Number(constraints.maxClassesPerDay);
  const maxConsecutive =
    constraints.maxConsecutiveClassesPerDay === ""
      ? null
      : Number(constraints.maxConsecutiveClassesPerDay);

  return {
    classGrids,
    teacherBusy,
    teacherDayCount,
    teacherDayPeriods,
    teacherTimeOff,
    maxPerDay: Number.isFinite(maxPerDay) && maxPerDay > 0 ? maxPerDay : null,
    maxConsecutive: Number.isFinite(maxConsecutive) && maxConsecutive > 0 ? maxConsecutive : null,
    schoolClassTeacherFirstPeriod: Boolean(constraints.classTeacherFirstPeriod),
    relaxationsUsed: {
      classTeacherFirstPeriod: 0,
      maxClassesPerDay: 0,
      maxConsecutiveClassesPerDay: 0,
      teacherTimeOff: 0,
    },
  };
}

function areTeachersFree(task, day, period, state) {
  for (const name of task.teachers) {
    if (state.teacherBusy.has(teacherBusyKey(name, day, period))) return false;
  }
  return true;
}

function isTeacherAvailable(name, day, period, state, flags) {
  if (flags.ignoreTimeOff) return true;
  const grid = state.teacherTimeOff[name];
  if (!grid) return true;
  return Boolean(grid[day]?.[period]);
}

function passesDailyLimit(name, day, state, flags) {
  if (flags.ignoreMaxPerDay || state.maxPerDay == null) return true;
  return (state.teacherDayCount[name]?.[day] ?? 0) < state.maxPerDay;
}

function passesConsecutiveLimit(name, day, period, state, flags) {
  if (flags.ignoreMaxConsecutive || state.maxConsecutive == null) return true;
  const existing = state.teacherDayPeriods[name]?.[day] ?? [];
  return !wouldExceedConsecutive(existing, period, state.maxConsecutive);
}

function canPlace(task, day, period, state, flags) {
  if (!areTeachersFree(task, day, period, state)) return false;

  for (const name of task.teachers) {
    if (!isTeacherAvailable(name, day, period, state, flags)) return false;
    if (!passesDailyLimit(name, day, state, flags)) return false;
    if (!passesConsecutiveLimit(name, day, period, state, flags)) return false;
  }

  const grid = state.classGrids[task.classId];
  if (grid[day][period]) return false;

  return true;
}

function recordRelaxation(levelId, state) {
  if (levelId === "relaxConsecutive") state.relaxationsUsed.maxConsecutiveClassesPerDay += 1;
  if (levelId === "relaxMaxPerDay") state.relaxationsUsed.maxClassesPerDay += 1;
  if (levelId === "relaxClassTeacherFirst") state.relaxationsUsed.classTeacherFirstPeriod += 1;
  if (levelId === "relaxTimeOff") state.relaxationsUsed.teacherTimeOff += 1;
}

function placeLesson(task, day, period, state, levelId) {
  const cell = {
    subject: task.subject,
    teachers: [...task.teachers],
    lessonId: task.lessonId,
  };

  state.classGrids[task.classId][day][period] = cell;

  for (const name of task.teachers) {
    state.teacherBusy.add(teacherBusyKey(name, day, period));
    state.teacherDayCount[name][day] += 1;
    state.teacherDayPeriods[name][day].push(period);
  }

  if (levelId && levelId !== "strict") {
    recordRelaxation(levelId, state);
  }
}

function scoreSlot(task, day, period, state, daysPerWeek, periodsPerDay) {
  let score = period;
  const grid = state.classGrids[task.classId];

  let subjectOnDay = 0;
  for (let p = 0; p < periodsPerDay; p++) {
    if (grid[day][p]?.subject === task.subject) subjectOnDay++;
  }
  score += subjectOnDay * 12;

  if (period > 0 && grid[day][period - 1]?.subject === task.subject) score += 50;

  let subjectSlotsWeek = 0;
  for (let d = 0; d < daysPerWeek; d++) {
    for (let p = 0; p < periodsPerDay; p++) {
      if (grid[d][p]?.subject === task.subject) subjectSlotsWeek++;
    }
  }
  score += Math.floor(subjectSlotsWeek / daysPerWeek) * 6;

  for (const name of task.teachers) {
    score += (state.teacherDayCount[name]?.[day] ?? 0) * 4;
  }

  return score;
}

function findBestSlot(task, state, daysPerWeek, periodsPerDay, flags, levelId) {
  const candidates = [];

  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      if (!canPlace(task, day, period, state, flags)) continue;
      candidates.push({
        day,
        period,
        score: scoreSlot(task, day, period, state, daysPerWeek, periodsPerDay),
      });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => a.score - b.score || a.day - b.day || a.period - b.period);
  return { ...candidates[0], levelId };
}

function tryPlaceTask(task, state, daysPerWeek, periodsPerDay) {
  const levels = createRelaxationLevels();

  for (const level of levels) {
    const slot = findBestSlot(task, state, daysPerWeek, periodsPerDay, level.flags, level.id);
    if (slot) {
      placeLesson(task, slot.day, slot.period, state, slot.levelId);
      task.placed = true;
      return true;
    }
  }

  return false;
}

function buildAllSlots(daysPerWeek, periodsPerDay) {
  const slots = [];
  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      slots.push({ day, period });
    }
  }
  return slots;
}

function shuffleSlots(slots, seed) {
  const list = [...slots];
  let s = seed >>> 0;
  for (let i = list.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function taskPlacementSeed(task, round, attempt) {
  const key = `${task.classId}|${task.subject}|${task.instanceIndex ?? 0}|${task.lessonId ?? ""}`;
  let hash = round * 997 + attempt * 131;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Try every slot in shuffled order — helps place stubborn leftover lessons. */
function tryPlaceTaskShuffled(task, state, daysPerWeek, periodsPerDay, seed) {
  const levels = createRelaxationLevels();
  const shuffled = shuffleSlots(buildAllSlots(daysPerWeek, periodsPerDay), seed);

  for (const level of levels) {
    for (const { day, period } of shuffled) {
      if (!canPlace(task, day, period, state, level.flags)) continue;
      placeLesson(task, day, period, state, level.id === "strict" ? null : level.id);
      task.placed = true;
      return true;
    }
  }

  return false;
}

function countRelaxedPlacementOptions(task, state, daysPerWeek, periodsPerDay) {
  const relaxed = createRelaxationLevels().slice(-1)[0].flags;
  let n = 0;
  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      if (canPlace(task, day, period, state, relaxed)) n++;
    }
  }
  return n;
}

function sortUnplacedQueue(unplaced, state, daysPerWeek, periodsPerDay) {
  return [...unplaced].sort((a, b) => {
    const optsA = countRelaxedPlacementOptions(a, state, daysPerWeek, periodsPerDay);
    const optsB = countRelaxedPlacementOptions(b, state, daysPerWeek, periodsPerDay);
    if (optsA !== optsB) return optsA - optsB;
    const teacherDiff = b.teachers.length - a.teachers.length;
    if (teacherDiff !== 0) return teacherDiff;
    const labelCmp = a.classLabel.localeCompare(b.classLabel);
    if (labelCmp !== 0) return labelCmp;
    const subjCmp = a.subject.localeCompare(b.subject);
    if (subjCmp !== 0) return subjCmp;
    return (a.instanceIndex ?? 0) - (b.instanceIndex ?? 0);
  });
}

const PLACEMENT_RETRY_ROUNDS = 32;
const STAGNANT_ROUNDS_LIMIT = 4;

/**
 * Place lessons in repeated passes until nothing new fits or rounds exhaust.
 * Remaining instances are left for the tray.
 */
function placeAllWithRetryLoop(instances, state, classes, teachers, daysPerWeek, periodsPerDay, attempt) {
  placeClassTeacherFirstPeriods(instances, state, classes, teachers, daysPerWeek);

  let stagnantRounds = 0;

  for (let round = 0; round < PLACEMENT_RETRY_ROUNDS; round++) {
    const unplaced = instances.filter((t) => !t.placed);
    if (!unplaced.length) break;

    const useShuffle = round >= 1;
    const queue =
      round >= 2
        ? sortUnplacedQueue(unplaced, state, daysPerWeek, periodsPerDay)
        : sortInstancesForPlacement(instances, attempt + round);

    let placedThisRound = 0;

    for (const task of queue) {
      if (task.placed) continue;

      const placed = useShuffle
        ? tryPlaceTaskShuffled(
            task,
            state,
            daysPerWeek,
            periodsPerDay,
            taskPlacementSeed(task, round, attempt)
          )
        : tryPlaceTask(task, state, daysPerWeek, periodsPerDay);

      if (placed) placedThisRound++;
    }

    if (placedThisRound === 0) {
      stagnantRounds++;
      if (stagnantRounds >= STAGNANT_ROUNDS_LIMIT) break;
    } else {
      stagnantRounds = 0;
    }
  }
}

function buildLessonInstances(classes, classLessonsMap, teachers) {
  const instances = [];
  const teacherNames = new Set(teachers.map((t) => t.name));

  for (const cls of classes) {
    const rows = Array.isArray(classLessonsMap[cls.id]) ? classLessonsMap[cls.id] : [];
    for (const row of rows) {
      const primary = String(row.primaryTeacher || "").trim();
      const extras = Array.isArray(row.additionalTeachers)
        ? row.additionalTeachers.map((n) => String(n).trim()).filter(Boolean)
        : [];
      const subject = String(row.subject || "").trim();
      const count = Number(row.lessonsPerWeek) || 0;

      if (!primary || !subject || count < 1) continue;

      const teachersForLesson = [primary, ...extras.filter((n) => n !== primary)];

      const unknown = teachersForLesson.filter((n) => !teacherNames.has(n));
      if (unknown.length) {
        instances.push({
          invalid: true,
          classId: cls.id,
          classLabel: cls.label,
          subject,
          teachers: teachersForLesson,
          reason: `Unknown teacher(s): ${unknown.join(", ")}`,
        });
        continue;
      }

      const allowed = buildAllowedTeacherSet(teachers, classLessonsMap, cls.id, cls.label, subject);
      const notAllowed = teachersForLesson.filter((n) => !allowed.has(n));
      if (notAllowed.length) {
        instances.push({
          invalid: true,
          classId: cls.id,
          classLabel: cls.label,
          subject,
          teachers: teachersForLesson,
          reason: `Teacher(s) not assigned to ${cls.label} / ${subject}: ${notAllowed.join(", ")}`,
        });
        continue;
      }

      for (let i = 0; i < count; i++) {
        instances.push({
          invalid: false,
          placed: false,
          classId: cls.id,
          classLabel: cls.label,
          subject,
          teachers: teachersForLesson,
          lessonId: row.id || `${cls.id}-${subject}-${i}`,
          instanceIndex: i,
        });
      }
    }
  }

  return instances;
}

function findClassTeacherLessonIndex(instances, classId, classTeacher) {
  const { teacherName, subject } = classTeacher;

  let idx = instances.findIndex(
    (t) =>
      !t.invalid &&
      !t.placed &&
      t.classId === classId &&
      t.teachers.includes(teacherName) &&
      t.subject === subject
  );
  if (idx >= 0) return idx;

  idx = instances.findIndex(
    (t) => !t.invalid && !t.placed && t.classId === classId && t.teachers.includes(teacherName)
  );
  return idx;
}

/** Class teacher (from Teachers DB) is placed in period 1 every school day for their class. */
function placeClassTeacherFirstPeriods(instances, state, classes, teachers, daysPerWeek) {
  const levels = createRelaxationLevels();

  for (const cls of classes) {
    const ct = findClassTeacherForClass(teachers, cls);
    if (!ct) continue;

    for (let day = 0; day < daysPerWeek; day++) {
      if (state.classGrids[cls.id][day][0]) continue;

      const idx = findClassTeacherLessonIndex(instances, cls.id, ct);
      if (idx === -1) continue;

      const task = instances[idx];
      let placed = false;

      for (const level of levels) {
        if (canPlace(task, day, 0, state, level.flags)) {
          placeLesson(task, day, 0, state, level.id === "strict" ? null : level.id);
          task.placed = true;
          task.isClassTeacherSlot = true;
          placed = true;
          if (level.id !== "strict") {
            state.relaxationsUsed.classTeacherFirstPeriod += 1;
          }
          break;
        }
      }

      if (!placed && state.schoolClassTeacherFirstPeriod) {
        state.relaxationsUsed.classTeacherFirstPeriod += 1;
      }
    }
  }
}

function sortInstancesForPlacement(instances, attempt = 0) {
  const list = instances
    .filter((t) => !t.invalid && !t.placed)
    .sort((a, b) => {
      const teacherDiff = b.teachers.length - a.teachers.length;
      if (teacherDiff !== 0) return teacherDiff;
      return a.classLabel.localeCompare(b.classLabel) || a.subject.localeCompare(b.subject);
    });

  if (!list.length || attempt === 0) return list;

  const offset = attempt % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function scoreGenerationOutcome({ unassignedCount, relaxationsUsed, placedCount, totalInstances }) {
  const relaxTotal = Object.values(relaxationsUsed).reduce((sum, n) => sum + n, 0);
  const unplaced = totalInstances - placedCount;
  return unassignedCount * 100000 + relaxTotal * 100 + unplaced * 10;
}

function runOneGeneration(data, attempt = 0) {
  const {
    school,
    classes,
    teachers,
    classLessonsMap,
    daysPerWeek,
    periodsPerDay,
    dayNames,
    dayLabels,
    periodLabels,
    constraints,
  } = data;

  const allInstances = buildLessonInstances(classes, classLessonsMap, teachers);
  const invalidTasks = allInstances.filter((t) => t.invalid);
  const instances = allInstances.filter((t) => !t.invalid).map((t) => ({ ...t }));

  const state = createGeneratorState({
    classes,
    daysPerWeek,
    periodsPerDay,
    teachers,
    constraints,
  });

  placeAllWithRetryLoop(instances, state, classes, teachers, daysPerWeek, periodsPerDay, attempt);

  const unassigned = [];
  for (const task of instances) {
    if (!task.placed) {
      unassigned.push({
        classLabel: task.classLabel,
        subject: task.subject,
        teachers: task.teachers,
        reason: "No free slot found after retry passes — placed in lesson tray.",
      });
    }
  }

  for (const bad of invalidTasks) {
    unassigned.push({
      classLabel: bad.classLabel,
      subject: bad.subject,
      teachers: bad.teachers,
      reason: bad.reason,
    });
  }

  const totalSlots = classes.length * daysPerWeek * periodsPerDay;
  let filledSlots = 0;
  for (const cls of classes) {
    const grid = state.classGrids[cls.id];
    if (!grid) continue;
    for (const row of grid) {
      for (const cell of row) {
        if (cell) filledSlots++;
      }
    }
  }

  const placedCount = instances.filter((t) => t.placed).length;

  const stats = {
    totalLessonInstances: instances.length,
    placedInstances: placedCount,
    unassignedCount: unassigned.length,
    filledSlots,
    totalSlots,
  };

  const timetable = buildInteractiveTimetableFromGeneration({
    school,
    classes,
    classGrids: state.classGrids,
    daysPerWeek,
    periodsPerDay,
    dayNames,
    dayLabels,
    periodLabels,
    unassigned,
    relaxations: state.relaxationsUsed,
    stats,
    constraints,
  });

  const outcomeScore = scoreGenerationOutcome({
    unassignedCount: unassigned.length,
    relaxationsUsed: state.relaxationsUsed,
    placedCount,
    totalInstances: instances.length,
  });

  return {
    timetable,
    success: unassigned.length === 0,
    outcomeScore,
    stats,
  };
}

export function validateTimetableInputs() {
  const errors = [];
  const warnings = [];

  const school = loadSchoolRecord();
  if (!school) {
    errors.push("School settings are missing. Save them under General Setting → School settings.");
    return { ok: false, errors, warnings, data: null };
  }

  const daysPerWeek = Number(school.daysPerWeek);
  const periodsPerDay = Number(school.periodsPerDay);
  const periodsPerWeek = Number(school.periodsPerWeek);

  if (!Number.isFinite(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
    errors.push("Set a valid number of days per week (1–7) in School settings.");
  }
  if (!Number.isFinite(periodsPerDay) || periodsPerDay < 1) {
    errors.push("Set a valid number of periods per day in School settings.");
  }
  if (!Number.isFinite(periodsPerWeek) || periodsPerWeek < 1) {
    errors.push("Set a valid number of periods per week in School settings.");
  }

  const classes = loadClassesList().filter((c) => c.label);
  if (!classes.length) {
    errors.push("No classes found. Add classes under General Setting → Classes and save.");
  }

  const subjects = loadSubjects();
  if (!subjects.length) {
    errors.push("No subjects found. Add subjects under General Setting → Subjects and save.");
  }

  const teachers = loadTeachersFull().filter((t) => t.name);
  if (!teachers.length) {
    errors.push("No teachers found. Add teachers under General Setting → Teachers and save.");
  }

  const classLessonsMap = loadClassLessonsMap();
  let classesWithLessons = 0;
  for (const cls of classes) {
    const rows = getClassLessons(cls.id);
    if (rows.length) classesWithLessons++;
  }

  if (classes.length && classesWithLessons === 0) {
    errors.push(
      "No class lessons configured. Open each class → Lessons and save subject/teacher assignments."
    );
  }

  if (errors.length) {
    return { ok: false, errors, warnings, data: null };
  }

  const slotsPerClass = daysPerWeek * periodsPerDay;
  for (const cls of classes) {
    const rows = getClassLessons(cls.id);
    const total = rows.reduce((sum, r) => sum + (Number(r.lessonsPerWeek) || 0), 0);
    if (!rows.length) {
      warnings.push(`Class ${cls.label}: no lessons configured.`);
    } else if (total > slotsPerClass) {
      warnings.push(
        `Class ${cls.label}: ${total} lessons/week exceeds grid capacity (${slotsPerClass} slots). Some periods cannot be placed.`
      );
    } else if (total > periodsPerWeek) {
      warnings.push(
        `Class ${cls.label}: ${total} lessons/week exceeds school limit of ${periodsPerWeek} periods per week.`
      );
    }
  }

  const periodRows = Array.isArray(school.periods) ? school.periods : [];
  const periodLabels = Array.from({ length: periodsPerDay }, (_, i) => {
    const lessonPeriods = periodRows.filter((p) => p.type !== "break");
    return lessonPeriods[i]?.name?.trim() || periodRows[i]?.name?.trim() || `P${i + 1}`;
  });

  const dayNames = Array.from(
    { length: daysPerWeek },
    (_, i) => SCHOOL_DAY_NAMES[i] || `Day ${i + 1}`
  );
  const dayLabels = Array.from(
    { length: daysPerWeek },
    (_, i) => SHORT_DAY_NAMES[i] || `D${i + 1}`
  );

  return {
    ok: true,
    errors,
    warnings,
    data: {
      school,
      classes,
      subjects,
      teachers,
      classLessonsMap,
      daysPerWeek,
      periodsPerDay,
      periodsPerWeek,
      dayNames,
      dayLabels,
      periodLabels,
      constraints: loadSchoolConstraints(),
      slotsPerClass,
    },
  };
}

const GENERATION_ATTEMPTS = 8;

export function generateTimetable() {
  const validation = validateTimetableInputs();
  if (!validation.ok) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
      timetable: null,
    };
  }

  let best = null;

  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    const result = runOneGeneration(validation.data, attempt);
    if (!best || result.outcomeScore < best.outcomeScore) {
      best = result;
    }
  }

  return {
    success: best.success,
    errors: [],
    warnings: validation.warnings,
    timetable: best.timetable,
  };
}
