import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { loadClassesList, loadClassLessonsMap, loadTeachers } from "../lib/settingsStorage";
import { loadInstitutionName } from "../lib/printTimetable";
import { flushPendingSyncs, readUserJson, writeUserJson } from "../lib/userDataStorage";
import { getCurrentUser } from "../lib/authStorage";
import "../App.css";

const STORAGE_KEY = "invigilations-v1";
const SAVED_KEY = "invigilations-saved-v1";

function classDisplayName(c) {
  return String(c.title || "").trim() || c.label;
}

function emptyDay() {
  return { date: "", startTime: "09:00", endTime: "12:00" };
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Assign one invigilator per class per day.
 *
 * Rules, in priority order:
 * 1. Day 1: the class teacher takes their own class.
 * 2. Other days: prefer teachers who teach that class; failing that, teachers
 *    of one grade higher/lower, expanding outward; failing that, anyone.
 * 3. Each teacher keeps at least one day off where head-count allows
 *    (capped at numDays − 1 duties), and loads stay balanced.
 */
function generateAssignments({ teacherList, classes, numDays, allClasses, lessonTeachersByClassId }) {
  const counts = Object.fromEntries(teacherList.map((n) => [n, 0]));

  // Grade ordering (as listed in settings) for "one higher or lower" distance.
  const gradeOrder = [...new Set(allClasses.map((c) => String(c.grade ?? "")))];
  const gradeIndexByClassId = new Map(
    allClasses.map((c) => [c.id, gradeOrder.indexOf(String(c.grade ?? ""))])
  );

  // Tier for teacher vs class: 0 = teaches this class, 1+n = teaches a class
  // n grades away, 999 = no teaching relationship known.
  const tierOf = (teacher, cls) => {
    if (lessonTeachersByClassId.get(cls.id)?.has(teacher)) return 0;
    const target = gradeIndexByClassId.get(cls.id);
    if (target == null || target < 0) return 999;
    let best = Infinity;
    for (const [cid, names] of lessonTeachersByClassId) {
      if (!names.has(teacher)) continue;
      const gi = gradeIndexByClassId.get(cid);
      if (gi == null || gi < 0) continue;
      best = Math.min(best, Math.abs(gi - target));
    }
    return best === Infinity ? 999 : 1 + best;
  };

  // Hard day-off cap: numDays − 1 duties per teacher. Only broken as a very
  // last resort (not enough teachers), and then the extra duty goes to the
  // least-loaded teacher — never the same few every time.
  const offCap = numDays > 1 ? numDays - 1 : 1;

  // Designated off day (round-robin) so days off spread across the exam week
  // instead of everyone resting on the last day.
  const offDay = new Map(teacherList.map((n, i) => [n, numDays > 1 ? i % numDays : -1]));

  const assignments = [];
  for (let d = 0; d < numDays; d++) {
    const dayAssigned = new Set();
    const row = new Array(classes.length).fill("");

    // Day 1: class teachers take their own class first.
    if (d === 0) {
      classes.forEach((cls, cIdx) => {
        const ct = String(cls.classTeacher || "").trim();
        if (ct && teacherList.includes(ct) && !dayAssigned.has(ct)) {
          row[cIdx] = ct;
          dayAssigned.add(ct);
          counts[ct]++;
        }
      });
    }

    for (let cIdx = 0; cIdx < classes.length; cIdx++) {
      if (row[cIdx]) continue;
      const cls = classes[cIdx];
      const base = teacherList.filter((n) => !dayAssigned.has(n));
      if (!base.length) continue; // more classes than teachers

      // 1) under cap AND not their designated off day — prefer subject/grade fit
      let pool = base.filter((n) => counts[n] < offCap && offDay.get(n) !== d);
      let byPreference = true;
      // 2) under cap (sacrifice the designated off day, keep a day off overall)
      if (!pool.length) pool = base.filter((n) => counts[n] < offCap);
      // 3) last resort: someone must lose their day off — pick least loaded
      if (!pool.length) {
        pool = base;
        byPreference = false;
      }

      pool.sort((a, b) =>
        byPreference
          ? tierOf(a, cls) - tierOf(b, cls) || counts[a] - counts[b] || a.localeCompare(b)
          : counts[a] - counts[b] || tierOf(a, cls) - tierOf(b, cls) || a.localeCompare(b)
      );
      const pick = pool[0];
      row[cIdx] = pick;
      dayAssigned.add(pick);
      counts[pick]++;
    }
    assignments.push(row);
  }
  return assignments;
}

function SelectDatesModal({ open, days, onClose, onSave }) {
  const [rows, setRows] = useState(days);

  useEffect(() => {
    if (open) setRows(days.map((d) => ({ ...d })));
  }, [open, days]);

  if (!open) return null;

  const update = (i, field, value) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const save = () => {
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].date) {
        alert(`Select a date for day ${i + 1}.`);
        return;
      }
      if (!rows[i].startTime || !rows[i].endTime) {
        alert(`Enter start and end time for day ${i + 1}.`);
        return;
      }
    }
    const dates = rows.map((r) => r.date);
    if (new Set(dates).size !== dates.length) {
      alert("Each day must have a different date.");
      return;
    }
    onSave(rows);
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-labelledby="invig-dates-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="invig-dates-title" className="modal-title">Select exam dates</h3>
        <div className="period-table-wrap settings-form-compact">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: "3rem" }}>S.no</th>
                <th>Date</th>
                <th>Start time</th>
                <th>End time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input type="date" value={r.date} onChange={(e) => update(i, "date", e.target.value)} />
                  </td>
                  <td>
                    <input type="time" value={r.startTime} onChange={(e) => update(i, "startTime", e.target.value)} />
                  </td>
                  <td>
                    <input type="time" value={r.endTime} onChange={(e) => update(i, "endTime", e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save dates</button>
        </div>
      </div>
    </div>
  );
}

function RelievingSlotsModal({ open, slots, onClose, onSave }) {
  const [rows, setRows] = useState(slots);

  useEffect(() => {
    if (open) setRows(slots.map((s) => ({ ...s })));
  }, [open, slots]);

  if (!open) return null;

  const update = (i, field, value) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const save = () => {
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].startTime || !rows[i].endTime) {
        alert(`Enter start and end time for relieving slot ${i + 1}.`);
        return;
      }
    }
    onSave(rows);
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-labelledby="invig-relslots-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="invig-relslots-title" className="modal-title">Relieving slot timings</h3>
        <div className="period-table-wrap settings-form-compact">
          <table className="period-table">
            <thead>
              <tr>
                <th style={{ width: "3rem" }}>S.no</th>
                <th>Start time</th>
                <th>End time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input type="time" value={r.startTime} onChange={(e) => update(i, "startTime", e.target.value)} />
                  </td>
                  <td>
                    <input type="time" value={r.endTime} onChange={(e) => update(i, "endTime", e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save slots</button>
        </div>
      </div>
    </div>
  );
}

export default function InvigilationsPage() {
  const allTeachers = useMemo(() => loadTeachers().map((t) => t.name), []);
  const allClasses = useMemo(() => loadClassesList(), []);
  const institution = useMemo(() => loadInstitutionName(), []);
  const isFree = useMemo(() => !["prime", "pro"].includes(getCurrentUser()?.userType || "free"), []);

  const saved = useMemo(() => readUserJson(STORAGE_KEY, null), []);

  const [selectedTeachers, setSelectedTeachers] = useState(() => saved?.selectedTeachers ?? []);
  const [selectedClassIds, setSelectedClassIds] = useState(() => saved?.selectedClassIds ?? []);
  const [examName, setExamName] = useState(() => saved?.examName ?? "");
  const [relieving, setRelieving] = useState(() => saved?.relieving ?? "no");
  const [numDays, setNumDays] = useState(() => saved?.numDays ?? "");
  const [days, setDays] = useState(() => saved?.days ?? []);
  const [instructions, setInstructions] = useState(() => saved?.instructions ?? "");
  // The generated grid always starts blank — a saved invigilation is only
  // shown when the user picks it from the dropdown.
  const [assignments, setAssignments] = useState(null);
  const [genTeachers, setGenTeachers] = useState([]);
  const [genClasses, setGenClasses] = useState([]);
  const [showDates, setShowDates] = useState(false);
  const [invigName, setInvigName] = useState("");
  const [savedList, setSavedList] = useState(() => readUserJson(SAVED_KEY, []));
  const [search, setSearch] = useState("");
  // Relieving configuration + generated relieving duties
  const [numRelSlots, setNumRelSlots] = useState(() => saved?.numRelSlots ?? "");
  const [relSlots, setRelSlots] = useState(() => saved?.relSlots ?? []);
  const [showRelSlots, setShowRelSlots] = useState(false);
  const [relievingAssignments, setRelievingAssignments] = useState(null);
  // Day currently shown in the day-wise result view
  const [viewDay, setViewDay] = useState(0);

  // Persist the entry-form fields (the generated grid is saved only via
  // "Save invigilation"). Debounced: typing does not fire a write per
  // keystroke — one save happens shortly after changes stop.
  useEffect(() => {
    const timer = setTimeout(() => {
      writeUserJson(STORAGE_KEY, {
        selectedTeachers,
        selectedClassIds,
        examName,
        relieving,
        numDays,
        days,
        instructions,
        numRelSlots,
        relSlots,
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedTeachers, selectedClassIds, examName, relieving, numDays, days, instructions, numRelSlots, relSlots]);

  // ── Saved invigilations (by name) ────────────────────────────────────
  const saveInvigilation = () => {
    if (!assignments) {
      alert("Generate an invigilation first.");
      return;
    }
    const name = invigName.trim();
    if (!name) {
      alert("Enter a name for the invigilation before saving.");
      return;
    }
    const entry = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      savedAt: new Date().toISOString(),
      selectedTeachers,
      selectedClassIds,
      examName,
      relieving,
      numDays,
      days,
      instructions,
      assignments,
      genTeachers,
      genClasses,
      numRelSlots,
      relSlots,
      relievingAssignments,
    };
    setSavedList((prev) => {
      const replacing = prev.some((e) => e.name.toLowerCase() === name.toLowerCase());
      const next = [entry, ...prev.filter((e) => e.name.toLowerCase() !== name.toLowerCase())];
      writeUserJson(SAVED_KEY, next);
      flushPendingSyncs();
      alert(replacing ? `Invigilation "${name}" updated.` : `Invigilation "${name}" saved.`);
      return next;
    });
  };

  const loadInvigilation = (entry) => {
    setSelectedTeachers(entry.selectedTeachers ?? []);
    setSelectedClassIds(entry.selectedClassIds ?? []);
    setExamName(entry.examName ?? "");
    setRelieving(entry.relieving ?? "no");
    setNumDays(entry.numDays ?? "");
    setDays(entry.days ?? []);
    setInstructions(entry.instructions ?? "");
    setAssignments(entry.assignments ?? null);
    setGenTeachers(entry.genTeachers ?? []);
    setGenClasses(entry.genClasses ?? []);
    setInvigName(entry.name ?? "");
    setNumRelSlots(entry.numRelSlots ?? "");
    setRelSlots(entry.relSlots ?? []);
    setRelievingAssignments(entry.relievingAssignments ?? null);
    setViewDay(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteInvigilation = (id, name) => {
    if (!window.confirm(`Delete saved invigilation "${name}"?`)) return;
    setSavedList((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeUserJson(SAVED_KEY, next);
      return next;
    });
  };

  const filteredSaved = savedList.filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      String(e.examName || "").toLowerCase().includes(q)
    );
  });

  const toggleTeacher = (name) => {
    setSelectedTeachers((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  const toggleClass = (id) => {
    setSelectedClassIds((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };

  const toggleAllTeachers = () => {
    setSelectedTeachers((prev) => (prev.length === allTeachers.length ? [] : [...allTeachers]));
  };

  const toggleAllClasses = () => {
    setSelectedClassIds((prev) => (prev.length === allClasses.length ? [] : allClasses.map((c) => c.id)));
  };

  const openDates = () => {
    const n = Number(numDays);
    if (!n || n < 1 || n > 31) {
      alert("Enter a valid number of days (1–31) first.");
      return;
    }
    setDays((prev) => {
      const next = [];
      for (let i = 0; i < n; i++) next.push(prev[i] ? { ...prev[i] } : emptyDay());
      return next;
    });
    setShowDates(true);
  };

  const openRelSlots = () => {
    const n = Number(numRelSlots);
    if (!n || n < 1 || n > 6) {
      alert("Enter a valid number of relieving slots (1–6) first.");
      return;
    }
    setRelSlots((prev) => {
      const next = [];
      for (let i = 0; i < n; i++) next.push(prev[i] ? { ...prev[i] } : { startTime: "", endTime: "" });
      return next;
    });
    setShowRelSlots(true);
  };

  const generate = () => {
    const n = Number(numDays);
    if (!examName.trim()) {
      alert("Enter the name of the examination.");
      return;
    }
    if (!selectedTeachers.length) {
      alert("Select at least one teacher.");
      return;
    }
    if (!selectedClassIds.length) {
      alert("Select at least one class.");
      return;
    }
    if (!n || n < 1) {
      alert("Enter the number of days.");
      return;
    }
    if (days.length !== n || days.some((d) => !d.date)) {
      alert('Click "Select dates" and set a date for every day first.');
      return;
    }
    if (selectedTeachers.length < selectedClassIds.length) {
      alert(
        `You selected ${selectedClassIds.length} classes but only ${selectedTeachers.length} teachers — every class needs one invigilator per day. Select more teachers or fewer classes.`
      );
      return;
    }
    const nSlots = Number(numRelSlots);
    if (relieving === "yes") {
      if (!nSlots || nSlots < 1) {
        alert("Relieving is set to Yes — enter the number of relieving slots.");
        return;
      }
      if (relSlots.length !== nSlots || relSlots.some((s) => !s.startTime || !s.endTime)) {
        alert('Click "Set slot timings" and enter timings for every relieving slot first.');
        return;
      }
    }

    // Clear any previously generated sheet (including manual swaps) so the
    // new one is built completely fresh.
    setAssignments(null);
    setGenTeachers([]);
    setGenClasses([]);
    setRelievingAssignments(null);
    setViewDay(0);

    const classes = selectedClassIds
      .map((id) => allClasses.find((c) => c.id === id))
      .filter(Boolean);

    // Which teachers teach which class (primary + additional), from class lessons.
    const lessonsMap = loadClassLessonsMap();
    const lessonTeachersByClassId = new Map();
    for (const cls of allClasses) {
      const names = new Set();
      const rows = Array.isArray(lessonsMap[cls.id]) ? lessonsMap[cls.id] : [];
      for (const row of rows) {
        const primary = String(row.primaryTeacher || "").trim();
        if (primary) names.add(primary);
        for (const extra of Array.isArray(row.additionalTeachers) ? row.additionalTeachers : []) {
          const nm = String(extra || "").trim();
          if (nm) names.add(nm);
        }
      }
      lessonTeachersByClassId.set(cls.id, names);
    }

    setGenClasses(classes.map((c) => ({ id: c.id, name: classDisplayName(c) })));
    setGenTeachers([...selectedTeachers]);
    const result = generateAssignments({
      teacherList: [...selectedTeachers],
      classes,
      numDays: n,
      allClasses,
      lessonTeachersByClassId,
    });
    setAssignments(result);

    // Relieving duties: every class gets exactly ONE relieving — in slot 1 or
    // slot 2 (or later). Teachers who are free (OFF — not invigilating that
    // day) cover them: slot 1 is filled first with all the free teachers, the
    // overflow classes move to slot 2 where the same free teachers take a
    // second (different) class, and so on. A teacher never has two classes in
    // the same slot.
    if (relieving === "yes") {
      const rel = [];
      const missing = [];
      for (let d = 0; d < n; d++) {
        const busy = new Set(result[d].filter(Boolean));
        const free = selectedTeachers.filter((t) => !busy.has(t));
        // daySlots[s][c] = teacher relieving class c during slot s (or "")
        const daySlots = Array.from({ length: nSlots }, () => new Array(classes.length).fill(""));

        for (let c = 0; c < classes.length; c++) {
          if (!free.length) {
            missing.push(`${classDisplayName(classes[c])} — ${formatDate(days[d]?.date)}`);
            continue;
          }
          const slotIdx = Math.floor(c / free.length);
          if (slotIdx >= nSlots) {
            // All slots exhausted — this class gets no relieving.
            missing.push(`${classDisplayName(classes[c])} — ${formatDate(days[d]?.date)}`);
            continue;
          }
          daySlots[slotIdx][c] = free[c % free.length];
        }
        rel.push(daySlots);
      }
      setRelievingAssignments(rel);

      if (missing.length) {
        alert(
          `⚠ Some classes are not getting any relieving (not enough free teachers × slots that day):\n\n` +
            `${missing.slice(0, 15).join("\n")}${missing.length > 15 ? `\n…and ${missing.length - 15} more` : ""}\n\n` +
            `Add more relieving slots or select more teachers so every class gets one relieving.`
        );
      }
    }

    // Warn if some teachers could not get a day off (not enough teachers).
    if (n > 1) {
      const dutyCounts = {};
      for (const row of result) for (const t of row) if (t) dutyCounts[t] = (dutyCounts[t] || 0) + 1;
      const noDayOff = Object.keys(dutyCounts).filter((t) => dutyCounts[t] >= n);
      if (noDayOff.length) {
        alert(
          `⚠ Not enough teachers for everyone to get a day off.\n\n` +
            `${classes.length} classes × ${n} days = ${classes.length * n} duties, but ` +
            `${selectedTeachers.length} teachers with one day off each can cover only ` +
            `${selectedTeachers.length * (n - 1)}.\n\n` +
            `Working all ${n} days: ${noDayOff.join(", ")}.\n\n` +
            `Select more teachers to avoid this.`
        );
      }
    }
  };

  // ── Derived grid data ────────────────────────────────────────────────
  const gridTeachers = useMemo(() => {
    if (!assignments) return [];
    const inGrid = new Set(assignments.flat().filter(Boolean));
    const ordered = genTeachers.filter((t) => inGrid.has(t) || genTeachers.includes(t));
    // include any replacement teachers not in the original selection
    for (const name of inGrid) if (!ordered.includes(name)) ordered.push(name);
    return ordered;
  }, [assignments, genTeachers]);

  const cellFor = (teacher, dayIdx) => {
    if (!assignments) return [];
    const row = assignments[dayIdx] || [];
    const cls = [];
    row.forEach((t, cIdx) => {
      if (t === teacher) cls.push(genClasses[cIdx]?.name ?? `Class ${cIdx + 1}`);
    });
    return cls;
  };

  const countFor = (teacher) => {
    if (!assignments) return 0;
    return assignments.flat().filter((t) => t === teacher).length;
  };

  /**
   * Change the invigilator for a class on the shown day. Swap semantics: if
   * the chosen teacher already covers another class that day, that class
   * takes this class's previous teacher instead.
   */
  const changeInvigilator = (classIdx, newTeacher) => {
    setAssignments((prev) => {
      const next = prev.map((r) => [...r]);
      const row = next[viewDay];
      const old = row[classIdx];
      if (!newTeacher) {
        row[classIdx] = "";
        return next;
      }
      const otherIdx = row.findIndex((t) => t === newTeacher);
      row[classIdx] = newTeacher;
      if (otherIdx >= 0 && otherIdx !== classIdx) row[otherIdx] = old || "";
      return next;
    });
  };

  /** Change a relieving cell (slot s, class c) on the shown day. */
  const updateRelieving = (slotIdx, classIdx, name) => {
    setRelievingAssignments((prev) => {
      if (!prev) return prev;
      const next = prev.map((day) => day.map((r) => [...r]));
      next[viewDay][slotIdx][classIdx] = name;
      return next;
    });
  };

  const downloadPdf = () => {
    if (window.__smartSchedulerPrint) window.__smartSchedulerPrint();
    else window.print();
  };

  return (
    <div className="page-content">
      <section className="card">
        <div className="card-head--split">
          <h2 className="card-title">Create Invigilations</h2>
          {savedList.length > 0 && (
            <select
              className="subst-select"
              style={{ margin: 0, maxWidth: "18rem" }}
              value=""
              onChange={(e) => {
                const entry = savedList.find((s) => s.id === e.target.value);
                if (entry) loadInvigilation(entry);
              }}
            >
              <option value="">Load saved invigilation…</option>
              {savedList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <p className="card-desc">
          Select the teachers and classes, set the exam schedule, then generate a balanced invigilation
          duty sheet — each teacher gets a day off where possible.
        </p>

        <div className="invig-form">
          {/* Teacher + class pickers */}
          <div className="invig-pickers">
            <div className="invig-picker">
              <div className="field-label-row">
                <span className="field-label">Select teachers ({selectedTeachers.length}/{allTeachers.length})</span>
                <button type="button" className="link-btn" onClick={toggleAllTeachers}>
                  {selectedTeachers.length === allTeachers.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="teacher-pick">
                {allTeachers.length === 0 ? (
                  <p className="dual-panel__empty">No teachers found — add them in General Settings.</p>
                ) : (
                  allTeachers.map((name) => (
                    <label key={name} className="teacher-pick-row">
                      <input
                        type="checkbox"
                        className="teacher-check"
                        checked={selectedTeachers.includes(name)}
                        onChange={() => toggleTeacher(name)}
                      />
                      <span className="teacher-name">{name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="invig-picker">
              <div className="field-label-row">
                <span className="field-label">Select classes ({selectedClassIds.length}/{allClasses.length})</span>
                <button type="button" className="link-btn" onClick={toggleAllClasses}>
                  {selectedClassIds.length === allClasses.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="teacher-pick">
                {allClasses.length === 0 ? (
                  <p className="dual-panel__empty">No classes found — add them in General Settings.</p>
                ) : (
                  allClasses.map((c) => (
                    <label key={c.id} className="teacher-pick-row">
                      <input
                        type="checkbox"
                        className="teacher-check"
                        checked={selectedClassIds.includes(c.id)}
                        onChange={() => toggleClass(c.id)}
                      />
                      <span className="teacher-name">{classDisplayName(c)}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Exam details */}
          <div className="invig-fields">
            <label className="auth-field">
              <span className="field-label">Name of the examination</span>
              <input
                type="text"
                className="field-input"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="e.g. Half-Yearly Examination 2026"
              />
            </label>

            <div className="auth-field">
              <span className="field-label">Relieving required</span>
              <div className="print-radio-group">
                <label className="print-radio">
                  <input type="radio" name="relieving" checked={relieving === "yes"} onChange={() => setRelieving("yes")} />
                  Yes
                </label>
                <label className="print-radio">
                  <input type="radio" name="relieving" checked={relieving === "no"} onChange={() => setRelieving("no")} />
                  No
                </label>
              </div>
            </div>

            {relieving === "yes" && (
              <div className="auth-field">
                <span className="field-label">No. of relieving slots</span>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    className="field-input"
                    style={{ maxWidth: "6rem" }}
                    value={numRelSlots}
                    onChange={(e) => setNumRelSlots(e.target.value)}
                  />
                  <button type="button" className="btn btn-outline" onClick={openRelSlots}>
                    Set slot timings
                  </button>
                  {relSlots.length > 0 && relSlots.every((s) => s.startTime && s.endTime) && (
                    <span className="field-hint">
                      {relSlots.map((s, i) => `Slot ${i + 1}: ${s.startTime}–${s.endTime}`).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            )}

            <label className="auth-field">
              <span className="field-label">No. of days</span>
              <input
                type="number"
                min="1"
                max="31"
                className="field-input"
                style={{ maxWidth: "8rem" }}
                value={numDays}
                onChange={(e) => setNumDays(e.target.value)}
              />
            </label>

            <div className="auth-field">
              <span className="field-label">Exam dates</span>
              <div className="field-row" style={{ marginBottom: 0 }}>
                <button type="button" className="btn btn-outline" onClick={openDates}>
                  Select dates
                </button>
                {days.length > 0 && days.every((d) => d.date) && (
                  <span className="field-hint">
                    {formatDate(days[0].date)} → {formatDate(days[days.length - 1].date)} ({days.length} day{days.length > 1 ? "s" : ""})
                  </span>
                )}
              </div>
            </div>

            <label className="auth-field">
              <span className="field-label">General instructions</span>
              <textarea
                className="field-input"
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Report 15 minutes before the exam starts. Mobile phones are not allowed in exam halls."
              />
            </label>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: "1rem" }}>
          <button type="button" className="btn btn-primary" onClick={generate}>
            Generate invigilation
          </button>
        </div>
      </section>

      {/* Result grid */}
      {assignments && (
        <section className="card">
          <div className="card-head--split">
            <h3 className="card-title">Invigilation duties — {examName || "Examination"}</h3>
            <div className="btn-row" style={{ marginTop: 0 }}>
              <input
                type="text"
                className="field-input invig-name-input"
                value={invigName}
                onChange={(e) => setInvigName(e.target.value)}
                placeholder="Name of the invigilation"
              />
              <button type="button" className="btn btn-primary" onClick={saveInvigilation}>
                Save
              </button>
              <button type="button" className="btn btn-primary" onClick={downloadPdf}>
                Download PDF
              </button>
            </div>
          </div>
          <p className="card-desc card-desc--tight">
            One day at a time — use the arrows to move between days. Changing an invigilator swaps
            duties with whoever had that teacher's class, so every class stays covered.
          </p>

          {/* Day navigation */}
          <div className="invig-day-nav">
            <button
              type="button"
              className="btn btn-outline invig-day-nav__arrow"
              onClick={() => setViewDay((i) => Math.max(0, i - 1))}
              disabled={viewDay === 0}
            >
              ‹
            </button>
            <div className="invig-day-nav__label">
              <strong>{formatDate(days[viewDay]?.date)}</strong>
              <span className="invig-day-nav__meta">
                Day {viewDay + 1} of {days.length} · {days[viewDay]?.startTime}–{days[viewDay]?.endTime}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-outline invig-day-nav__arrow"
              onClick={() => setViewDay((i) => Math.min(days.length - 1, i + 1))}
              disabled={viewDay >= days.length - 1}
            >
              ›
            </button>
          </div>

          {/* Day-wise table: one row per class */}
          <div className="table-wrap">
            <table className="subst-table invig-table">
              <thead>
                <tr>
                  <th className="left">Class</th>
                  <th>
                    Invigilator
                    <div className="invig-th-time">{days[viewDay]?.startTime}–{days[viewDay]?.endTime}</div>
                  </th>
                  {relievingAssignments &&
                    relSlots.map((s, i) => (
                      <th key={i}>
                        Relieving {i + 1}
                        <div className="invig-th-time">{s.startTime}–{s.endTime}</div>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {genClasses.map((cls, cIdx) => (
                  <tr key={cls.id}>
                    <td className="left"><strong>{cls.name}</strong></td>
                    <td>
                      <select
                        className="subst-select invig-cell-select"
                        value={assignments[viewDay]?.[cIdx] || ""}
                        onChange={(e) => changeInvigilator(cIdx, e.target.value)}
                      >
                        <option value="">—</option>
                        {genTeachers.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </td>
                    {relievingAssignments &&
                      relSlots.map((_, sIdx) => (
                        <td key={sIdx}>
                          <select
                            className="subst-select invig-cell-select"
                            value={relievingAssignments[viewDay]?.[sIdx]?.[cIdx] || ""}
                            onChange={(e) => updateRelieving(sIdx, cIdx, e.target.value)}
                          >
                            <option value="">—</option>
                            {genTeachers.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Teachers off on this day */}
          <p className="field-hint" style={{ marginTop: "0.6rem" }}>
            Free (OFF) today:{" "}
            {genTeachers.filter((t) => !(assignments[viewDay] || []).includes(t)).join(", ") || "none"}
          </p>

          <details style={{ marginTop: "0.75rem" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600 }}>
              Teacher totals (whole exam)
            </summary>
            <div className="table-wrap" style={{ marginTop: "0.5rem", maxWidth: "26rem" }}>
              <table className="subst-table invig-table">
                <thead>
                  <tr>
                    <th className="left">Teacher</th>
                    <th>No. of invigilations</th>
                  </tr>
                </thead>
                <tbody>
                  {gridTeachers.map((teacher) => (
                    <tr key={teacher}>
                      <td className="left">{teacher}</td>
                      <td><strong>{countFor(teacher)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}

      {/* Saved invigilations */}
      <section className="card">
        <div className="card-head--split">
          <h3 className="card-title">Saved invigilations ({savedList.length})</h3>
          <div className="btn-row" style={{ marginTop: 0 }}>
            <input
              type="search"
              className="field-input"
              style={{ maxWidth: "16rem" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or exam…"
            />
            <button type="button" className="btn btn-outline" onClick={() => setSearch(search.trim())}>
              Search
            </button>
          </div>
        </div>
        {savedList.length === 0 ? (
          <p className="card-desc">
            No invigilations saved yet. Generate one, give it a name, and click &quot;Save invigilation&quot;.
          </p>
        ) : filteredSaved.length === 0 ? (
          <p className="card-desc">No saved invigilation matches &quot;{search}&quot;.</p>
        ) : (
            <div className="table-wrap">
              <table className="subst-table">
                <thead>
                  <tr>
                    <th className="left">Name</th>
                    <th className="left">Examination</th>
                    <th>Days</th>
                    <th>Saved on</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSaved.map((e) => (
                    <tr key={e.id}>
                      <td className="left"><strong>{e.name}</strong></td>
                      <td className="left">{e.examName || "—"}</td>
                      <td>{e.days?.length ?? "—"}</td>
                      <td>{e.savedAt ? new Date(e.savedAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td>
                        <div className="classes-actions-cell">
                          <button type="button" className="link-btn" onClick={() => loadInvigilation(e)}>
                            Load
                          </button>
                          <button
                            type="button"
                            className="link-btn link-btn--danger"
                            onClick={() => deleteInvigilation(e.id, e.name)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      <SelectDatesModal open={showDates} days={days} onClose={() => setShowDates(false)} onSave={setDays} />

      <RelievingSlotsModal
        open={showRelSlots}
        slots={relSlots}
        onClose={() => setShowRelSlots(false)}
        onSave={setRelSlots}
      />

      {/* Print sheet (visible only during print) */}
      {assignments &&
        createPortal(
          <div className={`print-sheet print-sheet--invig${isFree ? " print-sheet--watermark" : ""}`}>
            {/* Outer layout table so the heading repeats on every printed page */}
            <table className="invig-print-layout">
              <thead>
                <tr>
                  <td>
                    <div className="invig-print-head">
                      <h1 className="invig-print-school">{institution || "School"}</h1>
                      <h2 className="invig-print-title">Invigilation Sheet</h2>
                      <h3 className="invig-print-exam">{examName || "Examination"}</h3>
                    </div>
                  </td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    {instructions.trim() && (
                      <div className="invig-print-instructions">
                        <h4>General instructions</h4>
                        <p>{instructions}</p>
                      </div>
                    )}

                    {/* Day-wise pages (invigilator + relieving per class) */}
                    {relieving === "yes" &&
                      relievingAssignments &&
                      days.map((d, dIdx) => (
                        <div className="invig-print-day" key={dIdx}>
                          <h4 className="invig-print-day-title">
                            {formatDate(d.date)} — Day {dIdx + 1} ({d.startTime}–{d.endTime})
                          </h4>
                          <table className="invig-print-grid">
                            <thead>
                              <tr>
                                <th>Class</th>
                                <th>
                                  Invigilator
                                  <span className="invig-print-time">{d.startTime}–{d.endTime}</span>
                                </th>
                                {relSlots.map((s, i) => (
                                  <th key={i}>
                                    Relieving {i + 1}
                                    <span className="invig-print-time">{s.startTime}–{s.endTime}</span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {genClasses.map((cls, cIdx) => (
                                <tr key={cls.id}>
                                  <td className="invig-print-name">{cls.name}</td>
                                  <td>{assignments[dIdx]?.[cIdx] || "—"}</td>
                                  {relSlots.map((_, sIdx) => (
                                    <td key={sIdx} className={relievingAssignments[dIdx]?.[sIdx]?.[cIdx] ? "" : "invig-print-off"}>
                                      {relievingAssignments[dIdx]?.[sIdx]?.[cIdx] || "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    <table className="invig-print-grid">
                      <thead>
                        <tr>
                          <th>Teacher</th>
                          {days.map((d, i) => (
                            <th key={i}>
                              {formatDate(d.date)}
                              <span className="invig-print-time">{d.startTime}–{d.endTime}</span>
                            </th>
                          ))}
                          <th>No. of invigilations</th>
                          <th className="invig-print-sign">Sign</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gridTeachers.map((teacher) => (
                          <tr key={teacher}>
                            <td className="invig-print-name">{teacher}</td>
                            {days.map((_, dIdx) => {
                              const cls = cellFor(teacher, dIdx);
                              return (
                                <td key={dIdx} className={cls.length ? "" : "invig-print-off"}>
                                  {cls.length ? cls.join(", ") : "OFF"}
                                </td>
                              );
                            })}
                            <td className="invig-print-total">{countFor(teacher)}</td>
                            <td className="invig-print-sign-cell" />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>,
          document.body
        )}
    </div>
  );
}
