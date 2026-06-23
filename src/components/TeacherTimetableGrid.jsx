import { useMemo } from "react";
import {
  buildTeacherPlacementPreview,
  getTeacherCardAt,
  teacherGridKey,
} from "../lib/teacherTimetableView";
import { findCardById, moveCardToSlot, removeCardToTray, toggleCardFixed } from "../lib/timetableValidation";
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
    applyChange(result);
    onDragEnd?.();
  };

  const handleRemoveToTray = (cardId) => {
    const result = removeCardToTray(timetable, cardId);
    applyChange(result);
  };

  const handleToggleFixed = (cardId) => {
    const result = toggleCardFixed(timetable, cardId);
    applyChange(result);
  };

  return (
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
                      e.preventDefault();
                      e.dataTransfer.dropEffect = placementPreview?.[gridKey] ? "move" : "none";
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
  );
}
