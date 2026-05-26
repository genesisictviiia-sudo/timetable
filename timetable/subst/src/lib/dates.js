const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function parseISODate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getDayName(iso) {
  const d = parseISODate(iso);
  return d ? DAY_NAMES[d.getDay()] : null;
}

export function mondayOfCalendarWeek(iso) {
  const d = parseISODate(iso);
  if (!d) return null;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function sundayOfCalendarWeek(iso) {
  const m = mondayOfCalendarWeek(iso);
  if (!m) return null;
  const s = new Date(m);
  s.setDate(m.getDate() + 6);
  return s;
}

/** @param {number} [schoolDaysPerWeek] from School settings (5–7). Defaults to Mon–Sat. */
export function isSchoolDay(iso, schoolDaysPerWeek = 6) {
  const d = parseISODate(iso);
  if (!d) return false;
  const dow = d.getDay();
  if (dow === 0) return false;
  const maxDow = Math.min(6, Math.max(1, Number(schoolDaysPerWeek) || 6));
  return dow >= 1 && dow <= maxDow;
}
