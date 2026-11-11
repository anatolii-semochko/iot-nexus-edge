// One found entry per visible instance (api.ts) - grouped for display as
// [name, count] pairs, in first-seen order.
export const groupFound = (found) => {
  const counts = new Map()
  for (const f of found ?? []) counts.set(f.name, (counts.get(f.name) ?? 0) + 1)
  return [...counts]
}

export const formatFound = (found) =>
  groupFound(found)
    .map(([name, count]) => (count > 1 ? `${name} x${count}` : name))
    .join(', ')
