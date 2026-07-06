import type { Workspace } from "@/types/workspace";

export type SortMode = "name" | "recent";

export interface FilterState {
  search: string;
  favoritesOnly: boolean;
  /** Selected tags; a workspace matches if it has ANY of them (OR semantics). */
  tags: string[];
  sort: SortMode;
}

export const emptyFilters: FilterState = {
  search: "",
  favoritesOnly: false,
  tags: [],
  sort: "name",
};

/** True when any search/tag/favorites filter is active. When false, the
 *  dashboard shows the resting Favorites/Recent/All sections; when true it
 *  collapses to a single flat results list. */
export function hasActiveFilters(state: FilterState): boolean {
  return (
    state.search.trim() !== "" ||
    state.favoritesOnly ||
    state.tags.length > 0
  );
}

/** Recently-launched workspaces (those with a `lastLaunched`), newest first,
 *  capped at `limit`. Used for the resting "Recent" section. */
export function recentWorkspaces(
  workspaces: Workspace[],
  limit = 5,
): Workspace[] {
  return workspaces
    .filter((w) => w.metadata.lastLaunched)
    .sort((a, b) =>
      (b.metadata.lastLaunched ?? "").localeCompare(
        a.metadata.lastLaunched ?? "",
      ),
    )
    .slice(0, limit);
}

/** All distinct tags across workspaces, sorted. */
export function allTags(workspaces: Workspace[]): string[] {
  return [...new Set(workspaces.flatMap((w) => w.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Pure filter + sort. In-memory (fine for tens–low hundreds of workspaces). */
export function filterWorkspaces(
  workspaces: Workspace[],
  state: FilterState,
  favorites: Set<string>,
): Workspace[] {
  let out = workspaces;

  const q = state.search.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.path.toLowerCase().includes(q) ||
        w.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  if (state.favoritesOnly) {
    out = out.filter((w) => favorites.has(w.id));
  }

  if (state.tags.length > 0) {
    out = out.filter((w) => state.tags.some((t) => w.tags.includes(t)));
  }

  const sorted = [...out];
  if (state.sort === "recent") {
    sorted.sort((a, b) =>
      (b.metadata.lastLaunched ?? "").localeCompare(a.metadata.lastLaunched ?? ""),
    );
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}
