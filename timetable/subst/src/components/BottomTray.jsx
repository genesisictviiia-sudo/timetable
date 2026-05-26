import TimetableCard from "./TimetableCard";

export default function BottomTray({
  tray,
  classLabel,
  onDragStart,
  onDragEnd,
  onToggleFixed,
  onDropFromGrid,
  dragOver,
  onDragOver,
  onDragLeave,
}) {
  const count = tray?.length ?? 0;

  return (
    <section
      className={`tt-tray${dragOver ? " tt-tray--drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver?.();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId) onDropFromGrid?.(cardId);
        onDragEnd?.();
      }}
      aria-label={classLabel ? `Lesson tray for ${classLabel}` : "Lesson tray"}
    >
      <div className="tt-tray__header">
        <h3 className="tt-tray__title">
          {classLabel ? `Lessons left for ${classLabel}` : "Lesson tray"}
        </h3>
        <span className="tt-tray__count">{count} in this class</span>
      </div>
      {count === 0 ? (
        <p className="tt-tray__empty">No lessons in tray for this class.</p>
      ) : (
        <div className="tt-tray__list">
          {tray.map((card) => (
            <TimetableCard
              key={card.id}
              card={card}
              classLabel={card.classLabel}
              compact
              dense
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onToggleFixed={onToggleFixed}
            />
          ))}
        </div>
      )}
    </section>
  );
}
