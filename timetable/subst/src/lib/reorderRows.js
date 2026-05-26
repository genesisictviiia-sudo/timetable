/** @returns {T[]} */
export function moveRowAtIndex(items, index, direction) {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** @returns {T[]} */
export function moveRowById(items, id, direction, idKey = "id") {
  const index = items.findIndex((r) => r[idKey] === id);
  if (index === -1) return items;
  return moveRowAtIndex(items, index, direction);
}
