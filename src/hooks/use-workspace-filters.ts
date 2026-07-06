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
