import { useState } from "react";

export default function AddTeacherModal({ open, onClose, onSave }) {
  const [name, setName] = useState("");
  const [classTeacher, setClassTeacher] = useState("");

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim()) {
      alert("Enter the teacher name.");
      return;
    }
    onSave({
      name: name.trim(),
      classTeacher: classTeacher.trim(),
    });
    setName("");
    setClassTeacher("");
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-labelledby="add-teacher-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="add-teacher-title" className="modal-title">
          Add teacher
        </h3>
        <div className="settings-form-compact settings-form-stack">
          <label>
            Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teacher name" autoFocus />
          </label>
          <label>
            Class teacher of{" "}
            <span style={{ fontWeight: 400, fontSize: "0.85em", color: "var(--color-text-muted, #888)" }}>(optional)</span>
            <input
              type="text"
              value={classTeacher}
              onChange={(e) => setClassTeacher(e.target.value)}
              placeholder="e.g. 10A"
            />
          </label>
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
