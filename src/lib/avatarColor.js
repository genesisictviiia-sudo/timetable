/** Deterministic accent colour from a display name or email (stable per user). */
const AVATAR_PALETTE = [
  "#5c6bc0",
  "#26a69a",
  "#ef5350",
  "#ab47bc",
  "#42a5f5",
  "#ffa726",
  "#66bb6a",
  "#ec407a",
  "#8d6e63",
  "#29b6f6",
];

export function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function avatarColorFor(seed) {
  const h = hashString(seed);
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function avatarInitial(displayName, email) {
  const source = String(displayName || email || "?").trim();
  if (!source) return "?";
  const letter = source[0];
  return letter.toUpperCase();
}
