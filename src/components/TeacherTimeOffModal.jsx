import { useEffect, useState } from "react";
import {
  loadSchoolScheduleDimensions,
  normalizeTimeOffGrid,
} from "../lib/settingsStorage";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TeacherTimeOffModal({ open, teacher, onClose, onSave }) {
  const [grid, setGrid] = useState([]);
  const [dims, setDims] = useState(null);
  const [dayLabels, setDayLabels] = useState([]);

  useEffect(() => {
    if (!open || !teacher) return;

    const schedule = loadSchoolScheduleDimensions();
    if (!schedule) {
      alert("Save School settings first (periods per day, days per week, and period list).");
      onClose();
      return;
    }

    setDims(schedule);
    setDayLabels(Array.from({ length: schedule.daysPerWeek }, (_, i) => DAY_NAMES[i] || `Day ${i + 1}`));

    setGrid(
      normalizeTimeOffGrid(
        teacher.timeOffGrid,
        schedule.daysPerWeek,
        schedule.lessonPeriodsPerDay,
        schedule.periodsPerWeek
      )
    );
  }, [open, teacher, onClose]);

  if (!open || !teacher || !dims) return null;

  const { daysPerWeek, lessonPeriodsPerDay, periodsPerWeek, periodLabels } = dims;

  const toggleCell = (dayIndex, periodIndex) => {
    setGrid((prev) =>
      prev.map((row, d) =>
        d === dayIndex ? row.map((cell, p) => (p === periodIndex ? !cell : cell)) : row
      )
    );
  };

  const columnLabel = (p) => periodLabels[p] || `P${p + 1}`;

  const handleSave = () => {
    onSave(teacher.id, {
      daysPerWeek,
      lessonPeriodsPerDay,
      periodsPerDay: lessonPeriodsPerDay,
      periodsPerWeek,
      cells: grid,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-labelledby="timeoff-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="timeoff-title" className="modal-title">
          Time off — {teacher.name}
        </h3>
        <p className="card-desc">
          Set availability for lesson periods only (breaks are not shown). By default, slots from
          Monday period 1 up to the school&apos;s <strong>{periodsPerWeek} periods per week</strong> limit
          are available (✓); remaining grid slots are unavailable (✗). Click Save to store this
          teacher&apos;s availability — saved settings are used when generating the timetable.
        </p>

        <div className="timeoff-grid-wrap settings-form-compact">
          <table className="timeoff-grid">
            <thead>
              <tr>
                <th className="timeoff-grid__corner">Day</th>
                {Array.from({ length: lessonPeriodsPerDay }, (_, p) => (
                  <th key={p}>{columnLabel(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, d) => (
                <tr key={d}>
                  <th className="timeoff-grid__day">{dayLabels[d]}</th>
                  {row.map((available, p) => (
                    <td key={p}>
                      <button
                        type="button"
                        className={`timeoff-cell${available ? " timeoff-cell--available" : " timeoff-cell--unavailable"}`}
                        onClick={() => toggleCell(d, p)}
                        aria-label={`${dayLabels[d]} ${columnLabel(p)}: ${available ? "available" : "unavailable"}`}
                      >
                        <span className="timeoff-cell__mark" aria-hidden>
                          {available ? "✓" : "✗"}
                        </span>
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
