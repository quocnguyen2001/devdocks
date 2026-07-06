import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolOption } from "@/lib/tool-catalog";
import type { Detected } from "@/types/launch";

interface AppPickerProps {
  options: ToolOption[];
  selected: string[];
  onToggle: (id: string) => void;
  availability?: Record<string, Detected>;
}

/** Two-letter initials for the monogram fallback (e.g. "VS Code" -> "VS"). */
function initials(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

interface AppMonogramProps {
  label: string;
  brandColor?: string;
}

/** Colored rounded tile with an app's initials — the fallback when no logo is
 * bundled, or when the bundled `<img>` fails to load. */
function AppMonogram({ label, brandColor = "#6b7280" }: AppMonogramProps) {
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-semibold text-white"
      style={{ backgroundColor: brandColor }}
      aria-hidden
    >
      {initials(label)}
    </span>
  );
}

interface AppTileProps {
  option: ToolOption;
  selected: boolean;
  notFound: boolean;
  onToggle: (id: string) => void;
}

function AppTile({ option, selected, notFound, onToggle }: AppTileProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${option.label}${notFound ? " (not found)" : ""}`}
      onClick={() => onToggle(option.id)}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-xl p-3 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-brand-muted ring-2 ring-brand"
          : "border border-border bg-surface hover:bg-accent/40",
        notFound && "opacity-60",
      )}
    >
      {selected && (
        <span
          className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-brand-foreground"
          aria-hidden
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
      {option.icon && !imgFailed ? (
        <img
          src={option.icon}
          alt=""
          aria-hidden
          className="h-8 w-8 object-contain"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <AppMonogram label={option.label} brandColor={option.brandColor} />
      )}
      <span className="line-clamp-1 text-center text-xs text-foreground">
        {option.label}
      </span>
      {notFound && (
        <span className="text-[10px] leading-none opacity-60">
          · not found
        </span>
      )}
    </button>
  );
}

/**
 * Tile-based, logo-first replacement for `ToolChips` in the workspace editor.
 * Prop-compatible with `ToolChips` (`options`, `selected`, `onToggle`,
 * `availability`) so it's a drop-in swap — same multi-select `aria-pressed`
 * contract, same `toggleTool` wiring, no new form model.
 */
export function AppPicker({
  options,
  selected,
  onToggle,
  availability,
}: AppPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
      {options.map((opt) => (
        <AppTile
          key={opt.id}
          option={opt}
          selected={selected.includes(opt.id)}
          notFound={availability?.[opt.id]?.available === false}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
