import { useEffect, useState } from "react";

// Accepts either { id, label } objects (e.g. classes keyed by id) or plain
// strings (e.g. class labels used directly as the identifier).
function normalizeClass(c) {
  return typeof c === "string" ? { id: c, label: c } : c;
}

// Prefer the admin-entered class title (e.g. "IA") over the derived
// grade+section label (e.g. "1A") when displaying.
function displayName(c) {
  return String(c.title || "").trim() || c.label;
}

export default function MoreClassesModal({
  open,
  allClasses,
  currentClassId,
  initialSelected,
  onClose,
  onSave,
}) {
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState([]);
  const [pickedAvailable, setPickedAvailable] = useState([]);
  const [pickedSelected, setPickedSelected] = useState([]);

  useEffect(() => {
    if (!open) return;
    const normalized = allClasses.map(normalizeClass);
    const exclude = new Set([currentClassId, ...initialSelected].filter(Boolean));
    const pool = normalized.filter((c) => !exclude.has(c.id));
    setAvailable(pool);
    setSelected(normalized.filter((c) => initialSelected.includes(c.id)));
    setPickedAvailable([]);
    setPickedSelected([]);
  }, [open, allClasses, currentClassId, initialSelected]);

  if (!open) return null;

  const moveToSelected = () => {
    if (!pickedAvailable.length) return;
    const moving = available.filter((c) => pickedAvailable.includes(c.id));
    setSelected((prev) => [...prev, ...moving.filter((c) => !prev.some((p) => p.id === c.id))]);
    setAvailable((prev) => prev.filter((c) => !pickedAvailable.includes(c.id)));
    setPickedAvailable([]);
  };

  const moveToAvailable = () => {
    if (!pickedSelected.length) return;
    const moving = selected.filter((c) => pickedSelected.includes(c.id));
    setAvailable((prev) =>
      [...prev, ...moving.filter((c) => !prev.some((p) => p.id === c.id))].sort((a, b) =>
        displayName(a).localeCompare(displayName(b))
      )
    );
    setSelected((prev) => prev.filter((c) => !pickedSelected.includes(c.id)));
    setPickedSelected([]);
  };

  const toggleInList = (id, list, setList) => {
    setList((prev) => (prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]));
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--compact"
        role="dialog"
        aria-labelledby="more-classes-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="more-classes-title" className="modal-title">
          More classes
        </h3>

        <div className="dual-panel">
          <div className="dual-panel__side">
            <h4 className="dual-panel__heading">Classes list</h4>
            <ul className="dual-panel__list">
              {available.length === 0 ? (
                <li className="dual-panel__empty">No more classes available</li>
              ) : (
                available.map((c) => (
                  <li key={c.id}>
                    <label className="dual-panel__item">
                      <input
                        type="checkbox"
                        checked={pickedAvailable.includes(c.id)}
                        onChange={() => toggleInList(c.id, pickedAvailable, setPickedAvailable)}
                      />
                      <span>{displayName(c)}</span>
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="dual-panel__controls">
            <button type="button" className="btn btn-ghost dual-panel__arrow" onClick={moveToSelected} title="Add to lesson">
              &gt;
            </button>
            <button type="button" className="btn btn-ghost dual-panel__arrow" onClick={moveToAvailable} title="Remove from lesson">
              &lt;
            </button>
          </div>

          <div className="dual-panel__side">
            <h4 className="dual-panel__heading">Selected for this lesson</h4>
            <ul className="dual-panel__list">
              {selected.length === 0 ? (
                <li className="dual-panel__empty">None selected</li>
              ) : (
                selected.map((c) => (
                  <li key={c.id}>
                    <label className="dual-panel__item">
                      <input
                        type="checkbox"
                        checked={pickedSelected.includes(c.id)}
                        onChange={() => toggleInList(c.id, pickedSelected, setPickedSelected)}
                      />
                      <span>{displayName(c)}</span>
                    </label>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(selected.map((c) => c.id));
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
