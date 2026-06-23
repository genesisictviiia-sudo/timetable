import { useState } from "react";

export default function AddTeacherModal({ open, onClose, onSave }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim()) {
      alert("Enter the teacher name.");
      return;
    }
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
    setName("");
    setPhone("");
    setEmail("");
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
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Teacher name" />
          </label>
          <label>
            Phone
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
          </label>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" />
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
