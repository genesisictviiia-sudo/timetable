import { useEffect, useState } from "react";

export default function MoreTeachersModal({
  open,
  allTeachers,
  primaryTeacher,
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
    const exclude = new Set([primaryTeacher, ...initialSelected].filter(Boolean));
    const pool = allTeachers.filter((name) => !exclude.has(name));
    setAvailable(pool.filter((name) => !initialSelected.includes(name)));
    setSelected([...initialSelected]);
    setPickedAvailable([]);
    setPickedSelected([]);
  }, [open, allTeachers, primaryTeacher, initialSelected]);

  if (!open) return null;

  const moveToSelected = () => {
    if (!pickedAvailable.length) return;
    setSelected((prev) => [...prev, ...pickedAvailable.filter((n) => !prev.includes(n))]);
    setAvailable((prev) => prev.filter((n) => !pickedAvailable.includes(n)));
    setPickedAvailable([]);
  };

  const moveToAvailable = () => {
    if (!pickedSelected.length) return;
    setAvailable((prev) => [...prev, ...pickedSelected.filter((n) => !prev.includes(n))].sort((a, b) => a.localeCompare(b)));
    setSelected((prev) => prev.filter((n) => !pickedSelected.includes(n)));
    setPickedSelected([]);
  };

  const toggleInList = (name, list, setList) => {
    setList((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card--compact"
        role="dialog"
        aria-labelledby="more-teachers-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="more-teachers-title" className="modal-title">
          More teachers
        </h3>

        <div className="dual-panel">
          <div className="dual-panel__side">
            <h4 className="dual-panel__heading">Teachers list</h4>
            <ul className="dual-panel__list">
              {available.length === 0 ? (
                <li className="dual-panel__empty">No more teachers available</li>
              ) : (
                available.map((name) => (
                  <li key={name}>
                    <label className="dual-panel__item">
                      <input
                        type="checkbox"
                        checked={pickedAvailable.includes(name)}
                        onChange={() => toggleInList(name, pickedAvailable, setPickedAvailable)}
                      />
                      <span>{name}</span>
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
                selected.map((name) => (
                  <li key={name}>
                    <label className="dual-panel__item">
                      <input
                        type="checkbox"
                        checked={pickedSelected.includes(name)}
                        onChange={() => toggleInList(name, pickedSelected, setPickedSelected)}
                      />
                      <span>{name}</span>
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
              onSave(selected);
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
