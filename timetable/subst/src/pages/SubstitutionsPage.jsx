import { useEffect, useMemo, useState } from "react";
import { buildSubstitutionDataset } from "../lib/substitutionData";
import { getDayName, isSchoolDay } from "../lib/dates";
import {
  buildWorkloadReport,
  clearAssignmentsForDate,
  countSubstitutionsForTeacherInRange,
  listSavedSubstitutionDates,
  loadAssignmentsForDate,
  loadLastSubstitutionDate,
  saveAssignmentsForDate,
  saveLastSubstitutionDate,
  weekBoundsISO,
} from "../lib/assignmentsStorage";
import { parseSlot } from "../lib/substituteLogic";
import {
  MAX_WEEKLY_TOTAL,
  buildSubstitutionRows,
  freeTeachersForSlot,
  workloadDisplay,
} from "../lib/substituteLogic";
import "../App.css";

const LABEL_DATE = "Date";
const LABEL_LEAVE = "Teachers on leave";
const LABEL_RANGE_START = "Week / range start";
const LABEL_RANGE_END = "Week / range end";

function inputWidthCh(label, floorCh = 8) {
  return `${Math.max(floorCh, label.length + 2)}ch`;
}

function slotLabelFromParts(classRef, subjectRef) {
  const cls = String(classRef || "").trim();
  const sub = String(subjectRef || "").trim();
  if (!cls) return "";
  return sub ? `${cls} ${sub}` : cls;
}

function hydrateRowsFromSaved(savedRows, dayName, teacherTimetable) {
  return savedRows.map((r) => {
    let slot = r.slot || slotLabelFromParts(r.classRef, r.subjectRef);
    if (!slot && r.absentTeacher && dayName) {
      const sched = teacherTimetable[r.absentTeacher]?.[dayName];
      const cell = sched?.[r.period - 1];
      if (cell) slot = cell;
    }
    const parsed = parseSlot(slot);
    return {
      id: crypto.randomUUID(),
      absentTeacher: r.absentTeacher,
      period: r.period,
      slot: slot || "—",
      classRef: parsed?.classRef ?? r.classRef ?? "",
      subjectRef: parsed?.subjectRef ?? r.subjectRef ?? "",
      substituteTeacher: r.substituteTeacher || "",
    };
  });
}

export default function SubstitutionsPage() {
  const dataset = useMemo(() => buildSubstitutionDataset(), []);

  const {
    ok: dataOk,
    errors: dataErrors,
    teacherList,
    baseByName,
    teacherTimetable,
    teachesMap,
    periodsPerDay,
    daysPerWeek,
  } = dataset;

  const teacherPanelCh = useMemo(() => {
    const longestName = teacherList.reduce((m, n) => Math.max(m, n.length), 0);
    return Math.max(LABEL_LEAVE.length, longestName) + 2;
  }, [teacherList]);

  const [substitutionDate, setSubstitutionDate] = useState("");
  const [leaveTeachers, setLeaveTeachers] = useState([]);
  const [rows, setRows] = useState([]);
  const [weekReportStart, setWeekReportStart] = useState("");
  const [weekReportEnd, setWeekReportEnd] = useState("");
  const [substitutionsDirty, setSubstitutionsDirty] = useState(false);
  const [saveVersion, setSaveVersion] = useState(0);

  const savedDates = useMemo(() => listSavedSubstitutionDates(), [saveVersion]);

  const dayName = substitutionDate ? getDayName(substitutionDate) : null;
  const schoolDay =
    substitutionDate && dayName ? isSchoolDay(substitutionDate, daysPerWeek) : false;
  const dayInTimetable = dayName && dataset.dayNames?.includes(dayName);

  const liveOverrides = useMemo(() => {
    if (!substitutionDate || !rows.length) return {};
    return { [substitutionDate]: rows };
  }, [substitutionDate, rows]);

  const weekBounds = substitutionDate ? weekBoundsISO(substitutionDate) : null;

  const subsCountForWorkload = (teacherName, rangeStart, rangeEnd) => {
    if (!rangeStart || !rangeEnd || !teacherName) return 0;
    return countSubstitutionsForTeacherInRange(teacherName, rangeStart, rangeEnd, liveOverrides);
  };

  useEffect(() => {
    const last = loadLastSubstitutionDate();
    if (last && !substitutionDate) {
      setSubstitutionDate(last);
    }
  }, []);

  useEffect(() => {
    if (!substitutionDate || !dataOk || !dayName) {
      if (!substitutionDate) setRows([]);
      return;
    }

    saveLastSubstitutionDate(substitutionDate);
    const saved = loadAssignmentsForDate(substitutionDate);
    setSubstitutionsDirty(false);
    if (!saved?.rows?.length) {
      setRows([]);
      if (saved?.leaveTeachers?.length) {
        setLeaveTeachers(saved.leaveTeachers);
      }
      return;
    }

    setRows(hydrateRowsFromSaved(saved.rows, dayName, teacherTimetable));
    if (saved.leaveTeachers?.length) {
      setLeaveTeachers(saved.leaveTeachers);
    } else {
      const absent = [...new Set(saved.rows.map((r) => r.absentTeacher).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      );
      setLeaveTeachers(absent);
    }
  }, [substitutionDate, dataOk, dayName, teacherTimetable]);

  const workloadReport = useMemo(() => {
    if (!dataOk || !weekReportStart || !weekReportEnd || weekReportStart > weekReportEnd) {
      return null;
    }
    return buildWorkloadReport(teacherList, baseByName, weekReportStart, weekReportEnd);
  }, [dataOk, weekReportStart, weekReportEnd, teacherList, baseByName, saveVersion]);

  const toggleLeaveTeacher = (name) => {
    setLeaveTeachers((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name].sort((a, b) => a.localeCompare(b)),
    );
  };

  const handleReset = () => {
    if (substitutionDate) clearAssignmentsForDate(substitutionDate);
    setSubstitutionDate("");
    setLeaveTeachers([]);
    setRows([]);
    setWeekReportStart("");
    setWeekReportEnd("");
    setSubstitutionsDirty(false);
  };

  const saveSubstitutions = () => {
    if (!substitutionDate) {
      alert("Select a date first.");
      return;
    }
    if (!rows.length) {
      alert("No substitutions to save. Run Substitute first.");
      return;
    }
    const ok = saveAssignmentsForDate(substitutionDate, rows, { leaveTeachers });
    if (!ok) {
      alert("Could not save substitutions.");
      return;
    }
    setSubstitutionsDirty(false);
    setSaveVersion((v) => v + 1);
    alert(
      `Substitutions saved for ${substitutionDate}. They are stored permanently and will be available after you reload the app.`
    );
  };

  const runSubstitute = () => {
    if (!dataOk) {
      alert(dataErrors.join("\n"));
      return;
    }
    if (!substitutionDate) {
      alert("Please select a date.");
      return;
    }
    if (!schoolDay) {
      alert("Selected date is not a school day for your saved schedule.");
      return;
    }
    if (!dayInTimetable) {
      alert(`${dayName} is not in the generated timetable (${dataset.dayNames?.join(", ")}).`);
      return;
    }
    if (!leaveTeachers.length) {
      alert("Select at least one teacher on leave.");
      return;
    }

    for (const t of leaveTeachers) {
      if (!teacherTimetable[t]?.[dayName]) {
        alert(`No timetable for ${t} on ${dayName}. Check the generated Time Table.`);
        return;
      }
    }

    const weekStart = weekBounds?.mondayISO;
    const weekEnd = weekBounds?.sundayISO;
    const storedWeekExcludingToday = (name) => {
      if (!weekStart || !weekEnd) return 0;
      return countSubstitutionsForTeacherInRange(name, weekStart, weekEnd, {
        [substitutionDate]: [],
      });
    };

    const next = buildSubstitutionRows({
      leaveTeachers,
      dayName,
      teacherTimetable,
      teachesMap,
      baseByName,
      storedWeekSubsExcludingToday: storedWeekExcludingToday,
      periodsPerDay,
    });

    setRows(next);
    setSubstitutionsDirty(true);
  };

  const updateSubstitute = (id, newName) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, substituteTeacher: newName } : r)));
    setSubstitutionsDirty(true);
  };

  const downloadSubstitutionsCsv = () => {
    if (!substitutionDate) {
      alert("Select a date first.");
      return;
    }
    if (!rows.length) {
      alert("No substitutions to download. Run Substitute first.");
      return;
    }

    const header = [
      "S.no",
      "Date",
      "Teacher on leave",
      "Class / slot",
      "Period",
      "Substitute",
      "Base workload",
      "Substitutions this week",
      "Total workload",
    ];
    const lines = [header];

    rows.forEach((r, i) => {
      const sub = r.substituteTeacher;
      const wl = workloadDisplay({
        teacherName: sub,
        baseByName,
        substitutionCount: weekBounds
          ? subsCountForWorkload(sub, weekBounds.mondayISO, weekBounds.sundayISO)
          : 0,
      });
      lines.push([
        String(i + 1),
        substitutionDate,
        r.absentTeacher,
        r.slot,
        String(r.period),
        sub || "",
        sub ? String(wl.base) : "",
        sub ? String(wl.subs) : "",
        sub ? String(wl.total) : "",
      ]);
    });

    const esc = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + lines.map((row) => row.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `substitutions-${substitutionDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadWorkloadCsv = () => {
    if (!weekReportStart || !weekReportEnd) {
      alert("Enter both start and end dates for the report.");
      return;
    }
    if (weekReportStart > weekReportEnd) {
      alert("Start date must be on or before end date.");
      return;
    }

    if (!workloadReport) {
      alert("Enter a valid date range.");
      return;
    }

    const lines = [["Teacher", "Base workload", "Substitutions in range", "Total"]];
    for (const row of workloadReport) {
      lines.push([row.name, String(row.base), String(row.substitutions), String(row.total)]);
    }

    const esc = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + lines.map((row) => row.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teacher-workload-${weekReportStart}-to-${weekReportEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-content">
      {!dataOk && (
        <section className="card">
          <h2 className="card-title">Substitutions</h2>
          <div className="timetable-alert timetable-alert--error" role="alert">
            <p>Substitution data comes from your saved General Settings and generated Time Table only.</p>
            <ul>
              {dataErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {dataOk && (
        <p className="card-desc subst-data-note">
          Using generated class timetable and Teachers / Classes / School settings. Saved substitutions are
          stored in the app database (browser storage) and reload automatically.
          {savedDates.length > 0 && (
            <>
              {" "}
              <strong>{savedDates.length}</strong> date{savedDates.length === 1 ? "" : "s"} saved
              {savedDates.length <= 5 ? `: ${savedDates.join(", ")}` : ` (latest: ${savedDates.slice(0, 3).join(", ")}…)`}.
            </>
          )}
        </p>
      )}

      <section className="card card-leave">
        <div className="card-head">
          <h2 className="card-title">Leave day</h2>
          <p className="card-desc">Pick the date and who is absent, then generate substitutes.</p>
        </div>

        <div className="field-row">
          <label className="field-label" htmlFor="d">
            {LABEL_DATE}
          </label>
          <input
            id="d"
            type="date"
            className="field-input field-input--date"
            style={{ width: inputWidthCh(LABEL_DATE, 11) }}
            value={substitutionDate}
            disabled={!dataOk}
            onChange={(e) => setSubstitutionDate(e.target.value)}
          />
          {substitutionDate && dayName && (
            <span className={`day-pill ${schoolDay && dayInTimetable ? "" : "day-pill--warn"}`}>
              {dayName}
              {!schoolDay ? " · not a school day" : !dayInTimetable ? " · not in timetable" : ""}
            </span>
          )}
        </div>

        <div className="field-block">
          <span className="field-label field-label--block">{LABEL_LEAVE}</span>
          <div
            className="teacher-pick"
            style={{ maxWidth: `${teacherPanelCh}ch` }}
            role="group"
            aria-label={LABEL_LEAVE}
          >
            {teacherList.map((name) => (
              <label key={name} className="teacher-pick-row">
                <input
                  type="checkbox"
                  className="teacher-check"
                  checked={leaveTeachers.includes(name)}
                  disabled={!dataOk}
                  onChange={() => toggleLeaveTeacher(name)}
                />
                <span className="teacher-name">{name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={runSubstitute} disabled={!dataOk}>
            Substitute
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset}>
            Reset
          </button>
        </div>
      </section>

      {rows.length > 0 && substitutionDate && dayName && (
        <section className="card card-results">
          <div className="card-head card-head--split">
            <h2 className="card-title">Substitution list</h2>
            <div className="btn-row subst-list-actions">
              <button type="button" className="btn btn-primary btn--sm" onClick={saveSubstitutions}>
                Save
              </button>
              <button type="button" className="btn btn-outline btn--sm" onClick={downloadSubstitutionsCsv}>
                Download
              </button>
            </div>
          </div>
          <p className="card-desc card-desc--tight">
            {substitutionDate} · Adjust substitutes below (workload preview updates as you edit). Click{" "}
            <strong>Save</strong> to store this day permanently (available after reload).
            {substitutionsDirty ? (
              <span className="subst-unsaved-pill"> Unsaved changes</span>
            ) : loadAssignmentsForDate(substitutionDate)?.rows?.length ? (
              <span className="subst-saved-pill"> Saved to database</span>
            ) : null}
          </p>
          <div className="table-wrap">
            <table className="subst-table">
              <thead>
                <tr>
                  <th>S.no</th>
                  <th>Teacher on leave</th>
                  <th>Class / slot</th>
                  <th>Period</th>
                  <th>Substitute</th>
                  <th>Workload (base + subs this week)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const sub = r.substituteTeacher;
                  const wl = workloadDisplay({
                    teacherName: sub,
                    baseByName,
                    substitutionCount: weekBounds
                      ? subsCountForWorkload(sub, weekBounds.mondayISO, weekBounds.sundayISO)
                      : 0,
                  });
                  const over = sub && wl.total > MAX_WEEKLY_TOTAL;
                  const options = freeTeachersForSlot({
                    leaveTeachers,
                    dayName,
                    periodIndex: r.period - 1,
                    teacherTimetable,
                    currentSubstitute: sub,
                  });

                  return (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>{r.absentTeacher}</td>
                      <td className="left">{r.slot}</td>
                      <td>{r.period}</td>
                      <td>
                        <select
                          value={sub}
                          onChange={(e) => updateSubstitute(r.id, e.target.value)}
                          className="subst-select"
                        >
                          <option value="">— none —</option>
                          {options.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={over ? "warn" : ""}>
                        {sub ? `${wl.base} + ${wl.subs} = ${wl.total}` : "—"}
                        {over ? " (over 25)" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card card-report">
        <div className="card-head">
          <h2 className="card-title">Workload report</h2>
          <p className="card-desc">Pick a date range, then download CSV for all teachers.</p>
        </div>

        <div className="field-row field-row--gap">
          <div className="field-cluster">
            <label className="field-label" htmlFor="ws">
              {LABEL_RANGE_START}
            </label>
            <input
              id="ws"
              type="date"
              className="field-input field-input--date"
              style={{ width: inputWidthCh(LABEL_RANGE_START, 11) }}
              value={weekReportStart}
              disabled={!dataOk}
              onChange={(e) => setWeekReportStart(e.target.value)}
            />
          </div>
          <div className="field-cluster">
            <label className="field-label" htmlFor="we">
              {LABEL_RANGE_END}
            </label>
            <input
              id="we"
              type="date"
              className="field-input field-input--date"
              style={{ width: inputWidthCh(LABEL_RANGE_END, 11) }}
              value={weekReportEnd}
              disabled={!dataOk}
              onChange={(e) => setWeekReportEnd(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={downloadWorkloadCsv}
          disabled={!dataOk || !workloadReport}
        >
          Download workload CSV
        </button>

        {workloadReport && (
          <div className="table-wrap subst-workload-table-wrap">
            <table className="subst-table subst-workload-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Base workload</th>
                  <th>Substitutions in range</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {workloadReport.map((row) => (
                  <tr key={row.name}>
                    <td className="left">{row.name}</td>
                    <td>{row.base}</td>
                    <td>{row.substitutions}</td>
                    <td className={row.total > MAX_WEEKLY_TOTAL ? "warn" : ""}>
                      {row.total}
                      {row.total > MAX_WEEKLY_TOTAL ? " (over 25)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="card-desc card-desc--tight">
              {weekReportStart} to {weekReportEnd} — base from teacher lessons; substitutions are saved
              assignments where this teacher was the substitute.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
