/** Recent-first by a caller-supplied timestamp, then name. Pure. */
export function sortRecentFirst<T>(
  list: T[],
  stampOf: (x: T) => string | null | undefined,
  nameOf: (x: T) => string,
): T[] {
  return [...list].sort((a, b) => {
    const la = stampOf(a) ?? "";
    const lb = stampOf(b) ?? "";
    return la === lb ? nameOf(a).localeCompare(nameOf(b)) : lb.localeCompare(la);
  });
}

/** Case-insensitive filter over caller-supplied fields. Empty query → all. */
export function filterByQuery<T>(
  list: T[],
  query: string,
  fieldsOf: (x: T) => string[],
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((x) => fieldsOf(x).some((f) => f.toLowerCase().includes(q)));
}
