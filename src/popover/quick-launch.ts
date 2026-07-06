import type { Workspace } from "@/types/workspace";

/** Recent-first ordering: most-recently-launched first, then by name. Pure. */
export function sortRecentFirst(list: Workspace[]): Workspace[] {
  return [...list].sort((a, b) => {
    const la = a.metadata.lastLaunched ?? "";
    const lb = b.metadata.lastLaunched ?? "";
    return la === lb ? a.name.localeCompare(b.name) : lb.localeCompare(la);
  });
}

/** Case-insensitive filter over workspace name + path. Empty query → all. */
export function filterByQuery(list: Workspace[], query: string): Workspace[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (w) => w.name.toLowerCase().includes(q) || w.path.toLowerCase().includes(q),
  );
}
