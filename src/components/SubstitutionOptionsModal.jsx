import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MAX_WEEKLY_TOTAL } from "../lib/substitutionSettings";

const LABEL_MAX_WEEKLY = "Teachers workload per week";
const LABEL_EXCLUDE = "No substitution";

function inputWidthCh(label, floorCh = 8) {
  return `${Math.max(floorCh, label.length + 2)}ch`;
}

export default function SubstitutionOptionsModal({
  open,
  teacherList,
  leaveTeachers,
  maxWeeklyTotal,
  excludedTeachers,
  onClose,
  onSave,
}) {
  const [draftMaxWeekly, setDraftMaxWeekly] = useState(maxWeeklyTotal);
  const [draftExcluded, setDraftExcluded] = useState(excludedTeachers);

  const teacherPanelCh = useMemo(() => {
    const longestName = teacherList.reduce((m, n) => Math.max(m, n.length), 0);
    return Math.max(LABEL_EXCLUDE.length, longestName) + 2;
  }, [teacherList]);

  useEffect(() => {
    if (!open) return;
    setDraftMaxWeekly(maxWeeklyTotal);
    setDraftExcluded(excludedTeachers);
  }, [open, maxWeeklyTotal, excludedTeachers]);

  if (!open) return null;

  const toggleExcludeTeacher = (name) => {
    if (leaveTeachers.includes(name)) return;
    setDraftExcluded((prev) =>
      prev.includes(name)
        ? prev.filter((x) => x !== name)
        : [...prev, name].sort((a, b) => a.localeCompare(b))
    );
  };

  const commitMaxWeekly = (raw) => {
    const n = Number(raw);
    const next = Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_MAX_WEEKLY_TOTAL;
    setDraftMaxWeekly(next);
  };

  const handleSave = () => {
    const n = Number(draftMaxWeekly);
    const nextMax = Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_MAX_WEEKLY_TOTAL;
    const nextExcluded = draftExcluded.filter((name) => !leaveTeachers.includes(name));
    onSave({ maxWeeklyTotal: nextMax, excludedTeachers: nextExcluded });
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--wide"
        role="dialog"
        aria-labelledby="subst-options-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="subst-options-title" className="modal-title">
          Substitution options
        </h3>

        <div className="subst-options-form">
          <div className="field-row subst-options-form__row">
            <label className="field-label" htmlFor="subst-max-weekly">
              {LABEL_MAX_WEEKLY}
            </label>
            <input
              id="subst-max-weekly"
              type="number"
              min={1}
              step={1}
              className="field-input field-input--number"
              style={{ width: inputWidthCh(LABEL_MAX_WEEKLY, 6) }}
              value={draftMaxWeekly}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) {
                  setDraftMaxWeekly(Math.round(n));
                }
              }}
              onBlur={(e) => commitMaxWeekly(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitMaxWeekly(e.currentTarget.value);
                }
              }}
            />
            <span className="field-hint">Max base + substitutions per teacher per week</span>
          </div>

          <div className="field-block subst-options-form__exclude">
            <span className="field-label field-label--block">{LABEL_EXCLUDE}</span>
            <div
              className="teacher-pick"
              style={{ maxWidth: `${teacherPanelCh}ch` }}
              role="group"
              aria-label="Teachers who should not receive substitution"
            >
              {teacherList.map((name) => {
                const onLeave = leaveTeachers.includes(name);
                return (
                  <label
                    key={name}
                    className={`teacher-pick-row${onLeave ? " teacher-pick-row--disabled" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="teacher-check"
                      checked={!onLeave && draftExcluded.includes(name)}
                      disabled={onLeave}
                      onChange={() => toggleExcludeTeacher(name)}
                    />
                    <span className="teacher-name">{name}</span>
                  </label>
                );
              })}
            </div>
          </div>
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
