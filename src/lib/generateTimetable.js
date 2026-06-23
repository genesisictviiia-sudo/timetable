import {
  getClassLessons,
  getClassTeacherInfo,
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
      },
    },
    {
      id: "relaxConsecutive",
      label: "Consecutive class limit",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: false,
        ignoreMaxConsecutive: true,
      },
    },
    {
      id: "relaxMaxPerDay",
      label: "Maximum classes per day",
      flags: {
        ignoreClassTeacherFirst: false,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
      },
    },
    {
      id: "relaxClassTeacherFirst",
      label: "Class teacher first period",
      flags: {
        ignoreClassTeacherFirst: true,
        ignoreMaxPerDay: true,
        ignoreMaxConsecutive: true,
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
      (t.lessons || []).find((l) => l.classLabel === classLabel && l.isClassTeacher) ||
      (t.lessons || []).find((l) => l.isClassTeacher) ||
      (t.lessons || []).find((l) => l.classLabel === classLabel);
    if (row) {
      return { teacherName: t.name, subject: row.subject };
    }
  }

  // 2. isClassTeacher flag on class lesson rows — set by ClassLessonsModal save payload.
  const lessons = getClassLessons(cls.id);
  const ct = lessons.find(l => l.isClassTeacher);
  if (ct?.primaryTeacher && ct?.subject) {
    return { teacherName: ct.primaryTeacher, subject: ct.subject };
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
  let minAvail = state.totalGridSlots ?? Infinity;
  const sAvail = state.subjectAvailable?.[task.subject];
  if (sAvail != null) minAvail = Math.min(minAvail, sAvail);
  for (const name of task.teachers) {
    const tAvail = state.teacherAvailable?.[name];
    if (tAvail != null) minAvail = Math.min(minAvail, tAvail);
  }
  return minAvail;
}

function isSubjectRestricted(task, state) {
  const sAvail = state.subjectAvailable?.[task.subject];
  return sAvail != null && sAvail < (state.totalGridSlots ?? Infinity);
}

function isTeacherRestricted(task, state) {
  for (const name of task.teachers) {
    const tAvail = state.teacherAvailable?.[name];
    if (tAvail != null && tAvail < (state.totalGridSlots ?? Infinity)) return true;
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
  if (!isSubjectAvailable(task.subject, day, period, state)) return false;

  for (const name of task.teachers) {
    if (!isTeacherAvailable(name, day, period, state)) return false;
    if (!passesDailyLimit(name, day, state, flags)) return false;
    if (!passesConsecutiveLimit(name, day, period, state, flags)) return false;
  }

  const grid = state.classGrids[task.classId];
  if (grid[day][period]) return false;

  // Co-teach: all satellite class grids must also be free at this slot
  if (task.coTeachSatellites?.length) {
    for (const sat of task.coTeachSatellites) {
      if (state.classGrids[sat.classId]?.[day]?.[period]) return false;
    }
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

  // Co-teach: place each satellite class in the same slot (teachers already counted above)
  if (task.coTeachSatellites?.length) {
    for (const sat of task.coTeachSatellites) {
      if (state.classGrids[sat.classId]) {
        state.classGrids[sat.classId][day][period] = {
          subject: sat.subject,
          teachers: [...sat.teachers],
          lessonId: sat.lessonId,
        };
        sat.placed = true;
        sat.placedDay = day;
        sat.placedPeriod = period;
      }
    }
  }
}

function unplaceTask(task, state) {
  if (!task.placed) return;

  // Co-teach: clear satellite class grids first (teachers tracked only on primary)
  if (task.coTeachSatellites?.length) {
    for (const sat of task.coTeachSatellites) {
      if (!sat.placed) continue;
      const sd = sat.placedDay;
      const sp = sat.placedPeriod;
      if (state.classGrids[sat.classId]?.[sd]?.[sp]) {
        state.classGrids[sat.classId][sd][sp] = null;
      }
      sat.placed = false;
      delete sat.placedDay;
      delete sat.placedPeriod;
    }
  }

  const day = task.placedDay;
  const period = task.placedPeriod;
  const grid = state.classGrids[task.classId];
  if (grid?.[day]?.[period]) {
    grid[day][period] = null;
  }

  for (const name of task.teachers) {
    state.teacherBusy.delete(teacherBusyKey(name, day, period));
    if (state.teacherDayCount[name]?.[day] > 0) {
      state.teacherDayCount[name][day] -= 1;
    }
    const periods = state.teacherDayPeriods[name]?.[day];
    if (periods) {
      const idx = periods.indexOf(period);
      if (idx >= 0) periods.splice(idx, 1);
    }
  }

  task.placed = false;
  delete task.placedDay;
  delete task.placedPeriod;
}

function unplaceTasks(tasks, state) {
  for (const task of tasks) {
    if (task.placed) unplaceTask(task, state);
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
const POST_MAIN_RETRY_ROUNDS = 24;  // extra shuffle rounds after the main loop

function placeRemainingWithShuffle(instances, state, daysPerWeek, periodsPerDay, attempt) {
  let stagnantRounds = 0;

  for (let round = 0; round < POST_MAIN_RETRY_ROUNDS; round++) {
    const unplaced = instances.filter((t) => !t.invalid && !t.placed && !t.coTeachSatellite);
    if (!unplaced.length) break;

    const queue = sortUnplacedQueue(unplaced, state, daysPerWeek, periodsPerDay);
    let placedThisRound = 0;

    for (const task of queue) {
      if (
        tryPlaceTaskShuffled(
          task,
          state,
          daysPerWeek,
          periodsPerDay,
          taskPlacementSeed(task, round + 200, attempt)
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

/**
 * Count the total slots where ALL teachers for a task are available (ignoring class grid).
 * Used to identify time-constrained tasks that must be placed first.
 */
function countTeacherAvailableSlots(task, state, daysPerWeek, periodsPerDay) {
  let count = 0;
  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      if (!isSubjectAvailable(task.subject, day, period, state)) continue;
      let ok = true;
      for (const name of task.teachers) {
        if (!isTeacherAvailable(name, day, period, state)) { ok = false; break; }
      }
      if (ok) count++;
    }
  }
  return count;
}

/**
 * Try to place a task using normal placement first; if that fails, displace a lower-priority
 * occupant (never a class-teacher-first-period slot) and re-queue it.
 * Returns the displaced task if preemption occurred, null otherwise.
 */
function placeWithPreemption(task, state, daysPerWeek, periodsPerDay, instances) {
  const levels = createRelaxationLevels();

  // Normal placement first
  for (const level of levels) {
    const slot = findBestSlot(task, state, daysPerWeek, periodsPerDay, level.flags, level.id);
    if (slot) {
      placeLesson(task, slot.day, slot.period, state, slot.levelId);
      return null;
    }
  }

  // Preemptive: find a slot blocked only by another placed lesson in this class
  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      if (!areTeachersFree(task, day, period, state)) continue;
      if (!isSubjectAvailable(task.subject, day, period, state)) continue;
      let teachersOk = true;
      for (const name of task.teachers) {
        if (!isTeacherAvailable(name, day, period, state)) { teachersOk = false; break; }
      }
      if (!teachersOk) continue;

      // Satellite class grids must also be free — otherwise placeLesson would overwrite them
      if (task.coTeachSatellites?.length) {
        let satsFree = true;
        for (const sat of task.coTeachSatellites) {
          if (state.classGrids[sat.classId]?.[day]?.[period]) { satsFree = false; break; }
        }
        if (!satsFree) continue;
      }

      const grid = state.classGrids[task.classId];
      if (!grid[day][period]) continue; // already free — would have been caught above

      // Find and displace the occupant (protect class-teacher and co-teach satellite slots)
      const displaced = instances.find(
        (t) =>
          t.placed &&
          !t.isClassTeacherSlot &&
          !t.coTeachSatellite &&
          t.classId === task.classId &&
          t.placedDay === day &&
          t.placedPeriod === period
      );
      if (!displaced) continue;

      unplaceTask(displaced, state);
      placeLesson(task, day, period, state, null);
      return displaced;
    }
  }

  return null;
}

/**
 * Pre-phase: sort all tasks by how many slots their teachers are available in (ascending).
 * Tasks with the fewest available slots are placed first, displacing others if needed.
 * This ensures time-off constrained lessons always land in valid windows.
 */
function placeTimeConstrainedTasksFirst(instances, state, daysPerWeek, periodsPerDay) {
  const totalSlots = daysPerWeek * periodsPerDay;

  // Only consider tasks whose teachers are available in fewer than all slots (have restrictions)
  const withCounts = instances
    .filter((t) => !t.invalid && !t.placed && !t.coTeachSatellite)
    .map((t) => ({ task: t, count: countTeacherAvailableSlots(t, state, daysPerWeek, periodsPerDay) }))
    .filter(({ count }) => count > 0 && count < totalSlots)
    .sort((a, b) => a.count - b.count); // most constrained first

  for (const { task } of withCounts) {
    if (task.placed) continue;
    placeWithPreemption(task, state, daysPerWeek, periodsPerDay, instances);
  }
}

/**
 * Check whether all teacher/subject constraints pass for `task` at (day, period),
 * ignoring whether the class grid slot is occupied (used for displacement checks).
 */
function teachersAndSubjectFreeAt(task, day, period, state) {
  if (!areTeachersFree(task, day, period, state)) return false;
  if (!isSubjectAvailable(task.subject, day, period, state)) return false;
  for (const name of task.teachers) {
    if (!isTeacherAvailable(name, day, period, state)) return false;
  }
  if (task.coTeachSatellites?.length) {
    for (const sat of task.coTeachSatellites) {
      if (state.classGrids[sat.classId]?.[day]?.[period]) return false;
    }
  }
  return true;
}

/**
 * Find the placed, displaceable instance sitting at (classId, day, period).
 * Returns null if the slot is empty or the occupant is locked (class-teacher or satellite).
 */
function findOccupant(classId, day, period, instances) {
  return instances.find(
    (t) =>
      t.placed &&
      !t.isClassTeacherSlot &&
      !t.coTeachSatellite &&
      t.classId === classId &&
      t.placedDay === day &&
      t.placedPeriod === period
  ) ?? null;
}

/**
 * Try to place `task` by chaining displacements up to `maxDepth` levels deep.
 *
 * depth=0  → only attempt a direct free-slot placement.
 * depth=1  → displace an occupant then find a FREE slot for it.
 * depth=2  → displace an occupant; if it also needs to displace, allow one more level.
 *
 * `forbidden` is a Set of task objects currently being re-homed in the call stack
 * (prevents cycles). Returns true if the task ended up placed.
 */
function tryChainDisplace(task, instances, state, daysPerWeek, periodsPerDay, maxDepth, forbidden) {
  if (forbidden.has(task)) return false;

  // ── Level 0: direct free-slot ───────────────────────────────────────────────
  if (tryPlaceTaskShuffled(task, state, daysPerWeek, periodsPerDay,
        taskPlacementSeed(task, maxDepth * 100, 0))) {
    return true;
  }

  if (maxDepth === 0) return false;

  // ── Level 1+: scan every slot where teachers are free but grid is occupied ──
  forbidden.add(task);

  for (let day = 0; day < daysPerWeek; day++) {
    for (let period = 0; period < periodsPerDay; period++) {
      if (!teachersAndSubjectFreeAt(task, day, period, state)) continue;
      if (!state.classGrids[task.classId]?.[day]?.[period]) continue; // free → step 0 would have caught it

      const occupant = findOccupant(task.classId, day, period, instances);
      if (!occupant || forbidden.has(occupant)) continue;

      const savedDay = occupant.placedDay;
      const savedPeriod = occupant.placedPeriod;

      // Temporarily vacate the occupant and place the tray task
      unplaceTask(occupant, state);
      placeLesson(task, day, period, state, null);

      // Recursively try to re-home the occupant
      if (tryChainDisplace(occupant, instances, state, daysPerWeek, periodsPerDay, maxDepth - 1, forbidden)) {
        forbidden.delete(task);
        return true;
      }

      // Could not re-home — undo both moves
      unplaceTask(task, state);
      placeLesson(occupant, savedDay, savedPeriod, state, null);
    }
  }

  forbidden.delete(task);
  return false;
}

/**
 * Post-generation tray resolution — runs after all shuffle passes.
 *
 * For each class with unplaced (tray) tasks, processes them most-constrained first.
 * Three steps per task:
 *   1. Direct placement at any free slot.
 *   2. Single displacement: remove an occupant, place tray task, re-home occupant.
 *   3. Chain displacement (depth 2): if the re-homed occupant also needs to displace
 *      another card, allow one additional level of displacement.
 *
 * Repeats until no further progress or maxRounds exhausted.
 * Cards that truly cannot be placed remain in the tray.
 */
function postGenerationTrayResolution(instances, state, daysPerWeek, periodsPerDay, maxRounds = 15) {
  for (let round = 0; round < maxRounds; round++) {
    const unplaced = instances.filter((t) => !t.invalid && !t.placed && !t.coTeachSatellite);
    if (!unplaced.length) break;

    const queue = sortUnplacedQueue(unplaced, state, daysPerWeek, periodsPerDay);
    let placedThisRound = 0;

    for (const task of queue) {
      if (task.placed) continue;

      // Try depth-2 chain displacement (includes direct placement at depth 0)
      const depth = round < 5 ? 1 : 2;
      if (tryChainDisplace(task, instances, state, daysPerWeek, periodsPerDay, depth, new Set())) {
        placedThisRound++;
      }
    }

    if (placedThisRound === 0) break;
  }
}

function countSubjectAvailableSlots(task, state, daysPerWeek, periodsPerDay) {
  let count = 0;
  for (let day = 0; day < daysPerWeek; day++)
    for (let period = 0; period < periodsPerDay; period++)
      if (isSubjectAvailable(task.subject, day, period, state)) count++;
  return count;
}

/**
 * Place all lessons in the prescribed priority order:
 *   1. Class teacher at period 0, class by class.
 *   2. Co-teach (multi-teacher collaboration) lessons for all classes.
 *   3. Subject time-restricted lessons for all classes.
 *   4. Teacher time-restricted lessons for all classes.
 *   5. Remaining lessons, class by class (strict then relaxed).
 *   6. Extra shuffle rounds for any still-unplaced lessons.
 */
function placeAllWithRetryLoop(instances, state, classes, teachers, daysPerWeek, periodsPerDay, attempt) {
  const totalSlots = daysPerWeek * periodsPerDay;

  // ── Phase 1: Class teacher at period 0, class by class ─────────────────────
  placeClassTeacherFirstPeriods(instances, state, classes, teachers, daysPerWeek);

  // ── Phase 2: Co-teach (multi-teacher collaboration) lessons ────────────────
  // Primary instance placement cascades automatically to satellite classes.
  const coTeachPrimaries = instances.filter(
    (t) => !t.invalid && !t.placed && !t.coTeachSatellite && t.coTeachSatellites?.length
  );
  for (const task of sortUnplacedQueue(coTeachPrimaries, state, daysPerWeek, periodsPerDay)) {
    if (!task.placed)
      tryPlaceTaskShuffled(task, state, daysPerWeek, periodsPerDay, taskPlacementSeed(task, 2, attempt));
  }

  // ── Phase 3: Subject time-restricted lessons, all classes ──────────────────
  const subjectRestricted = instances.filter((t) => {
    if (t.invalid || t.placed || t.coTeachSatellite) return false;
    const avail = countSubjectAvailableSlots(t, state, daysPerWeek, periodsPerDay);
    return avail > 0 && avail < totalSlots;
  });
  for (const task of sortUnplacedQueue(subjectRestricted, state, daysPerWeek, periodsPerDay)) {
    if (!task.placed) placeWithPreemption(task, state, daysPerWeek, periodsPerDay, instances);
  }

  // ── Phase 4: Teacher time-restricted lessons, all classes ──────────────────
  const teacherRestricted = instances.filter((t) => {
    if (t.invalid || t.placed || t.coTeachSatellite) return false;
    const avail = countTeacherAvailableSlots(t, state, daysPerWeek, periodsPerDay);
    return avail > 0 && avail < totalSlots;
  });
  for (const task of sortUnplacedQueue(teacherRestricted, state, daysPerWeek, periodsPerDay)) {
    if (!task.placed) placeWithPreemption(task, state, daysPerWeek, periodsPerDay, instances);
  }

  // ── Phase 5: Remaining lessons, class by class ─────────────────────────────
  for (const cls of classes) {
    const remaining = instances.filter(
      (t) => !t.invalid && !t.placed && !t.coTeachSatellite && t.classId === cls.id
    );
    if (!remaining.length) continue;

    // Strict pass first (all constraints enforced)
    for (const task of sortUnplacedQueue(remaining, state, daysPerWeek, periodsPerDay)) {
      if (!task.placed) tryPlaceTask(task, state, daysPerWeek, periodsPerDay);
    }

    // Shuffled pass with constraint relaxation for anything still unplaced
    const stillLeft = remaining.filter((t) => !t.placed);
    for (const task of sortUnplacedQueue(stillLeft, state, daysPerWeek, periodsPerDay)) {
      if (!task.placed)
        tryPlaceTaskShuffled(task, state, daysPerWeek, periodsPerDay, taskPlacementSeed(task, 5, attempt));
    }
  }

  // ── Phase 6: Extra shuffle rounds across all classes ───────────────────────
  placeRemainingWithShuffle(instances, state, daysPerWeek, periodsPerDay, attempt);
}

function buildLessonInstances(classes, classLessonsMap, teachers) {
  const instances = [];
  const teacherNames = new Set(teachers.map((t) => t.name));

  // Pre-compute class teacher per class to exclude CT instances from co-teach grouping.
  const ctByClassId = new Map();
  for (const cls of classes) {
    const ct = findClassTeacherForClass(teachers, cls);
    if (ct) ctByClassId.set(cls.id, ct);
  }

  for (const cls of classes) {
    const rows = Array.isArray(classLessonsMap[cls.id]) ? classLessonsMap[cls.id] : [];
    const ct = ctByClassId.get(cls.id);
    let ctRowFlagged = false;
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

      // Mark first CT-matching row so it is excluded from co-teach grouping.
      const isCtRow = !ctRowFlagged && ct && primary === ct.teacherName && subject === ct.subject;
      if (isCtRow) ctRowFlagged = true;

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
          isClassTeacherLesson: isCtRow,
        });
      }
    }
  }

  // ── Co-teach grouping ─────────────────────────────────────────────────────
  // Tasks that share the same teachers + subject + instanceIndex across multiple
  // classes must be placed at the same (day, period).  Mark one as the primary
  // and the rest as satellites; the primary placement will cascade to satellites.
  // Class-teacher instances are excluded from co-teach: they need individual period-0 placement.
  const coTeachMap = new Map();
  for (const task of instances) {
    if (task.invalid || task.isClassTeacherLesson) continue;
    const key = [
      [...task.teachers].sort().join(""),
      task.subject,
      String(task.instanceIndex ?? 0),
    ].join("||");
    if (!coTeachMap.has(key)) coTeachMap.set(key, []);
    coTeachMap.get(key).push(task);
  }

  let cgSeq = 0;
  for (const group of coTeachMap.values()) {
    if (group.length < 2) continue;
    const groupId = `cg${++cgSeq}`;
    const [primary, ...satellites] = group;
    primary.coTeachGroupId = groupId;
    primary.coTeachSatellites = satellites;
    for (const sat of satellites) {
      sat.coTeachGroupId = groupId;
      sat.coTeachSatellite = true;
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
      !t.coTeachSatellite &&
      t.classId === classId &&
      t.teachers.includes(teacherName) &&
      t.subject === subject
  );
  if (idx >= 0) return idx;

  idx = instances.findIndex(
    (t) => !t.invalid && !t.placed && !t.coTeachSatellite && t.classId === classId && t.teachers.includes(teacherName)
  );
  return idx;
}

/**
 * STRICT: Class teacher's subject occupies Period 1 (index 0) every school day.
 *
 * Algorithm per class per day:
 *  1. If period 0 is already occupied by a non-CT task → displace it back to the pool.
 *     If it's another locked CT slot → skip (genuine double-class-teacher conflict).
 *  2. Find an unplaced instance of the CT subject for this class.
 *     If none remain (teacher has fewer lesson-instances than school days) → skip that day.
 *  3. If the CT teacher is personally unavailable at period 0 (time-off) → skip that day.
 *  4. If the CT teacher is busy at period 0 teaching another class (placed by an earlier
 *     phase), displace that other task unless it is also a locked CT slot.
 *  5. Force-place the CT lesson at period 0 — ignoring max-per-day / consecutive limits
 *     because the class-teacher rule is higher priority than those soft constraints.
 *
 * All placed CT slots are marked `isClassTeacherSlot = true` so later phases (time-off
 * preemption, tray resolution) can never displace them.
 */
function placeClassTeacherFirstPeriods(instances, state, classes, teachers, daysPerWeek) {
  for (const cls of classes) {
    const ct = findClassTeacherForClass(teachers, cls);
    if (!ct) continue;

    for (let day = 0; day < daysPerWeek; day++) {
      // ── 1. Clear any non-CT occupant from period 0 in this class's grid ───────
      if (state.classGrids[cls.id][day][0]) {
        const occupant = instances.find(
          (t) =>
            t.placed &&
            !t.isClassTeacherSlot &&
            !t.coTeachSatellite &&
            t.classId === cls.id &&
            t.placedDay === day &&
            t.placedPeriod === 0
        );
        if (occupant) {
          unplaceTask(occupant, state); // returns to the unplaced pool for later phases
        } else {
          continue; // period 0 is locked by another CT slot — genuine conflict, skip
        }
      }

      // ── 2. Find an unplaced instance of the EXACT CT subject for this class ────
      // Do NOT use the fallback that picks any subject — when CT subject instances
      // are exhausted, leave period 0 empty for that day rather than forcing an
      // unrelated subject (e.g. Math) into the class-teacher slot.
      const idx = instances.findIndex(
        (t) =>
          !t.invalid &&
          !t.placed &&
          !t.coTeachSatellite &&
          t.classId === cls.id &&
          t.teachers.includes(ct.teacherName) &&
          t.subject === ct.subject
      );
      if (idx === -1) continue; // no remaining instances of CT subject — skip this day

      const task = instances[idx];

      // ── 3. Respect teacher's personal time-off at period 0 ───────────────────
      const teacherUnavailable = task.teachers.some(
        (n) => !isTeacherAvailable(n, day, 0, state)
      );
      if (teacherUnavailable) continue;

      // ── 4. If teacher is busy at period 0 (placed elsewhere by Phase 0),
      //       displace that other task unless it is a locked CT slot ─────────────
      const teacherBusyHere = task.teachers.some(
        (n) => state.teacherBusy.has(teacherBusyKey(n, day, 0))
      );
      if (teacherBusyHere) {
        let canProceed = true;
        for (const tName of task.teachers) {
          if (!state.teacherBusy.has(teacherBusyKey(tName, day, 0))) continue;
          // Find what is using this teacher at (day, 0)
          const blocker = instances.find(
            (t) =>
              t.placed &&
              !t.isClassTeacherSlot &&
              !t.coTeachSatellite &&
              t.teachers.includes(tName) &&
              t.placedDay === day &&
              t.placedPeriod === 0
          );
          if (blocker) {
            unplaceTask(blocker, state); // displaced back to the pool
          } else {
            // Teacher is locked at period 0 by a CT slot for another class — skip
            canProceed = false;
            break;
          }
        }
        if (!canProceed) continue;
      }

      // ── 5. Force-place the CT lesson at period 0 ─────────────────────────────
      // Ignore max-per-day and consecutive limits: the CT rule takes priority.
      placeLesson(task, day, 0, state, null);
      task.isClassTeacherSlot = true;
    }
  }
}

function sortInstancesForPlacement(instances, attempt = 0, state = null) {
  const list = instances
    .filter((t) => !t.invalid && !t.placed && !t.coTeachSatellite)
    .sort((a, b) => {
      if (state) {
        const availDiff = lessonAvailabilityScore(a, state) - lessonAvailabilityScore(b, state);
        if (availDiff !== 0) return availDiff;
      }
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
    periodsPerWeek,
    dayNames,
    dayLabels,
    periodLabels,
    constraints,
  } = data;

  const allInstances = buildLessonInstances(classes, classLessonsMap, teachers);
  const invalidTasks = allInstances.filter((t) => t.invalid);

  // Clone so each attempt is independent; re-link coTeachSatellites to the new copies.
  const origToCopy = new Map();
  const instances = allInstances
    .filter((t) => !t.invalid)
    .map((t) => { const c = { ...t }; origToCopy.set(t, c); return c; });
  for (const c of instances) {
    if (c.coTeachSatellites?.length) {
      c.coTeachSatellites = c.coTeachSatellites.map((s) => origToCopy.get(s) ?? s);
    }
  }

  const state = createGeneratorState({
    classes,
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek: data.periodsPerWeek,
    teachers,
    subjects: data.subjects || [],
    constraints,
  });

  placeAllWithRetryLoop(instances, state, classes, teachers, daysPerWeek, periodsPerDay, attempt);

  const unplacedAfterMain = instances.filter((t) => !t.placed).length;
  if (unplacedAfterMain > 0) {
    // No fixed-period fallback — subjects may land in any period on any day.
    // Just keep shuffling until every slot is filled.
    placeRemainingWithShuffle(instances, state, daysPerWeek, periodsPerDay, attempt);
  }

  // Post-generation: for each remaining tray card, try to find a slot by displacing
  // an existing lesson and re-homing it. Repeat until no further progress.
  const unplacedAfterShuffle = instances.filter((t) => !t.invalid && !t.placed).length;
  if (unplacedAfterShuffle > 0) {
    postGenerationTrayResolution(instances, state, daysPerWeek, periodsPerDay);
  }


  const unassigned = [];
  for (const task of instances) {
    if (!task.placed) {
      unassigned.push({
        classId: task.classId,
        classLabel: task.classLabel,
        subject: task.subject,
        teachers: task.teachers,
        reason: "No free slot found after all retry passes — placed in lesson tray.",
      });
    }
  }

  for (const bad of invalidTasks) {
    unassigned.push({
      classId: bad.classId,
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

/** Async wrapper around runOneGeneration that yields between heavy phases. */
async function runOneGenerationAsync(data, attempt, yield_) {
  const { daysPerWeek, periodsPerDay } = data;

  const allInstances = buildLessonInstances(data.classes, data.classLessonsMap, data.teachers);
  const invalidTasks = allInstances.filter((t) => t.invalid);

  const origToCopy2 = new Map();
  const instances = allInstances
    .filter((t) => !t.invalid)
    .map((t) => { const c = { ...t }; origToCopy2.set(t, c); return c; });
  for (const c of instances) {
    if (c.coTeachSatellites?.length) {
      c.coTeachSatellites = c.coTeachSatellites.map((s) => origToCopy2.get(s) ?? s);
    }
  }

  const state = createGeneratorState({
    classes: data.classes,
    daysPerWeek,
    periodsPerDay,
    periodsPerWeek: data.periodsPerWeek,
    teachers: data.teachers,
    subjects: data.subjects || [],
    constraints: data.constraints,
  });


  // Phase 1: class teacher at period 0, class by class.
  placeClassTeacherFirstPeriods(instances, state, data.classes, data.teachers, daysPerWeek);
  await yield_();

  // Phase 2: co-teach (multi-teacher) lessons for all classes.
  const totalSlots2 = daysPerWeek * periodsPerDay;
  const coTeachPrimaries2 = instances.filter(
    (t) => !t.invalid && !t.placed && !t.coTeachSatellite && t.coTeachSatellites?.length
  );
  for (const task of sortUnplacedQueue(coTeachPrimaries2, state, daysPerWeek, periodsPerDay)) {
    if (!task.placed)
      tryPlaceTaskShuffled(task, state, daysPerWeek, periodsPerDay, taskPlacementSeed(task, 2, attempt));
  }
  await yield_();

  // Phase 3: subject time-restricted lessons, all classes.
  const subjectRestricted2 = instances.filter((t) => {
    if (t.invalid || t.placed || t.coTeachSatellite) return false;
    const avail = countSubjectAvailableSlots(t, state, daysPerWeek, periodsPerDay);
    return avail > 0 && avail < totalSlots2;
  });
  for (const task of sortUnplacedQueue(subjectRestricted2, state, daysPerWeek, periodsPerDay)) {
    if (!task.placed) placeWithPreemption(task, state, daysPerWeek, periodsPerDay, instances);
  }
  await yield_();

  // Phase 4: teacher time-restricted lessons, all classes.
  const teacherRestricted2 = instances.filter((t) => {
    if (t.invalid || t.placed || t.coTeachSatellite) return false;
    const avail = countTeacherAvailableSlots(t, state, daysPerWeek, periodsPerDay);
    return avail > 0 && avail < totalSlots2;
  });
  for (const task of sortUnplacedQueue(teacherRestricted2, state, daysPerWeek, periodsPerDay)) {
    if (!task.placed) placeWithPreemption(task, state, daysPerWeek, periodsPerDay, instances);
  }
  await yield_();

  // Phase 5: remaining lessons, class by class (strict then relaxed).
  for (const cls of data.classes) {
    const remaining2 = instances.filter(
      (t) => !t.invalid && !t.placed && !t.coTeachSatellite && t.classId === cls.id
    );
    if (!remaining2.length) continue;
    for (const task of sortUnplacedQueue(remaining2, state, daysPerWeek, periodsPerDay)) {
      if (!task.placed) tryPlaceTask(task, state, daysPerWeek, periodsPerDay);
    }
    const stillLeft2 = remaining2.filter((t) => !t.placed);
    for (const task of sortUnplacedQueue(stillLeft2, state, daysPerWeek, periodsPerDay)) {
      if (!task.placed)
        tryPlaceTaskShuffled(task, state, daysPerWeek, periodsPerDay, taskPlacementSeed(task, 5, attempt));
    }
  }
  await yield_();

  // Phase 6: extra shuffle rounds for any still-unplaced lessons.
  const unplacedAfterMain = instances.filter((t) => !t.placed).length;
  if (unplacedAfterMain > 0) {
    placeRemainingWithShuffle(instances, state, daysPerWeek, periodsPerDay, attempt);
    await yield_();
  }

  // Phase 4: post-generation tray resolution — preemptively displace and re-home
  const unplacedAfterShuffle = instances.filter((t) => !t.invalid && !t.placed).length;
  if (unplacedAfterShuffle > 0) {
    postGenerationTrayResolution(instances, state, daysPerWeek, periodsPerDay);
    await yield_();
  }

  // Build result (same as runOneGeneration tail)
  const unassigned = [];
  for (const task of instances) {
    if (!task.placed) {
      unassigned.push({
        classId: task.classId, classLabel: task.classLabel, subject: task.subject, teachers: task.teachers,
        reason: "No free slot found after all retry passes — placed in lesson tray.",
      });
    }
  }
  for (const bad of invalidTasks) {
    unassigned.push({ classId: bad.classId, classLabel: bad.classLabel, subject: bad.subject, teachers: bad.teachers, reason: bad.reason });
  }

  let filledSlots = 0;
  for (const cls of data.classes) {
    const grid = state.classGrids[cls.id];
    if (!grid) continue;
    for (const row of grid) for (const cell of row) if (cell) filledSlots++;
  }

  const placedCount = instances.filter((t) => t.placed).length;
  const stats = {
    totalLessonInstances: instances.length,
    placedInstances: placedCount,
    unassignedCount: unassigned.length,
    filledSlots,
    totalSlots: data.classes.length * daysPerWeek * periodsPerDay,
  };

  const timetable = buildInteractiveTimetableFromGeneration({
    school: data.school, classes: data.classes, classGrids: state.classGrids,
    daysPerWeek, periodsPerDay, periodsPerWeek: data.periodsPerWeek,
    dayNames: data.dayNames, dayLabels: data.dayLabels, periodLabels: data.periodLabels,
    unassigned, relaxations: state.relaxationsUsed, stats, constraints: data.constraints,
  });

  return {
    timetable,
    success: unassigned.length === 0,
    outcomeScore: scoreGenerationOutcome({
      unassignedCount: unassigned.length,
      relaxationsUsed: state.relaxationsUsed,
      placedCount,
      totalInstances: instances.length,
    }),
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

export const GENERATION_ATTEMPTS = 10;

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

const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    // Yield before each attempt so the browser can update progress UI.
    await yieldToUI();

    const result = await runOneGenerationAsync(validation.data, attempt, yieldToUI);
    if (!best || result.outcomeScore < best.outcomeScore) {
      best = result;
    }

    onProgress?.({
      attempt: attempt + 1,
      maxAttempts,
      bestTrayCount: trayCountFromResult(best),
    });

    if (best.success) break; // perfect placement found — stop early
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
