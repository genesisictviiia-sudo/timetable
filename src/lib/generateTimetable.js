import {
  getClassLessons,
  loadClassLessonsMap,
  loadClassesList,
  loadSchoolConstraints,
  loadSchoolStorageRaw,
  loadSubjects,
  loadTeachersFull,
  normalizeTimeOffGrid,
} from "./settingsStorage";
import { buildInteractiveTimetableFromGeneration } from "./timetableValidation";

const SCHOOL_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT_DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function loadSchoolRecord() {
  return loadSchoolStorageRaw();
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
        ignoreSameSubjectSameDay: false,
      },
    },
    {
      id: "relaxConsecutive",
      label: "Consecutive class limit",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: false,
        ignoreMaxConsecutive: true,
        ignoreSameSubjectSameDay: false,
      },
    },
    {
      id: "relaxMaxPerDay",
      label: "Maximum classes per day",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
        ignoreSameSubjectSameDay: false,
      },
    },
    {
      id: "relaxSameSubjectSameDay",
      label: "Same subject twice in a day",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
        ignoreSameSubjectSameDay: true,
      },
    },
    {
      id: "relaxClassTeacherFirst",
      label: "Class teacher first period",
      flags: {
        ignoreClassTeacherFirst: true,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
        ignoreSameSubjectSameDay: true,
      },
    },
  ];
}

/** True if (classId, subject) already has a lesson placed on this day. */
function subjectAlreadyOnDay(classId, subject, day, state) {
  const row = state.classGrids[classId]?.[day];
  if (!row) return false;
  return row.some((cell) => cell && cell.subject === subject);
}

/** True once every school day already has at least one lesson of this subject. */
function subjectCoversAllDays(classId, subject, state) {
  for (let d = 0; d < state.daysPerWeek; d++) {
    if (!subjectAlreadyOnDay(classId, subject, d, state)) return false;
  }
  return true;
}

function emptyClassGrid(daysPerWeek, periodsPerDay) {
  return Array.from({ length: daysPerWeek }, () =>
    Array.from({ length: periodsPerDay }, () => null)
  );
}

function findClassTeacherForClass(teachers, cls, classLessonsMap) {
  // 1. Source of truth: the class's own lesson rows (Class → Lessons), where
  // the row's isClassTeacher flag is set directly against this class — not
  // derived secondhand from a teacher record that may be stale.
  const rows = Array.isArray(classLessonsMap?.[cls.id]) ? classLessonsMap[cls.id] : [];
  const ctRow = rows.find((l) => l.isClassTeacher);
  if (ctRow) {
    const teacherName = String(ctRow.primaryTeacher || "").trim();
    const subject = String(ctRow.subject || "").trim();
    if (teacherName && subject) return { teacherName, subject, groupId: ctRow.groupId || null };
  }

  // 2. Fallback: teacher records, for data saved before the class-lesson flag existed.
  const classLabel = cls.label;
  const classTitle = String(cls.title || "").trim() || classLabel;
  const lessonCoversClass = (l) =>
    l.classLabel === classLabel || (Array.isArray(l.additionalClasses) && l.additionalClasses.includes(classLabel));

  for (const t of teachers) {
    const stored = String(t.classTeacher || "").trim();
    if (!stored) continue;
    if (stored !== classTitle && stored !== classLabel) continue;
    const row =
      (t.lessons || []).find((l) => lessonCoversClass(l) && l.isClassTeacher) ||
      (t.lessons || []).find((l) => l.isClassTeacher) ||
      (t.lessons || []).find((l) => lessonCoversClass(l));
    if (row) {
      return { teacherName: t.name, subject: row.subject };
    }
  }

  for (const t of teachers) {
    const row = (t.lessons || []).find((l) => l.isClassTeacher && lessonCoversClass(l));
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
      (l) =>
        l.subject === subject &&
        (l.classLabel === classLabel || (Array.isArray(l.additionalClasses) && l.additionalClasses.includes(classLabel)))
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

function getTeacherTimeOffGrid(teacher, daysPerWeek, periodsPerDay, periodsPerWeek) {
  return normalizeTimeOffGrid(
    teacher.timeOffGrid,
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek
  );
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

function getSubjectTimeOffGrid(subjectName, subjects, daysPerWeek, periodsPerDay, periodsPerWeek) {
  const subject = subjects.find((s) => s.name === subjectName);
  return normalizeTimeOffGrid(
    subject?.timeOffGrid,
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek
  );
}

function createGeneratorState({
  classes,
  daysPerWeek,
  periodsPerDay,
  periodsPerWeek,
  teachers,
  subjects,
  constraints,
}) {
  const classGrids = {};
  for (const cls of classes) {
    classGrids[cls.id] = emptyClassGrid(daysPerWeek, periodsPerDay);
  }

  const teacherBusy = new Set();
  const teacherDayCount = {};
  const teacherDayPeriods = {};
  const teacherTimeOff = {};
  const subjectTimeOff = {};

  for (const s of subjects) {
    subjectTimeOff[s.name] = getSubjectTimeOffGrid(
      s.name,
      subjects,
      daysPerWeek,
      periodsPerDay,
      periodsPerWeek
    );
  }

  for (const t of teachers) {
    teacherTimeOff[t.name] = getTeacherTimeOffGrid(
      t,
      daysPerWeek,
      periodsPerDay,
      periodsPerWeek
    );
    teacherDayCount[t.name] = Array(daysPerWeek).fill(0);
    teacherDayPeriods[t.name] = Array.from({ length: daysPerWeek }, () => []);
  }

  const maxPerDay =
    constraints.maxClassesPerDay === "" ? null : Number(constraints.maxClassesPerDay);
  const maxConsecutive =
    constraints.maxConsecutiveClassesPerDay === ""
      ? null
      : Number(constraints.maxConsecutiveClassesPerDay);

  const totalGridSlots = daysPerWeek * periodsPerDay;
  // The default (unrestricted) time-off grid is already capped at the school's
  // periods-per-week limit, so an unrestricted subject/teacher only ever shows
  // that many available slots — never the full day×period grid. Compare against
  // this cap, not totalGridSlots, or every subject looks "restricted" whenever
  // periodsPerWeek is less than daysPerWeek * periodsPerDay (the common case).
  const ppwNum = Number(periodsPerWeek);
  const fullAvailability =
    Number.isFinite(ppwNum) && ppwNum > 0 ? Math.min(ppwNum, totalGridSlots) : totalGridSlots;
  const subjectAvailable = {};
  for (const s of subjects) {
    subjectAvailable[s.name] = countAvailableSlots(subjectTimeOff[s.name], daysPerWeek, periodsPerDay);
  }
  const teacherAvailable = {};
  for (const t of teachers) {
    teacherAvailable[t.name] = countAvailableSlots(teacherTimeOff[t.name], daysPerWeek, periodsPerDay);
  }

  return {
    classGrids,
    teacherBusy,
    teacherDayCount,
    teacherDayPeriods,
    teacherTimeOff,
    subjectTimeOff,
    teacherAvailable,
    subjectAvailable,
    totalGridSlots,
    fullAvailability,
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek,
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

function countAvailableSlots(grid, daysPerWeek, periodsPerDay) {
  if (!grid) return daysPerWeek * periodsPerDay;
  let n = 0;
  for (let d = 0; d < daysPerWeek; d++) {
    for (let p = 0; p < periodsPerDay; p++) {
      if (grid[d]?.[p]) n++;
    }
  }
  return n;
}

function lessonAvailabilityScore(task, state) {
  let minAvail = state.fullAvailability ?? state.totalGridSlots ?? Infinity;
  const sAvail = state.subjectAvailable?.[task.subject];
  if (sAvail != null) minAvail = Math.min(minAvail, sAvail);
  for (const name of task.teachers) {
    const tAvail = state.teacherAvailable?.[name];
    if (tAvail != null) minAvail = Math.min(minAvail, tAvail);
  }
  return minAvail;
}

function isSubjectRestricted(task, state) {
  const full = state.fullAvailability ?? state.totalGridSlots ?? Infinity;
  const sAvail = state.subjectAvailable?.[task.subject];
  return sAvail != null && sAvail < full;
}

function isTeacherRestricted(task, state) {
  const full = state.fullAvailability ?? state.totalGridSlots ?? Infinity;
  for (const name of task.teachers) {
    const tAvail = state.teacherAvailable?.[name];
    if (tAvail != null && tAvail < full) return true;
  }
  return false;
}

function areTeachersFree(task, day, period, state) {
  for (const name of task.teachers) {
    if (state.teacherBusy.has(teacherBusyKey(name, day, period))) return false;
  }
  return true;
}

/** True when the teacher is not marked unavailable for this day/period. */
function isTeacherAvailable(name, day, period, state) {
  const grid = state.teacherTimeOff[name];
  if (!grid) return true;
  return Boolean(grid[day]?.[period]);
}

/** True when the subject may be taught on this day/period (time-off grid ticked). */
function isSubjectAvailable(subject, day, period, state) {
  const grid =
    state.subjectTimeOff[subject] ??
    normalizeTimeOffGrid(null, state.daysPerWeek, state.periodsPerDay, state.periodsPerWeek);
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
  if (!flags.ignoreSubjectAvailability && !isSubjectAvailable(task.subject, day, period, state)) return false;

  // Each subject appears at most once per day for a class — unless its
  // lessons/week exceeds the number of school days, in which case repeats
  // are only allowed once EVERY day already has one occurrence (fill the
  // whole week first, then double up, rather than stacking early).
  if (!flags.ignoreSameSubjectSameDay && subjectAlreadyOnDay(task.classId, task.subject, day, state)) {
    if (!subjectCoversAllDays(task.classId, task.subject, state)) return false;
  }

  for (const name of task.teachers) {
    if (!flags.ignoreTeacherAvailability && !isTeacherAvailable(name, day, period, state)) return false;
    if (!passesDailyLimit(name, day, state, flags)) return false;
    if (!passesConsecutiveLimit(name, day, period, state, flags)) return false;
  }

  const grid = state.classGrids[task.classId];
  if (grid[day][period]) return false;

  return true;
}

/** True when every {task, day, period} placement in the list is individually legal. */
function canPlaceAll(placements, state, flags) {
  for (const { task, day, period } of placements) {
    if (!canPlace(task, day, period, state, flags)) return false;
  }
  return true;
}

function recordRelaxation(levelId, state) {
  if (levelId === "relaxConsecutive") state.relaxationsUsed.maxConsecutiveClassesPerDay += 1;
  if (levelId === "relaxMaxPerDay") state.relaxationsUsed.maxClassesPerDay += 1;
  if (levelId === "relaxClassTeacherFirst") state.relaxationsUsed.classTeacherFirstPeriod += 1;
}

function placeLesson(task, day, period, state, levelId) {
  const cell = {
    subject: task.subject,
    teachers: [...task.teachers],
    lessonId: task.lessonId,
    groupId: task.groupId || null,
    instanceIndex: task.instanceIndex,
  };

  state.classGrids[task.classId][day][period] = cell;

  for (const name of task.teachers) {
    state.teacherBusy.add(teacherBusyKey(name, day, period));
    state.teacherDayCount[name][day] += 1;
    state.teacherDayPeriods[name][day].push(period);
  }

  task.placed = true;
  task.placedDay = day;
  task.placedPeriod = period;

  if (levelId && levelId !== "strict") {
    recordRelaxation(levelId, state);
  }
}

/** Exact inverse of placeLesson — frees the slot and the teachers' bookkeeping. */
function removeLesson(task, state) {
  if (!task.placed) return;
  const { placedDay: day, placedPeriod: period } = task;

  state.classGrids[task.classId][day][period] = null;

  for (const name of task.teachers) {
    state.teacherBusy.delete(teacherBusyKey(name, day, period));
    state.teacherDayCount[name][day] -= 1;
    const periods = state.teacherDayPeriods[name][day];
    const idx = periods.indexOf(period);
    if (idx >= 0) periods.splice(idx, 1);
  }

  task.placed = false;
  task.placedDay = undefined;
  task.placedPeriod = undefined;
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
const POST_FIXED_PERIOD_RETRY_ROUNDS = 12;


function placeRemainingWithShuffle(instances, state, daysPerWeek, periodsPerDay, runSeed) {
  let stagnantRounds = 0;

  for (let round = 0; round < POST_FIXED_PERIOD_RETRY_ROUNDS; round++) {
    // Grouped lessons excluded — see the comment on the Phase 4 loop above;
    // individual placement here would desync a multi-class lesson's classes.
    const unplaced = instances.filter((t) => !t.invalid && !t.placed && !t.groupId);
    if (!unplaced.length) break;

    const queue = sortUnplacedQueue(unplaced, state, daysPerWeek, periodsPerDay);
    let placedThisRound = 0;

    for (const task of queue) {
      if (
        tryPlaceTaskRandom(
          task,
          state,
          daysPerWeek,
          periodsPerDay,
          taskPlacementSeed(task, round + 200, runSeed)
        )
      ) {
        placedThisRound++;
      }
    }

    if (placedThisRound === 0) {
      stagnantRounds++;
      if (stagnantRounds >= 3) break;
    } else {
      stagnantRounds = 0;
    }
  }
}

const GROUP_SWAP_TRIALS = 50;

/**
 * Every currently-placed card that stands in the way of `task` occupying
 * (day, period): the task's own class cell, if occupied, PLUS — for a
 * multi-teacher lesson this is the common real blocker — whoever already
 * holds any of the task's teachers at that exact slot, in ANY class (a
 * teacher clash is not limited to the group's own classes).
 */
function findBlockingCards(task, day, period, state, instances) {
  const blockers = new Map(); // keyed by the instance object itself (dedup)

  const classOccupant = instances.find(
    (t) => t.placed && t.classId === task.classId && t.placedDay === day && t.placedPeriod === period
  );
  if (classOccupant) blockers.set(classOccupant, classOccupant);

  for (const teacherName of task.teachers) {
    if (!state.teacherBusy.has(teacherBusyKey(teacherName, day, period))) continue;
    const blocker = instances.find(
      (t) => t.placed && t.placedDay === day && t.placedPeriod === period && t.teachers.includes(teacherName)
    );
    if (blocker) blockers.set(blocker, blocker);
  }

  return [...blockers.values()];
}

/**
 * One attempt to fit `group` (every class's task for one weekly occurrence of
 * a multi-class lesson) into `day`/`period` at relaxation `level`. Collects
 * every blocking card across every task in the group — including a teacher
 * who is busy in a completely unrelated class, the actual common blocker for
 * a lesson shared by many teachers — removes them all at once, then verifies
 * every task in the group now legally fits. Restores everything and returns
 * null if not.
 *
 * A fixed lesson, another group's lesson, or any lesson with its own
 * subject/teacher time-off restriction is NEVER displaced — restricted
 * lessons are permanent once placed, with no last-resort exception.
 */
function tryGroupSwapPlan(group, instances, state, day, period, level) {
  const blockers = new Map();

  for (const task of group) {
    if (canPlace(task, day, period, state, level.flags)) continue;
    for (const blocker of findBlockingCards(task, day, period, state, instances)) {
      if (blocker.groupId || blocker.fixed) return null;
      if (isSubjectRestricted(blocker, state) || isTeacherRestricted(blocker, state)) return null;
      blockers.set(blocker, blocker);
    }
  }

  // Capture each blocker's original slot BEFORE removing — removeLesson
  // clears placedDay/placedPeriod, so they must be saved to restore correctly.
  const blockerList = [...blockers.values()].map((b) => ({
    task: b,
    origDay: b.placedDay,
    origPeriod: b.placedPeriod,
  }));
  for (const { task: blocker } of blockerList) removeLesson(blocker, state);

  const fits = group.every((task) => canPlace(task, day, period, state, level.flags));
  if (!fits) {
    // Restore everything exactly as it was — this slot doesn't work.
    for (const { task: blocker, origDay, origPeriod } of blockerList) {
      placeLesson(blocker, origDay, origPeriod, state, null);
    }
    return null;
  }

  return blockerList.map((b) => b.task);
}

function applyGroupSwapPlan(group, day, period, state, levelId) {
  // Blockers are already removed from the grid by tryGroupSwapPlan's
  // feasibility check — just place the group's lessons into the freed slot.
  for (const task of group) {
    placeLesson(task, day, period, state, levelId);
  }
}

/**
 * Tray-clearing rescue for multi-class (grouped) lessons. A group occurrence
 * needs the SAME day/period to be legal in every one of its classes at once,
 * so for each slot tried, every class is checked: free already, or occupied
 * by a plain, unprotected lesson that can be bumped out to make room. The
 * whole plan is applied only if every class in the group can be
 * accommodated — never partially, which would desync the group.
 *
 * Never displaces a fixed lesson, another group's lesson, or — with no
 * exception, including as a last resort — any lesson with its own
 * subject/teacher time-off restriction. Restricted lessons are permanent
 * once placed.
 */
function resolveGroupedTrayBySwapping(instances, state, daysPerWeek, periodsPerDay, runSeed) {
  const levels = createRelaxationLevels();

  const occurrences = new Map();
  for (const task of instances) {
    if (task.invalid || task.placed || !task.groupId) continue;
    const key = `${task.groupId}|${task.instanceIndex}`;
    if (!occurrences.has(key)) occurrences.set(key, []);
    occurrences.get(key).push(task);
  }

  for (const group of occurrences.values()) {
    if (group.length < 2 || group.some((t) => t.placed)) continue;

    const slots = shuffleSlots(buildAllSlots(daysPerWeek, periodsPerDay), taskPlacementSeed(group[0], 500, runSeed));
    let placed = false;

    for (let trial = 0; trial < GROUP_SWAP_TRIALS && !placed; trial++) {
      const { day, period } = slots[trial % slots.length];

      for (const level of levels) {
        // tryGroupSwapPlan already removed every blocking card on success —
        // only the group's own lessons still need placing.
        const blockers = tryGroupSwapPlan(group, instances, state, day, period, level);
        if (!blockers) continue;
        applyGroupSwapPlan(group, day, period, state, level.id === "strict" ? null : level.id);
        placed = true;
        break;
      }
    }
    // Still stuck after exhausting every slot — a genuine scheduling
    // impossibility (e.g. the class is already at its weekly period capacity
    // with no room anywhere), left in the tray like any other.
  }
}

const SWAP_TRIALS_PER_CLASS = 60;
const SWAP_CHAIN_MAX_DEPTH = 3;

/**
 * Is `classId`'s (day, period) cell protected from being used as a chain
 * step's displacement target or landing spot? Only the class-teacher's
 * period-1 slot is protected here (fixed/grouped occupants are checked by
 * the caller, since that needs the occupant itself, not just the cell).
 */
function isProtectedSlot(period, state) {
  return period === 0 && state.schoolClassTeacherFirstPeriod;
}

/**
 * Depth-first search for a chain that gets `task` (and everything it
 * displaces along the way) onto the grid. At each step: try a direct empty
 * cell first (chain ends here); failing that, try displacing an occupant of
 * this class and recursively find THAT occupant a home too — e.g. "ENG
 * takes EVS's slot, EVS moves to the empty cell" is a depth-1 chain; longer
 * chains (ENG → EVS's slot, EVS → MAT's slot, MAT → empty cell) are tried up
 * to SWAP_CHAIN_MAX_DEPTH before giving up.
 *
 * The grid is mutated tentatively during the search (occupants removed while
 * exploring) and restored on any failed branch, so a partial/failed search
 * never leaves the timetable in an inconsistent state. On success, every
 * card in the chain is left in its NEW slot already placed — the caller
 * does not need to re-apply anything.
 *
 * `excludeCells` prevents a chain from reusing the same cell twice (which
 * would make no sense and could loop).
 */
function searchSwapChain(task, instances, classId, state, daysPerWeek, periodsPerDay, flags, depth, excludeCells) {
  // 1) A direct empty cell ends the chain successfully.
  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      const key = `${day}|${period}`;
      if (excludeCells.has(key)) continue;
      if (state.classGrids[classId][day][period]) continue;
      if (isProtectedSlot(period, state)) continue;
      if (canPlace(task, day, period, state, flags)) {
        // Relaxation accounting for the whole chain happens once in the
        // caller (resolveTrayBySwapping), keyed off which ladder level
        // succeeded — individual steps here are placed without their own
        // separate levelId to avoid double-counting.
        placeLesson(task, day, period, state, null);
        return [{ task, day, period }];
      }
    }
  }

  if (depth >= SWAP_CHAIN_MAX_DEPTH) return null;

  // 2) Try displacing an occupant and finding IT a home recursively.
  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      const key = `${day}|${period}`;
      if (excludeCells.has(key)) continue;
      if (isProtectedSlot(period, state)) continue;

      const cell = state.classGrids[classId][day][period];
      if (!cell) continue;

      const occupant = instances.find(
        (t) => t.placed && t.classId === classId && t.placedDay === day && t.placedPeriod === period
      );
      if (!occupant || occupant.groupId || occupant.fixed) continue;
      if (occupant.subject === task.subject && occupant.lessonId === task.lessonId) continue;
      if (isSubjectRestricted(occupant, state) || isTeacherRestricted(occupant, state)) continue;

      removeLesson(occupant, state);
      if (!canPlace(task, day, period, state, flags)) {
        placeLesson(occupant, day, period, state, null);
        continue;
      }

      const nextExclude = new Set(excludeCells);
      nextExclude.add(key);
      const subChain = searchSwapChain(
        occupant,
        instances,
        classId,
        state,
        daysPerWeek,
        periodsPerDay,
        flags,
        depth + 1,
        nextExclude
      );

      if (subChain) {
        placeLesson(task, day, period, state, null);
        return [{ task, day, period }, ...subChain];
      }

      // Dead end — put the occupant back exactly where it was and try the next cell.
      placeLesson(occupant, day, period, state, null);
    }
  }

  return null;
}

/**
 * Final tray-clearing pass. For each class with leftover (tray) cards, finds
 * a chain of swaps that lands the stuck card on the grid — a direct free
 * cell if one exists, or a short sequence like "this card takes an occupied
 * slot, and whatever it displaced moves into the slot that's actually free"
 * (and deeper chains, up to SWAP_CHAIN_MAX_DEPTH), rather than only ever
 * trying a single swap and hoping the displaced card finds its own way home
 * later. A chain is only ever committed once it's fully verified to resolve
 * every card involved — nothing is left half-displaced.
 *
 * A fixed lesson, the class-teacher's period-1 slot (while that rule is on),
 * another group's lesson, or any lesson with its own subject/teacher
 * time-off restriction is NEVER displaced — restricted lessons are
 * permanent once placed, with no last-resort exception. A card that can
 * only be freed by moving one of these stays in the tray.
 *
 * Multi-class (grouped) lessons are excluded — they must occupy one shared
 * slot across every class in the group, so single-class swaps would tear
 * the group apart (handled separately by resolveGroupedTrayBySwapping).
 */
function resolveTrayBySwapping(instances, state, daysPerWeek, periodsPerDay, runSeed) {
  const levels = createRelaxationLevels();
  const trayByClass = new Map();
  for (const task of instances) {
    if (task.invalid || task.placed || task.groupId) continue;
    if (!trayByClass.has(task.classId)) trayByClass.set(task.classId, []);
    trayByClass.get(task.classId).push(task);
  }

  for (const [classId, queue] of trayByClass) {
    let trials = 0;

    while (queue.length && trials < SWAP_TRIALS_PER_CLASS) {
      const task = queue.shift();
      trials++;
      if (task.placed) continue;

      for (const level of levels) {
        const chain = searchSwapChain(task, instances, classId, state, daysPerWeek, periodsPerDay, level.flags, 0, new Set());
        if (chain) {
          if (level.id !== "strict") recordRelaxation(level.id, state);
          break;
        }
      }
      // If not resolved, the card stays in the tray and the loop moves on —
      // a genuine scheduling impossibility within the trial budget.
    }
  }
}

/**
 * Lessons whose subject has restricted time-off slots — place those first
 * (tightest restriction wins) so the few legal slots aren't filled by
 * unrestricted lessons.
 */
function placeRestrictedSubjectsFirst(instances, state, daysPerWeek, periodsPerDay, runSeed) {
  // Multi-class lessons (task.groupId) must stay out of individual placement —
  // placeGroupedMultiClassLessons is the only phase allowed to seat them, since
  // it places every class in the group into one shared slot atomically. Letting
  // this phase grab just one class's copy (e.g. because a teacher on the team
  // has restricted time-off) would strand the rest of the group in the tray.
  const targets = instances
    .filter((t) => !t.placed && !t.groupId && isSubjectRestricted(t, state))
    .sort((a, b) => lessonAvailabilityScore(a, state) - lessonAvailabilityScore(b, state));
  for (const task of targets) {
    if (!task.placed) {
      // Avoid period 1 where possible — it's reserved for the class teacher,
      // placed right after this phase. Falls back to period 1 only if it's
      // truly the lesson's sole remaining legal slot.
      tryPlaceTaskRandom(task, state, daysPerWeek, periodsPerDay, taskPlacementSeed(task, 1, runSeed), 0);
    }
  }
}

/**
 * Same idea for teachers with restricted time-off — place their lessons
 * before the general queue grabs those rare slots.
 */
function placeRestrictedTeachersFirst(instances, state, daysPerWeek, periodsPerDay, runSeed) {
  // Same reasoning as placeRestrictedSubjectsFirst: grouped multi-class lessons
  // are excluded so a restricted teacher on a co-teaching team can't get their
  // class's copy placed alone, ahead of the group-coordination phase.
  const targets = instances
    .filter((t) => !t.placed && !t.groupId && isTeacherRestricted(t, state))
    .sort((a, b) => lessonAvailabilityScore(a, state) - lessonAvailabilityScore(b, state));
  for (const task of targets) {
    if (!task.placed) {
      tryPlaceTaskRandom(task, state, daysPerWeek, periodsPerDay, taskPlacementSeed(task, 2, runSeed));
    }
  }
}

/** True when this class already has the task's subject sitting in `period` on some other day. */
function periodAlreadyUsedForSubject(task, period, state) {
  const grid = state.classGrids[task.classId];
  for (let d = 0; d < state.daysPerWeek; d++) {
    if (grid[d][period]?.subject === task.subject) return true;
  }
  return false;
}

/**
 * Place a single lesson into a random free slot, preferring a period that
 * this subject doesn't already occupy on another day (so a subject doesn't
 * settle into the same period every day). Falls back through the same
 * constraint-relaxation ladder as the other placement helpers.
 */
function tryPlaceTaskRandom(task, state, daysPerWeek, periodsPerDay, seed, excludePeriod) {
  const levels = createRelaxationLevels();
  const shuffled = shuffleSlots(buildAllSlots(daysPerWeek, periodsPerDay), seed);

  for (const level of levels) {
    let candidates = shuffled.filter(({ day, period }) => canPlace(task, day, period, state, level.flags));
    if (excludePeriod != null) {
      const withoutExcluded = candidates.filter(({ period }) => period !== excludePeriod);
      if (withoutExcluded.length) candidates = withoutExcluded;
    }
    if (!candidates.length) continue;

    const fresh = candidates.filter(({ period }) => !periodAlreadyUsedForSubject(task, period, state));
    const pick = (fresh.length ? fresh : candidates)[0];
    placeLesson(task, pick.day, pick.period, state, level.id === "strict" ? null : level.id);
    return true;
  }

  return false;
}

/**
 * Place every class's lessons together, in passes, rather than finishing one
 * class before starting the next:
 *   1. Subjects with a restricted time-off window, every class.
 *   2. Class teacher lesson at period 1, every class.
 *   3. Teachers with a restricted time-off window, every class.
 *   4. Everything left over — random free slot, avoiding repeating the same
 *      period for a subject across days — repeated in passes until nothing
 *      new fits or rounds exhaust. Leftovers fall through to the tray.
 */
function placeAllWithRetryLoop(instances, state, classes, teachers, daysPerWeek, periodsPerDay, runSeed, classLessonsMap) {
  // Computed up front: groups that are themselves a class teacher's subject —
  // these must go through placeGroupedClassTeacherFirstPeriods (period 1,
  // priority) rather than being grabbed by an earlier any-period pass.
  const ctGroupIds = collectClassTeacherGroupIds(classes, teachers, classLessonsMap);

  // Phase 0: multi-class (grouped) lessons whose subject or teachers have a
  // restricted time-off window — placed before EVERYTHING else EXCEPT the
  // class teacher's own group subjects (excluded here, handled in Phase 2a).
  // A group needs one shared slot legal across all its classes at once; if
  // other lessons claim those few slots first, the whole group lands in the tray.
  placeGroupedMultiClassLessons(instances, state, daysPerWeek, periodsPerDay, runSeed, true, ctGroupIds);

  // Phase 1: every multi-class lesson's first weekly occurrence claims period 1
  // on the earliest day it can, across all of its classes at once — before each
  // class's own class teacher gets a turn at period 1. The class teacher phase
  // right after this naturally skips whatever day got claimed here (its grid
  // slot is already filled) and fills period 1 on the remaining days instead.
  placeGroupSharedFirstOccurrencePeriod(instances, state, daysPerWeek);

  // Phase 2: class teacher's subject into period 1 — one lesson per day, up to
  // min(lessonsPerWeek, daysPerWeek). Runs BEFORE the restricted-subjects pass
  // below so a scarce-slot subject can never steal a period-1 day the class
  // teacher's own subject still needed; any day left over (because the subject
  // has fewer lessons than there are school days) is simply not claimed here,
  // so the next phases are free to fill it with another subject.
  placeClassTeacherFirstPeriods(instances, state, classes, teachers, daysPerWeek, classLessonsMap);

  // Phase 2a: class teacher subjects that are themselves a multi-class lesson —
  // one weekly occurrence per day, period 1, across every class in the group at once.
  placeGroupedClassTeacherFirstPeriods(instances, state, daysPerWeek, ctGroupIds);

  // Phase 2b: multi-class lessons (one teacher/team teaching the same subject to
  // several classes at once) — locked into a shared slot before anything else competes for it.
  placeGroupedMultiClassLessons(instances, state, daysPerWeek, periodsPerDay, runSeed);

  // Phase 3: subject time-off restricted lessons, all classes together — their
  // few legal slots are claimed before the general queue grabs them. Runs after
  // the class-teacher phases above so it can only use period 1 on days the
  // class teacher's own subject left unclaimed.
  placeRestrictedSubjectsFirst(instances, state, daysPerWeek, periodsPerDay, runSeed);

  // Phase 3b: teacher time-off restricted lessons, all classes together.
  placeRestrictedTeachersFirst(instances, state, daysPerWeek, periodsPerDay, runSeed);

  // Phase 4: remaining SINGLE-CLASS lessons, random slot, all classes together.
  // Grouped (multi-class) lessons are excluded — placing one class's copy
  // individually here, uncoordinated with the rest of the group, would desync
  // it from its sibling classes. Phase 2b already gave every group an
  // exhaustive any-slot attempt; resolveGroupedTrayBySwapping (after this
  // function returns) is the group-aware rescue for anything still stuck.
  let stagnantRounds = 0;

  for (let round = 0; round < PLACEMENT_RETRY_ROUNDS; round++) {
    const unplaced = instances.filter((t) => !t.placed && !t.groupId);
    if (!unplaced.length) break;

    let placedThisRound = 0;

    for (const task of unplaced) {
      if (task.placed) continue;
      if (tryPlaceTaskRandom(task, state, daysPerWeek, periodsPerDay, taskPlacementSeed(task, round, runSeed))) {
        placedThisRound++;
      }
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

      const groupId = row.groupId || null;

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
          groupId,
        });
      }
    }
  }

  return instances;
}

/**
 * A multi-class lesson row (row.groupId set, mirrored into every class in the
 * group by propagateMultiClassLessons) must land on the same day/period in
 * every class — the same teacher(s) teach all those classes simultaneously.
 * Each weekly occurrence (matched by instanceIndex) across the group's classes
 * is placed together, or not at all, into a single shared slot.
 */
function placeGroupedMultiClassLessons(instances, state, daysPerWeek, periodsPerDay, attempt, onlyRestricted = false, excludeGroupIds = null) {
  const groups = new Map();
  for (const task of instances) {
    if (task.invalid || task.placed || !task.groupId) continue;
    // excludeGroupIds: groups that are themselves a class teacher's subject —
    // reserved for placeGroupedClassTeacherFirstPeriods, which must get the
    // first claim on period 1 before this (any-period) pass can place them.
    if (excludeGroupIds?.has(task.groupId)) continue;
    // onlyRestricted: the early phase for groups whose subject or teachers
    // have a time-off window — their few legal slots must be claimed before
    // anything else fills them.
    if (
      onlyRestricted &&
      !(isSubjectRestricted(task, state) || isTeacherRestricted(task, state))
    ) {
      continue;
    }
    const key = `${task.groupId}|${task.instanceIndex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }

  for (const group of groups.values()) {
    if (group.length < 2 || group.some((t) => t.placed)) continue;

    const levels = createRelaxationLevels();
    let placed = false;

    for (const level of levels) {
      for (let day = 0; day < daysPerWeek && !placed; day++) {
        for (let period = 0; period < periodsPerDay && !placed; period++) {
          const placements = group.map((task) => ({ task, day, period }));
          if (canPlaceAll(placements, state, level.flags)) {
            for (const { task, day: d, period: p } of placements) {
              placeLesson(task, d, p, state, level.id === "strict" ? null : level.id);
            }
            placed = true;
          }
        }
      }
    }

    if (!placed) {
      const shuffled = shuffleSlots(
        buildAllSlots(daysPerWeek, periodsPerDay),
        taskPlacementSeed(group[0], 77, attempt)
      );
      outer: for (const level of createRelaxationLevels()) {
        for (const { day, period } of shuffled) {
          const placements = group.map((task) => ({ task, day, period }));
          if (canPlaceAll(placements, state, level.flags)) {
            for (const { task, day: d, period: p } of placements) {
              placeLesson(task, d, p, state, level.id === "strict" ? null : level.id);
            }
            break outer;
          }
        }
      }
    }
  }
}

function findClassTeacherLessonIndex(instances, classId, classTeacher) {
  const { teacherName, subject } = classTeacher;

  // Match on subject, strictly. The class-teacher-first-period rule is about
  // the class teacher's designated SUBJECT occupying period 1 — up to its
  // lessons-per-week, one per day. Once those instances are placed, period 1
  // on any remaining day is left open for the general queue to fill with
  // another subject (never forced to a different subject by this same
  // teacher, which would go beyond the rule).
  return instances.findIndex(
    (t) =>
      !t.invalid &&
      !t.placed &&
      t.classId === classId &&
      t.teachers.includes(teacherName) &&
      t.subject === subject
  );
}

/**
 * Every multi-class lesson's first weekly occurrence (instanceIndex 0) gets
 * one shot at period 1 on the earliest day that works for every class in its
 * group simultaneously — tried day by day, strict first then relaxed. This
 * runs before the per-class "class teacher" phase so a shared lesson (taught
 * to several classes at once) doesn't lose period 1 to whichever individual
 * class teacher subject happens to also want it; the class-teacher phase then
 * fills period 1 on the remaining days for each class's own subject.
 */
function placeGroupSharedFirstOccurrencePeriod(instances, state, daysPerWeek) {
  const groups = new Map();
  for (const task of instances) {
    if (task.invalid || task.placed || !task.groupId || task.instanceIndex !== 0) continue;
    if (!groups.has(task.groupId)) groups.set(task.groupId, []);
    groups.get(task.groupId).push(task);
  }

  const levels = createRelaxationLevels();
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    let placed = false;
    for (let day = 0; day < daysPerWeek && !placed; day++) {
      for (const level of levels) {
        const placements = group.map((task) => ({ task, day, period: 0 }));
        if (canPlaceAll(placements, state, level.flags)) {
          for (const { task, period } of placements) {
            placeLesson(task, day, period, state, level.id === "strict" ? null : level.id);
          }
          placed = true;
          break;
        }
      }
    }
  }
}

/**
 * Class teacher is placed in period 1 every school day for every class.
 * This is the highest-priority placement: it runs before anything else is on
 * the grid, so the only thing that can legitimately block it is the same
 * teacher already being claimed as period-1 class teacher for another class
 * on that same day. Soft constraints (daily/consecutive limits, subject or
 * teacher time-off) are progressively relaxed, then force-placed as a last
 * resort, so a class is never silently left without its period-1 lesson.
 */
function collectClassTeacherGroupIds(classes, teachers, classLessonsMap) {
  const groupIds = new Set();
  for (const cls of classes) {
    const ct = findClassTeacherForClass(teachers, cls, classLessonsMap);
    if (ct?.groupId) groupIds.add(ct.groupId);
  }
  return groupIds;
}

function placeClassTeacherFirstPeriods(instances, state, classes, teachers, daysPerWeek, classLessonsMap) {
  const levels = createRelaxationLevels();
  const forceFlags = {
    ignoreClassTeacherFirst: true,
    ignoreMaxPerDay: true,
    ignoreMaxConsecutive: true,
    ignoreSubjectAvailability: true,
    ignoreTeacherAvailability: true,
    ignoreSameSubjectSameDay: true,
  };

  for (const cls of classes) {
    const ct = findClassTeacherForClass(teachers, cls, classLessonsMap);
    if (!ct) continue;
    // Class teacher subjects that are themselves a multi-class lesson (taught
    // simultaneously to several classes) are handled by
    // placeGroupedClassTeacherFirstPeriods instead — grabbing one instance
    // here, for this class alone, would desync it from the rest of the group.
    if (ct.groupId) continue;

    for (let day = 0; day < daysPerWeek; day++) {
      if (state.classGrids[cls.id][day][0]) continue;

      const idx = findClassTeacherLessonIndex(instances, cls.id, ct);
      if (idx === -1) continue;

      const task = instances[idx];
      let placed = false;

      for (const level of levels) {
        if (canPlace(task, day, 0, state, level.flags)) {
          placeLesson(task, day, 0, state, level.id === "strict" ? null : level.id);
          task.isClassTeacherSlot = true;
          placed = true;
          if (level.id !== "strict") {
            state.relaxationsUsed.classTeacherFirstPeriod += 1;
          }
          break;
        }
      }

      // Last resort: force past subject/teacher time-off restrictions too.
      // Only a genuine same-teacher double-booking (areTeachersFree) can still block this.
      if (!placed && canPlace(task, day, 0, state, forceFlags)) {
        placeLesson(task, day, 0, state, "relaxClassTeacherFirst");
        task.isClassTeacherSlot = true;
        state.relaxationsUsed.classTeacherFirstPeriod += 1;
      }
    }
  }
}

/**
 * Class teacher subjects that are also a multi-class lesson (the same teacher
 * teaching several classes together) — placed one weekly occurrence per day,
 * at period 1, across every class in the group simultaneously. If a day's
 * period 1 can't fit the whole group, that occurrence rolls over and tries
 * again on the next day — it never collides with whatever already took that
 * slot, and it never strands the other classes in the group the way grabbing
 * a single class's instance would. Anything still unplaced after this is
 * picked up by the regular placeGroupedMultiClassLessons pass (any period).
 */
function placeGroupedClassTeacherFirstPeriods(instances, state, daysPerWeek, ctGroupIds) {
  if (!ctGroupIds || !ctGroupIds.size) return;
  const levels = createRelaxationLevels();

  for (const groupId of ctGroupIds) {
    const byIndex = new Map();
    for (const task of instances) {
      if (task.invalid || task.placed || task.groupId !== groupId) continue;
      if (!byIndex.has(task.instanceIndex)) byIndex.set(task.instanceIndex, []);
      byIndex.get(task.instanceIndex).push(task);
    }
    const occurrences = [...byIndex.values()].filter((g) => g.length >= 2);
    if (!occurrences.length) continue;

    let occIdx = 0;
    for (let day = 0; day < daysPerWeek && occIdx < occurrences.length; day++) {
      const group = occurrences[occIdx];
      if (group.some((t) => t.placed)) {
        occIdx++;
        continue;
      }

      let placedToday = false;
      for (const level of levels) {
        const placements = group.map((task) => ({ task, day, period: 0 }));
        if (canPlaceAll(placements, state, level.flags)) {
          for (const { task, period } of placements) {
            placeLesson(task, day, period, state, level.id === "strict" ? null : level.id);
            task.isClassTeacherSlot = true;
          }
          placedToday = true;
          break;
        }
      }

      if (placedToday) occIdx++;
      // else: today's period 1 is unavailable for the whole group — leave this
      // occurrence for the next day rather than forcing a conflict.
    }
  }
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
    periodsPerWeek,
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
    periodsPerWeek: data.periodsPerWeek,
    teachers,
    subjects: data.subjects || [],
    constraints,
  });

  // A fresh random seed each run — not derived from the data — so the
  // "random free slot" placement actually differs between Generate clicks
  // instead of reproducing the same layout every time.
  const runSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff) ^ (attempt * 2654435761)) >>> 0;

  placeAllWithRetryLoop(instances, state, classes, teachers, daysPerWeek, periodsPerDay, runSeed, classLessonsMap);

  const unplacedAfterMain = instances.filter((t) => !t.placed).length;
  if (unplacedAfterMain > 0) {
    // Keep trying random free slots only — never fall back to a fixed
    // same-period-every-day pattern, which would also re-home lessons that
    // were already placed correctly.
    placeRemainingWithShuffle(instances, state, daysPerWeek, periodsPerDay, runSeed);
  }

  // Rescue pass for multi-class (grouped) lessons still stuck in the tray —
  // tries every slot, swapping out a plain occupant across every class in the
  // group at once if needed. Runs first so any single-class card it displaces
  // gets picked up by the single-class rescue right after.
  if (instances.some((t) => !t.placed && t.groupId)) {
    resolveGroupedTrayBySwapping(instances, state, daysPerWeek, periodsPerDay, runSeed);
  }

  // Final pass: clear the tray by swapping leftover cards into occupied slots
  // (the displaced card re-enters the tray and gets its own turn).
  if (instances.some((t) => !t.placed)) {
    resolveTrayBySwapping(instances, state, daysPerWeek, periodsPerDay, runSeed);
  }

  const unassigned = [];
  for (const task of instances) {
    if (!task.placed) {
      unassigned.push({
        classLabel: task.classLabel,
        subject: task.subject,
        teachers: task.teachers,
        lessonId: task.lessonId,
        groupId: task.groupId || null,
        instanceIndex: task.instanceIndex,
        reason: "No free slot found after retry and fixed-period passes — placed in lesson tray.",
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
    periodsPerWeek,
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

  const slotsPerClass = Math.min(daysPerWeek * periodsPerDay, periodsPerWeek);
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
  const totalPeriodSlots =
    periodRows.length > 0
      ? Math.max(periodRows.length, periodsPerDay)
      : periodsPerDay;
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
      totalPeriodSlots,
      periodsPerWeek,
      dayNames,
      dayLabels,
      periodLabels,
      constraints: loadSchoolConstraints(),
      slotsPerClass,
    },
  };
}

export const GENERATION_ATTEMPTS = 1;

function trayCountFromResult(result) {
  return result?.timetable?.tray?.length ?? result?.stats?.unassignedCount ?? 0;
}

function runBestOfManyGenerations(validation, maxAttempts, onProgress) {
  let best = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = runOneGeneration(validation.data, attempt);
    if (!best || result.outcomeScore < best.outcomeScore) {
      best = result;
    }

    onProgress?.({
      attempt: attempt + 1,
      maxAttempts,
      bestTrayCount: trayCountFromResult(best),
    });
  }

  return {
    success: best.success,
    errors: [],
    warnings: validation.warnings,
    timetable: best.timetable,
    meta: {
      attemptsRun: maxAttempts,
      bestTrayCount: trayCountFromResult(best),
    },
  };
}

export function generateTimetable({ maxAttempts = GENERATION_ATTEMPTS, onProgress } = {}) {
  const validation = validateTimetableInputs();
  if (!validation.ok) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
      timetable: null,
      meta: null,
    };
  }

  return runBestOfManyGenerations(validation, maxAttempts, onProgress);
}

/** Run generation attempts one at a time so the UI can show progress between runs. */
export async function generateTimetableAsync({ maxAttempts = GENERATION_ATTEMPTS, onProgress } = {}) {
  const validation = validateTimetableInputs();
  if (!validation.ok) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
      timetable: null,
      meta: null,
    };
  }

  let best = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = runOneGeneration(validation.data, attempt);
    if (!best || result.outcomeScore < best.outcomeScore) {
      best = result;
    }

    onProgress?.({
      attempt: attempt + 1,
      maxAttempts,
      bestTrayCount: trayCountFromResult(best),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    success: best.success,
    errors: [],
    warnings: validation.warnings,
    timetable: best.timetable,
    meta: {
      attemptsRun: maxAttempts,
      bestTrayCount: trayCountFromResult(best),
    },
  };
}
