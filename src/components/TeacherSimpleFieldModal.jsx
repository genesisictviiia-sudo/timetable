export default function TeacherSimpleFieldModal({ open, title, label, value, onChange, onClose, onSave }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-labelledby="simple-field-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="simple-field-title" className="modal-title">
          {title}
        </h3>
        <div className="settings-form-compact settings-form-stack">
          <label>
            {label}
            <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Enter ${label.toLowerCase()}`} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
