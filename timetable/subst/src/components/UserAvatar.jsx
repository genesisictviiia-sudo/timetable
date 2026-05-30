import { avatarColorFor, avatarInitial } from "../lib/avatarColor";

export default function UserAvatar({ displayName, email, size = 36, className = "" }) {
  const initial = avatarInitial(displayName, email);
  const bg = avatarColorFor(displayName || email);
  const px = typeof size === "number" ? `${size}px` : size;

  return (
    <span
      className={`user-avatar ${className}`.trim()}
      style={{ width: px, height: px, backgroundColor: bg }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
