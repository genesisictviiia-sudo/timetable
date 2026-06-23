import { useEffect, useState } from "react";
import RowMoveButtons from "../../components/RowMoveButtons";
import { moveRowAtIndex } from "../../lib/reorderRows";
import { defaultSchoolConstraints, normalizeSchoolConstraints, loadSchoolStorageRaw, saveSchoolStorageRaw, clearSchoolStorage, SCHOOL_STORAGE_KEY } from "../../lib/settingsStorage";
import "../../App.css";

export { SCHOOL_STORAGE_KEY };

const PERIOD_TYPES = ["lesson", "break"];

const emptyPeriod = {
  name: "",
  startTime: "",
  endTime: "",
  type: "lesson",
  selected: false,
};

const defaultSchool = {
  schoolName: "",
  academicYear: "",
  periodsPerDay: "",
  periodsPerWeek: "",
  daysPerWeek: "",
  periods: [{ ...emptyPeriod }],
  constraints: defaultSchoolConstraints(),
};

function getDuration(startTime, endTime) {
  if (!startTime || !endTime) return "";

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const diff = end - start;

  if (diff <= 0) return "Invalid";

  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

export default function SchoolSettingsPage() {
  const [school, setSchool] = useState(defaultSchool);

  useEffect(() => {
    const parsed = loadSchoolStorageRaw();
    if (parsed) {
      setSchool({
        ...defaultSchool,
        ...parsed,
        periods: (parsed.periods || []).map((p) => ({
          ...emptyPeriod,
          ...p,
          type: PERIOD_TYPES.includes(p.type) ? p.type : "lesson",
          selected: false,
        })),
        constraints: normalizeSchoolConstraints(parsed.constraints),
      });
    }
  }, []);

  const maxPeriods = Number(school.periodsPerDay || 0) + 2;
  const periods = school.periods;
  const allPeriodsChecked = periods.length > 0 && periods.every((p) => p.selected);
  const somePeriodsChecked = periods.some((p) => p.selected);

  const updateField = (field, value) => {
    setSchool((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateConstraint = (field, value) => {
    setSchool((prev) => ({
      ...prev,
      constraints: { ...prev.constraints, [field]: value },
    }));
  };

  const updatePeriod = (index, field, value) => {
    setSchool((prev) => {
      const periods = [...prev.periods];
      periods[index] = {
        ...periods[index],
        [field]: value,
      };

      return {
        ...prev,
        periods,
      };
    });
  };

  const movePeriod = (index, direction) => {
    setSchool((prev) => ({
      ...prev,
      periods: moveRowAtIndex(prev.periods, index, direction),
    }));
  };

  const togglePeriodSelected = (index) => {
    setSchool((prev) => {
      const next = [...prev.periods];
      next[index] = { ...next[index], selected: !next[index].selected };
      return { ...prev, periods: next };
    });
  };

  const toggleSelectAllPeriods = () => {
    const next = !allPeriodsChecked;
    setSchool((prev) => ({
      ...prev,
      periods: prev.periods.map((p) => ({ ...p, selected: next })),
    }));
  };

  const deleteSelectedPeriods = () => {
    const n = periods.filter((p) => p.selected).length;
    if (!n) {
      alert("Select period rows to delete.");
      return;
    }
    if (!window.confirm(`Delete ${n} selected period row(s)?`)) return;
    setSchool((prev) => {
      const next = prev.periods.filter((p) => !p.selected);
      return { ...prev, periods: next.length ? next : [{ ...emptyPeriod }] };
    });
  };

  const addPeriod = () => {
    if (school.periods.length >= maxPeriods) {
      alert(`Maximum ${maxPeriods} rows allowed.`);
      return;
    }

    setSchool((prev) => ({
      ...prev,
      periods: [...prev.periods, { ...emptyPeriod }],
    }));
  };

  const resetForm = () => {
    setSchool(defaultSchool);
    clearSchoolStorage();
  };

  const saveForm = () => {
    if (!school.schoolName.trim()) {
      alert("Enter the school name.");
      return;
    }

    if (!school.academicYear.trim()) {
      alert("Enter the academic year.");
      return;
    }

    if (!school.periodsPerDay || Number(school.periodsPerDay) < 1) {
      alert("Enter valid periods per day.");
      return;
    }

    if (!school.daysPerWeek || Number(school.daysPerWeek) < 1 || Number(school.daysPerWeek) > 7) {
      alert("Enter valid days per week between 1 and 7.");
      return;
    }
    if (!school.periodsPerWeek || Number(school.periodsPerWeek) < 1) {
      alert("Enter valid periods per week.");
      return;
    }

    if (!school.periods.length) {
      alert("Add at least one period.");
      return;
    }

    for (let i = 0; i < school.periods.length; i++) {
      const period = school.periods[i];

      if (!period.name.trim()) {
        alert(`Enter name for period row ${i + 1}.`);
        return;
      }

      if (!period.startTime) {
        alert(`Enter start time for period row ${i + 1}.`);
        return;
      }

      if (!period.endTime) {
        alert(`Enter end time for period row ${i + 1}.`);
        return;
      }

      if (getDuration(period.startTime, period.endTime) === "Invalid") {
        alert(`End time must be after start time in period row ${i + 1}.`);
        return;
      }

      if (!PERIOD_TYPES.includes(period.type)) {
        alert(`Select type (lesson or break) for period row ${i + 1}.`);
        return;
      }
    }

    const c = school.constraints || defaultSchoolConstraints();
    const maxDay = c.maxClassesPerDay === "" ? "" : Number(c.maxClassesPerDay);
    const maxConsec = c.maxConsecutiveClassesPerDay === "" ? "" : Number(c.maxConsecutiveClassesPerDay);
    if (c.maxClassesPerDay !== "" && (!Number.isFinite(maxDay) || maxDay < 1)) {
      alert("Enter a valid maximum number of classes per day (1 or more), or leave blank.");
      return;
    }
    if (c.maxConsecutiveClassesPerDay !== "" && (!Number.isFinite(maxConsec) || maxConsec < 1)) {
      alert("Enter a valid limit for consecutive classes per day (1 or more), or leave blank.");
      return;
    }

    const cleanSchool = {
      schoolName: school.schoolName.trim(),
      academicYear: school.academicYear.trim(),
      periodsPerDay: Number(school.periodsPerDay),
      periodsPerWeek: Number(school.periodsPerWeek),
      daysPerWeek: Number(school.daysPerWeek),
      constraints: {
        classTeacherFirstPeriod: Boolean(c.classTeacherFirstPeriod),
        maxClassesPerDay: c.maxClassesPerDay === "" ? "" : maxDay,
        maxConsecutiveClassesPerDay: c.maxConsecutiveClassesPerDay === "" ? "" : maxConsec,
      },
      periods: school.periods.map((period, index) => ({
        sno: index + 1,
        name: period.name.trim(),
        startTime: period.startTime,
        endTime: period.endTime,
        duration: getDuration(period.startTime, period.endTime),
        type: period.type,
      })),
    };

    saveSchoolStorageRaw(cleanSchool);
    setSchool(cleanSchool);

    alert("Latest school settings saved successfully.");
  };

  return (
    <section className="card settings-panel-compact">
      <h2 className="card-title">School Settings</h2>

      <div className="school-form-grid settings-form-compact">
        <label>
          Name of the school
          <input
            type="text"
            value={school.schoolName}
            onChange={(e) => updateField("schoolName", e.target.value)}
            placeholder="Enter school name"
          />
        </label>

        <label>
          Academic year
          <input
            type="text"
            value={school.academicYear}
            onChange={(e) => updateField("academicYear", e.target.value)}
            placeholder="2025-2026"
          />
        </label>

        <label>
          Periods per day
          <input
            type="number"
            min="1"
            value={school.periodsPerDay}
            onChange={(e) => updateField("periodsPerDay", Number(e.target.value))}
          />
        </label>

        <label>
          No. of days per week
          <input
            type="number"
            min="1"
            max="7"
            value={school.daysPerWeek}
            onChange={(e) => updateField("daysPerWeek", Number(e.target.value))}
          />
        </label>
        <label>
          No. of periods per week
          <input
            type="number"
            min="1"
            value={school.periodsPerWeek}
            onChange={(e) => updateField("periodsPerWeek", e.target.value)}
          />
        </label>
      </div>

      <h3 className="settings-subtitle">Setting of periods</h3>

      <div className="period-table-wrap settings-form-compact">
        <table className="period-table">
          <thead>
            <tr>
                    <th style={{ width: "2.2rem" }}>
                      <input
                        type="checkbox"
                        checked={allPeriodsChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = somePeriodsChecked && !allPeriodsChecked;
                        }}
                        onChange={toggleSelectAllPeriods}
                        aria-label="Select all periods"
                      />
                    </th>
                    <th>S.no</th>
                    <th style={{ width: "2.6rem" }} aria-label="Reorder" />
                    <th>Name</th>
              <th>Type</th>
              <th>Start time</th>
              <th>End time</th>
              <th>Duration</th>
              <th>
                <button type="button" className="add-period-btn" onClick={addPeriod}>
                  +
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {school.periods.map((period, index) => (
              <tr key={index}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(period.selected)}
                          onChange={() => togglePeriodSelected(index)}
                          aria-label={`Select period row ${index + 1}`}
                        />
                      </td>
                      <td>{index + 1}</td>
                      <td>
                        <RowMoveButtons
                          index={index}
                          total={school.periods.length}
                          onMoveUp={() => movePeriod(index, "up")}
                          onMoveDown={() => movePeriod(index, "down")}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={period.name}
                    onChange={(e) => updatePeriod(index, "name", e.target.value)}
                    placeholder="Period name"
                  />
                </td>
                <td>
                  <select
                    value={period.type || "lesson"}
                    onChange={(e) => updatePeriod(index, "type", e.target.value)}
                  >
                    <option value="lesson">lesson</option>
                    <option value="break">break</option>
                  </select>
                </td>
                <td>
                  <input
                    type="time"
                    value={period.startTime}
                    onChange={(e) => updatePeriod(index, "startTime", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    value={period.endTime}
                    onChange={(e) => updatePeriod(index, "endTime", e.target.value)}
                  />
                </td>
                <td>{getDuration(period.startTime, period.endTime) || "—"}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="settings-action-row settings-action-row--tight">
        <button type="button" className="btn btn-ghost" onClick={deleteSelectedPeriods}>
          Delete selected periods
        </button>
      </div>

      <h3 className="settings-subtitle">Constraints</h3>
      <div className="settings-form-compact constraints-form school-constraints-block">
        <label className="constraints-check">
          <input
            type="checkbox"
            checked={school.constraints?.classTeacherFirstPeriod ?? false}
            onChange={(e) => updateConstraint("classTeacherFirstPeriod", e.target.checked)}
          />
          <span>Class teacher must take first class everyday</span>
        </label>

        <label>
          Maximum no. of classes a teacher can take a day
          <input
            type="number"
            min="1"
            value={school.constraints?.maxClassesPerDay ?? ""}
            onChange={(e) => updateConstraint("maxClassesPerDay", e.target.value)}
            placeholder="e.g. 6"
          />
        </label>

        <label>
          Limit no. of consecutive classes per day
          <input
            type="number"
            min="1"
            value={school.constraints?.maxConsecutiveClassesPerDay ?? ""}
            onChange={(e) => updateConstraint("maxConsecutiveClassesPerDay", e.target.value)}
            placeholder="e.g. 3"
          />
        </label>
      </div>

      <div className="settings-action-row">
        <button type="button" className="btn btn-ghost" onClick={resetForm}>
          Reset
        </button>
        <button type="button" className="btn btn-primary" onClick={saveForm}>
          Save
        </button>
      </div>
    </section>
  );
}
