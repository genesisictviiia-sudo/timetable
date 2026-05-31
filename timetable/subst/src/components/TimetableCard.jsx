export default function TimetableCard({
  card,
  classLabel,
  draggable = true,
  onDragStart,
  onDragEnd,
  onToggleFixed,
  onRemoveToTray,
  compact = false,
  dense = false,
  showClassLabel = false,
}) {
  if (!card) return null;

  const teachers = Array.isArray(card.teachers) ? card.teachers : [];
  const fixed = Boolean(card.fixed);

  return (
    <div
      className={`tt-card${fixed ? " tt-card--fixed" : ""}${compact ? " tt-card--compact" : ""}${dense ? " tt-card--dense" : ""}`}
      draggable={draggable && !fixed}
      onDragStart={(e) => {
        if (fixed) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.id);
        onDragStart?.(card.id);
      }}
      onDragEnd={onDragEnd}
      role="group"
      aria-label={`${card.subject} lesson`}
    >
      <div className="tt-card__subject">{card.subject}</div>
      {showClassLabel && classLabel ? (
        <div className="tt-card__class">{classLabel}</div>
      ) : (
        teachers.length > 0 && (
          <div className="tt-card__teachers">
            {teachers.map((name) => (
              <span key={name} className="tt-card__teacher">
                {name}
              </span>
            ))}
          </div>
        )
      )}
      {classLabel && compact && !showClassLabel && <div className="tt-card__class">{classLabel}</div>}
      {(onToggleFixed || onRemoveToTray) && (
        <div className="tt-card__actions">
          {onToggleFixed && (
            <button
              type="button"
              className="tt-card__btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFixed(card.id);
              }}
              title={fixed ? "Unfix lesson" : "Fix lesson in place"}
            >
              {dense ? (fixed ? "U" : "F") : fixed ? "Unfix" : "Fix"}
            </button>
          )}
          {!fixed && onRemoveToTray && (
            <button
              type="button"
              className="tt-card__btn tt-card__btn--remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveToTray(card.id);
              }}
              title="Move to tray"
            >
              {dense ? "×" : "Remove"}
            </button>
          )}
        </div>
      )}
      {fixed && <span className="tt-card__pin" aria-hidden title="Fixed">📌</span>}
    </div>
  );
}
