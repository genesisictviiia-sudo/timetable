import { useMemo, useState } from "react";
import {
  buildTeacherPlacementPreview,
  getTeacherCardAt,
  teacherGridKey,
} from "../lib/teacherTimetableView";
import {
  findCardById,
  forceMoveCardToSlot,
  getPlacementConflicts,
  moveCardToSlot,
  removeCardToTray,
  toggleCardFixed,
} from "../lib/timetableValidation";
import TimetableCard from "./TimetableCard";

export default function TeacherTimetableGrid({
  timetable,
  teacherName,
  draggingCardId,
  onDragStart,
  onDragEnd,
  onTimetableChange,
  onWarning,
  onClearWarning,
}) {
  // {cardId, classId, day, period, conflicts}
  const [conflictPrompt, setConflictPrompt] = useState(null);

  if (!timetable || !teacherName) {
    return <p className="card-desc">No teacher selected.</p>;
  }

  const columns = timetable.columns || [];
  const periodsPerDay = timetable.periodsPerDay || 1;
  const dayLabels = timetable.dayLabels || timetable.dayNames || [];

  const placementPreview = useMemo(() => {
    if (!draggingCardId) return null;
    return buildTeacherPlacementPreview(timetable, draggingCardId, teacherName);
  }, [timetable, draggingCardId, teacherName]);

  const uniquePeriods = [];
  for (let p = 0; p < periodsPerDay; p++) {
    const col = columns.find((c) => c.period === p) || columns[p];
    uniquePeriods.push({
      period: p,
      periodLabel: col?.periodLabel || timetable.periodLabels?.[p] || `P${p + 1}`,
    });
  }

  const days = [];
  for (let d = 0; d < timetable.daysPerWeek; d++) {
    days.push({
      day: d,
      dayLabel: dayLabels[d] || columns.find((c) => c.day === d)?.dayLabel || `Day ${d + 1}`,
    });
  }

  const isDragging = Boolean(draggingCardId);

  const applyChange = (result) => {
    if (!result.ok) {
      onWarning?.(result.message);
      return;
    }
    onClearWarning?.();
    onTimetableChange(result.timetable);
  };

  const handleDropOnCell = (day, period, e) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain") || draggingCardId;
    if (!cardId) return;

    const found = findCardById(timetable, cardId);
    if (!found.card?.classId) return;

    const result = moveCardToSlot(timetable, cardId, found.card.classId, day, period);

    if (!result.ok) {
      // Teacher clash with card(s) placed elsewhere → offer Remove/Ignore.
      const conflicts = getPlacementConflicts(timetable, cardId, day, period);
      if (conflicts.length) {
        setConflictPrompt({ cardId, classId: found.card.classId, day, period, conflicts });
        onDragEnd?.();
        return;
      }
    }

    applyChange(result);
    onDragEnd?.();
  };

  const resolveConflict = (mode) => {
    if (!conflictPrompt) return;
    const { cardId, classId, day, period, conflicts } = conflictPrompt;
    setConflictPrompt(null);

    if (mode === "remove") {
      const result = forceMoveCardToSlot(
        timetable,
        cardId,
        classId,
        day,
        period,
        conflicts.map((c) => c.cardId)
      );
      applyChange(result);
      return;
    }

    if (mode === "ignore") {
      const result = removeCardToTray(timetable, cardId);
      applyChange(result);
    }
  };

  const handleRemoveToTray = (cardId) => {
    const result = removeCardToTray(timetable, cardId);
    applyChange(result);
  };

  const handleToggleFixed = (cardId) => {
    const result = toggleCardFixed(timetable, cardId);
    applyChange(result);
  };

  const conflictDayLabel = conflictPrompt ? (days[conflictPrompt.day]?.dayLabel ?? `Day ${conflictPrompt.day + 1}`) : "";
  const conflictPeriodLabel = conflictPrompt
    ? (uniquePeriods[conflictPrompt.period]?.periodLabel ?? `P${conflictPrompt.period + 1}`)
    : "";

  return (
    <>
    {conflictPrompt && (
      <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setConflictPrompt(null)}>
        <div className="modal-card tt-conflict-card" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title">Collisions found</h3>
          <p className="card-desc" style={{ marginBottom: "0.75rem" }}>
            Placing this lesson at <strong>{conflictDayLabel} · {conflictPeriodLabel}</strong> clashes with:
          </p>
          <ul className="tt-conflict-list">
            {conflictPrompt.conflicts.map((c) => (
              <li key={c.cardId} className="tt-conflict-list__item">
                <span className="tt-conflict-list__badge" aria-hidden />
                <span>
                  <strong>{c.subject}</strong> ({c.classLabel}) — {c.teacher}
                </span>
              </li>
            ))}
          </ul>
          <div className="tt-conflict-actions">
            <button type="button" className="btn btn-primary" onClick={() => resolveConflict("remove")}>
              ✓ Remove collision — move clashing card(s) to the tray and place this card
            </button>
            <button type="button" className="btn btn-outline" onClick={() => resolveConflict("ignore")}>
              Ignore — send this card back to the tray
            </button>
          </div>
        </div>
      </div>
    )}
    <div className={`tt-grid-wrap${isDragging ? " tt-grid-wrap--placing" : ""}`}>
      <table className="period-table tt-grid tt-grid--single-class">
        <thead>
          <tr>
            <th className="tt-grid__day-col">Day</th>
            {uniquePeriods.map((p) => (
              <th key={p.period} className="tt-grid__period-col">
                {p.periodLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map(({ day, dayLabel }) => (
            <tr key={day}>
              <th className="tt-grid__day-label" scope="row">
                {dayLabel}
              </th>
              {uniquePeriods.map(({ period }) => {
                const gridKey = teacherGridKey(day, period);
                const entry = getTeacherCardAt(timetable, teacherName, day, period);
                const isEmpty = !entry;

                let placeClass = "";
                if (isDragging && placementPreview) {
                  placeClass = placementPreview[gridKey]
                    ? " tt-grid__cell--can-place"
                    : " tt-grid__cell--cannot-place";
                }

                return (
                  <td
                    key={gridKey}
                    className={`tt-grid__cell${isEmpty ? " tt-grid__cell--empty" : ""}${placeClass}`}
                    onDragOver={(e) => {
                      // Always accept the drop so conflicting (red) cells can
                      // open the collision menu instead of silently refusing.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => handleDropOnCell(day, period, e)}
                  >
                    {entry ? (
                      <TimetableCard
                        card={entry.card}
                        classLabel={entry.card.classLabel}
                        showClassLabel
                        dense
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onToggleFixed={handleToggleFixed}
                        onRemoveToTray={handleRemoveToTray}
                      />
                    ) : (
                      <span className="tt-grid__empty-slot" aria-hidden>
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
