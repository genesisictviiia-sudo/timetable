import { useMemo, useState } from "react";
import {
  buildPlacementPreview,
  forceMoveCardToSlot,
  getCellCard,
  getPlacementConflicts,
  makeSlotKey,
  moveCardToSlot,
  removeCardToTray,
  toggleCardFixed,
} from "../lib/timetableValidation";
import TimetableCard from "./TimetableCard";

export default function TimetableGrid({
  timetable,
  currentClass,
  draggingCardId,
  onDragStart,
  onDragEnd,
  onTimetableChange,
  onWarning,
  onClearWarning,
}) {
  // {cardId, day, period, conflicts: [{cardId, classLabel, subject, teacher}]}
  const [conflictPrompt, setConflictPrompt] = useState(null);

  if (!timetable || !currentClass) {
    return <p className="card-desc">No class selected.</p>;
  }

  const columns = timetable.columns || [];
  const periodsPerDay = timetable.periodsPerDay || 1;
  const dayLabels = timetable.dayLabels || timetable.dayNames || [];

  const placementPreview = useMemo(() => {
    if (!draggingCardId) return null;
    return buildPlacementPreview(timetable, draggingCardId, currentClass.id);
  }, [timetable, draggingCardId, currentClass.id]);

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
    const result = moveCardToSlot(timetable, cardId, currentClass.id, day, period);

    if (!result.ok) {
      // If the failure is a teacher clash with card(s) already placed
      // elsewhere, offer "Remove collisions / Ignore / Cancel" instead of
      // rejecting outright.
      const conflicts = getPlacementConflicts(timetable, cardId, day, period);
      if (conflicts.length) {
        setConflictPrompt({ cardId, day, period, conflicts });
        onDragEnd?.();
        return;
      }
    }

    applyChange(result);
    onDragEnd?.();
  };

  const resolveConflict = (mode) => {
    if (!conflictPrompt) return;
    const { cardId, day, period, conflicts } = conflictPrompt;
    setConflictPrompt(null);

    if (mode === "remove") {
      // Clashing card(s) go to the tray; the dragged card takes the slot.
      const result = forceMoveCardToSlot(
        timetable,
        cardId,
        currentClass.id,
        day,
        period,
        conflicts.map((c) => c.cardId)
      );
      applyChange(result);
      return;
    }

    if (mode === "ignore") {
      // The dragged card goes back to the tray; nothing else changes.
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
      <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => resolveConflict("cancel")}>
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
                const slotKey = makeSlotKey(currentClass.id, day, period);
                const card = getCellCard(timetable, currentClass.id, day, period);
                const isEmpty = !card;

                let placeClass = "";
                if (isDragging && placementPreview) {
                  placeClass = placementPreview[slotKey]
                    ? " tt-grid__cell--can-place"
                    : " tt-grid__cell--cannot-place";
                }

                return (
                  <td
                    key={slotKey}
                    className={`tt-grid__cell${isEmpty ? " tt-grid__cell--empty" : ""}${placeClass}`}
                    onDragOver={(e) => {
                      // Always accept the drop — a red (conflicting) cell must
                      // still receive the drop event so the collision menu can
                      // open with Remove/Ignore choices.
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => handleDropOnCell(day, period, e)}
                  >
                    {card ? (
                      <TimetableCard
                        card={card}
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
