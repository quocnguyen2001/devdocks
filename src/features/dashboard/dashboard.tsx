import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { WorkspaceCard } from "@/features/dashboard/workspace-card";
import { LaunchProgress } from "@/features/launch/launch-progress";
import {
  allTags,
  emptyFilters,
  filterWorkspaces,
  type FilterState,
} from "@/hooks/use-workspace-filters";
import { cn } from "@/lib/utils";
import { useDiscoveryStore } from "@/store/discovery-store";
import { useLaunchStore } from "@/store/launch-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { Workspace } from "@/types/workspace";

interface DashboardProps {
  onNew: () => void;
  onEdit: (ws: Workspace) => void;
}

export function Dashboard({ onNew, onEdit }: DashboardProps) {
  const { workspaces, isLoading, error, fetch, remove, duplicate } =
    useWorkspaceStore();
  const { favorites, hydrate, toggleFavorite } = useDiscoveryStore();
  const launch = useLaunchStore((s) => s.launch);
  const launching = useLaunchStore((s) => s.isLaunching);

  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch();
    void hydrate();
  }, [fetch, hydrate]);

  useKeyboardShortcuts({ onSearch: () => searchRef.current?.focus() });

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const tags = useMemo(() => allTags(workspaces), [workspaces]);
  const visible = useMemo(
    () => filterWorkspaces(workspaces, filters, favoriteSet),
    [workspaces, filters, favoriteSet],
  );

  const toggleTag = (t: string) =>
    setFilters((f) => ({
      ...f,
      tags: f.tags.includes(t)
        ? f.tags.filter((x) => x !== t)
        : [...f.tags, t],
    }));

  const hasWorkspaces = workspaces.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="pl-8"
            placeholder="Search workspaces…"
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
          />
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" /> New workspace
        </Button>
      </div>

      {hasWorkspaces && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <FilterChip
            active={filters.favoritesOnly}
            onClick={() =>
              setFilters((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))
            }
          >
            ★ Favorites
          </FilterChip>
          {tags.map((t) => (
            <FilterChip
              key={t}
              active={filters.tags.includes(t)}
              onClick={() => toggleTag(t)}
            >
              {t}
            </FilterChip>
          ))}
          <div className="ml-auto flex items-center gap-1 text-muted-foreground">
            <span>Sort</span>
            <button
              type="button"
              className={cn(filters.sort === "name" && "text-foreground")}
              onClick={() => setFilters((f) => ({ ...f, sort: "name" }))}
            >
              name
            </button>
            <span>·</span>
            <button
              type="button"
              className={cn(filters.sort === "recent" && "text-foreground")}
              onClick={() => setFilters((f) => ({ ...f, sort: "recent" }))}
            >
              recent
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !hasWorkspaces && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No workspaces yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Create your first workspace to restore your whole dev environment
            with one click.
          </p>
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" /> Create your first workspace
          </Button>
        </div>
      )}

      {hasWorkspaces && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No workspaces match the current filters.
        </p>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              ws={ws}
              isFavorite={favoriteSet.has(ws.id)}
              launching={launching}
              onLaunch={() => launch(ws)}
              onToggleFavorite={() => void toggleFavorite(ws.id)}
              onEdit={() => onEdit(ws)}
              onDuplicate={() => void duplicate(ws.id)}
              onDelete={() => {
                if (confirm(`Delete "${ws.name}"?`)) void remove(ws.id);
              }}
            />
          ))}
        </div>
      )}

      <LaunchProgress />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
