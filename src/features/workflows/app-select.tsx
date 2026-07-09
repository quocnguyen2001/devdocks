import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppWindow, ChevronDown, Plus, Search } from "lucide-react";
import { AppMonogram } from "@/components/app-picker";
import { Input } from "@/components/ui/input";
import { appIcon, type InstalledApp } from "@/lib/apps-ipc";
import { useInstalledAppsStore } from "@/store/installed-apps-store";
import { cn } from "@/lib/utils";

// Shared across every AppIcon instance and popover open/close: the Rust command
// is already memoized, but caching the resolved data URI here also avoids an IPC
// round-trip (and an icon "pop-in") when the same app re-renders. `null` means
// "no icon" — kept so a missing icon isn't re-requested.
const iconCache = new Map<string, string | null>();

/** Lazy real-icon `<img>` for an installed app, with a monogram fallback while
 *  the icon loads or when none is available. */
function AppIcon({
  path,
  name,
  className,
}: {
  path?: string;
  name: string;
  className: string;
}) {
  const [src, setSrc] = useState<string | null | undefined>(() =>
    path ? iconCache.get(path) : null,
  );

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    if (iconCache.has(path)) {
      setSrc(iconCache.get(path));
      return;
    }
    let active = true;
    void appIcon(path)
      .then((uri) => {
        iconCache.set(path, uri);
        if (active) setSrc(uri);
      })
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
    };
  }, [path]);

  if (src) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-black/10",
          className,
        )}
        aria-hidden
      >
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain p-0.5"
          onError={() => setSrc(null)}
        />
      </span>
    );
  }
  return (
    <AppMonogram label={name} className={cn("shrink-0", className, "text-[10px]")} />
  );
}

interface AppSelectProps {
  value: string;
  onChange: (name: string) => void;
  id?: string;
  ariaInvalid?: boolean;
  /** Lets the workflow editor know the popover is open, so its window-level
   *  Escape handler yields (closing the popover instead of the whole editor). */
  onOpenChange?: (open: boolean) => void;
}

/** Searchable "Open app" picker: a trigger showing the chosen app (real icon +
 *  name) that opens a filterable popover of installed apps. A non-installed name
 *  can still be committed via the custom-entry row, preserving the old
 *  pick-or-type behavior. */
export function AppSelect({
  value,
  onChange,
  id,
  ariaInvalid,
  onOpenChange,
}: AppSelectProps) {
  const apps = useInstalledAppsStore((s) => s.apps);
  const fetchApps = useInstalledAppsStore((s) => s.fetch);
  const [open, setRawOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  useEffect(() => {
    void fetchApps();
  }, [fetchApps]);

  const setOpen = (next: boolean) => {
    // Reset the search when closing so a reopen starts from the full list.
    if (!next) setQuery("");
    setRawOpen(next);
    onOpenChange?.(next);
  };

  // If this ever unmounts while open (e.g. its step is deleted), release the
  // editor's Escape guard so Escape-to-cancel isn't left permanently disabled.
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  const selectedPath = useMemo(
    () => apps.find((a) => a.name === value)?.path,
    [apps, value],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? apps.filter((a) => a.name.toLowerCase().includes(q)) : apps),
    [apps, q],
  );
  // Offer to keep a typed name that isn't an installed app (pick-or-type).
  const showCustom =
    query.trim() !== "" && !apps.some((a) => a.name.toLowerCase() === q);
  const optionCount = filtered.length + (showCustom ? 1 : 0);

  useEffect(() => {
    if (highlight > optionCount - 1) setHighlight(Math.max(0, optionCount - 1));
  }, [optionCount, highlight]);

  const commit = (name: string) => {
    onChange(name);
    setQuery("");
    setOpen(false);
    triggerRef.current?.focus();
  };

  const commitHighlight = () => {
    if (highlight < filtered.length) {
      const app = filtered[highlight];
      if (app) commit(app.name);
    } else if (showCustom) {
      commit(query.trim());
    }
  };

  // Outside-click closes the popover (mirrors StepTypePicker).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen is stable enough; re-bind only on open
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") {
      // Stop here so the editor's window-level Escape doesn't also fire; the
      // editor yields via onOpenChange, letting this close just the popover.
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitHighlight();
    }
  };

  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          ariaInvalid && "border-destructive ring-destructive/40",
        )}
      >
        {value ? (
          <>
            <AppIcon path={selectedPath} name={value} className="h-5 w-5" />
            <span className="min-w-0 flex-1 truncate text-left text-foreground">
              {value}
            </span>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground"
            >
              <AppWindow className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-left text-muted-foreground">
              Select an app…
            </span>
          </>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-full min-w-64 rounded-xl border border-border bg-popover p-1.5 shadow-popover">
          <div className="relative mb-1.5">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the search when the popover opens
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps…"
              className="h-8 pl-8"
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-activedescendant={
                optionCount > 0 ? optionId(highlight) : undefined
              }
              aria-autocomplete="list"
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            className="max-h-64 overflow-y-auto"
          >
            {filtered.map((app: InstalledApp, i) => (
              <li key={app.path} role="none">
                <button
                  id={optionId(i)}
                  type="button"
                  role="option"
                  aria-selected={highlight === i}
                  onClick={() => commit(app.name)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                    highlight === i ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <AppIcon path={app.path} name={app.name} className="h-6 w-6" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {app.name}
                  </span>
                </button>
              </li>
            ))}

            {showCustom && (
              <li role="none">
                <button
                  id={optionId(filtered.length)}
                  type="button"
                  role="option"
                  aria-selected={highlight === filtered.length}
                  onClick={() => commit(query.trim())}
                  onMouseEnter={() => setHighlight(filtered.length)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                    highlight === filtered.length
                      ? "bg-accent"
                      : "hover:bg-accent/60",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    Use “{query.trim()}”
                  </span>
                </button>
              </li>
            )}

            {optionCount === 0 && (
              <li
                role="none"
                className="px-2 py-6 text-center text-xs text-muted-foreground"
              >
                No apps found.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
