import { useEffect, useRef, useState } from "react";
import { AppWindow, Clock, Play, Plus, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StepForm } from "@/features/workflows/form-model";

const KIND_OPTIONS: {
  kind: StepForm["kind"];
  label: string;
  hint: string;
  icon: typeof Play;
}[] = [
  {
    kind: "launchWorkspace",
    label: "Launch workspace",
    hint: "Run an existing workspace",
    icon: Play,
  },
  {
    kind: "openApp",
    label: "Open app",
    hint: "Open a macOS application",
    icon: AppWindow,
  },
  {
    kind: "runScript",
    label: "Run script",
    hint: "A shell command with a timeout",
    icon: Terminal,
  },
  {
    kind: "delay",
    label: "Delay",
    hint: "Wait N milliseconds",
    icon: Clock,
  },
];

interface StepTypePickerProps {
  onPick: (kind: StepForm["kind"]) => void;
  /** Notifies the parent when the menu opens/closes so it can yield Escape
   *  to this menu instead of treating it as an editor-cancel. */
  onOpenChange?: (open: boolean) => void;
}

/** "Add step" button that opens a small inline menu listing the four step
 *  kinds. Closes on outside click, Escape, or selection. */
export function StepTypePicker({ onPick, onOpenChange }: StepTypePickerProps) {
  const [open, setRawOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setRawOpen((o) => {
      const value = typeof next === "function" ? next(o) : next;
      onOpenChange?.(value);
      return value;
    });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className="h-4 w-4" /> Add step
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-popover"
        >
          {KIND_OPTIONS.map(({ kind, label, hint, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(kind);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground"
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
