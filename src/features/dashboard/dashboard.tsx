import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { DashboardSection } from "@/features/dashboard/dashboard-section";
import { WorkspaceCard } from "@/features/dashboard/workspace-card";
import { WorkspaceCardSkeleton } from "@/features/dashboard/workspace-card-skeleton";
import { LaunchProgress } from "@/features/launch/launch-progress";
import {
  allTags,
  emptyFilters,
  filterWorkspaces,
  hasActiveFilters,
  recentWorkspaces,
  type FilterState,
  type SortMode,
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
  const launchingId = useLaunchStore((s) => s.launchingWorkspaceId);

  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch();
    void hydrate();
    // Refetch when any window (incl. the popover) changes/launches a workspace.
    const changed = listen("workspaces:changed", () => void fetch());
    return () => void changed.then((un) => un());
  }, [fetch, hydrate]);

  useKeyboardShortcuts({ onSearch: () => searchRef.current?.focus() });

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const tags = useMemo(() => allTags(workspaces), [workspaces]);
  const filtered = useMemo(
    () => filterWorkspaces(workspaces, filters, favoriteSet),
    [workspaces, filters, favoriteSet],
  );
  const favoriteList = useMemo(
    () => filterWorkspaces(workspaces, filters, favoriteSet).filter((w) => favoriteSet.has(w.id)),
    [workspaces, filters, favoriteSet],
  );
  const recentList = useMemo(() => recentWorkspaces(workspaces), [workspaces]);

  const toggleTag = (t: string) =>
    setFilters((f) => ({
      ...f,
      tags: f.tags.includes(t)
        ? f.tags.filter((x) => x !== t)
        : [...f.tags, t],
    }));

  const hasWorkspaces = workspaces.length > 0;
  const filtering = hasActiveFilters(filters);

  const renderCard = (ws: Workspace) => (
    <WorkspaceCard
      key={ws.id}
      ws={ws}
      isFavorite={favoriteSet.has(ws.id)}
      launching={launchingId === ws.id}
      onLaunch={() => launch(ws)}
      onToggleFavorite={() => void toggleFavorite(ws.id)}
      onEdit={() => onEdit(ws)}
      onDuplicate={() => void duplicate(ws.id)}
      onDelete={() => void remove(ws.id)}
    />
  );

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
          <SortControl
            value={filters.sort}
            onChange={(sort) => setFilters((f) => ({ ...f, sort }))}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading && !hasWorkspaces && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <WorkspaceCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!isLoading && !hasWorkspaces && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="rounded-full bg-brand-muted p-3 text-brand">
            <Plus className="h-6 w-6" />
          </div>
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

      {/* Filtering → flat results; resting → Favorites / Recent / All sections. */}
      {hasWorkspaces && filtering && (
        <>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workspaces match the current filters.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map(renderCard)}
            </div>
          )}
        </>
      )}

      {hasWorkspaces && !filtering && (
        <div className="space-y-6">
          <DashboardSection title="Favorites" count={favoriteList.length}>
            {favoriteList.map(renderCard)}
          </DashboardSection>
          <DashboardSection title="Recent" count={recentList.length}>
            {recentList.map(renderCard)}
          </DashboardSection>
          <DashboardSection title="All workspaces" count={filtered.length}>
            {filtered.map(renderCard)}
          </DashboardSection>
        </div>
      )}

      <LaunchProgress />
    </div>
  );
}

function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (v: SortMode) => void;
}) {
  const options: { id: SortMode; label: string }[] = [
    { id: "name", label: "Name" },
    { id: "recent", label: "Recent" },
  ];
  return (
    <div
      role="group"
      aria-label="Sort workspaces"
      className="ml-auto flex items-center rounded-lg border border-input bg-muted p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.id
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
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
          ? "border-brand bg-brand text-brand-foreground"
          : "border-input bg-transparent hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
