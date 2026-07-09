import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { DURATION, EASE_OUT, SPRING, pressScale } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import type { ToolOption } from "@/lib/tool-catalog";
import type { Detected } from "@/types/launch";

interface AppPickerProps {
  options: ToolOption[];
  selected: string[];
  onToggle: (id: string) => void;
  availability?: Record<string, Detected>;
  /** Horizontal pill layout for inline single-selects (IDE / terminal app);
   *  default is the vertical-tile grid used by the AI-tools / apps sections. */
  compact?: boolean;
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
  className?: string;
}

/** Colored rounded tile with an app's initials — the fallback when no real logo
 * is bundled, or when the bundled `<img>` fails to load. Also reused by the
 * "Open app" picker (`AppSelect`) for apps whose real icon isn't available. */
export function AppMonogram({
  label,
  brandColor = "#6b7280",
  className,
}: AppMonogramProps) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-md font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: brandColor }}
      aria-hidden
    >
      {initials(label)}
    </span>
  );
}

interface AppLogoProps {
  option: ToolOption;
  className: string;
}

/** Real logo `<img>` on a light plate (so monochrome-dark brand marks stay
 *  visible in both the light and dark app themes), with a state-driven monogram
 *  fallback on load error. */
function AppLogo({ option, className }: AppLogoProps) {
  const [failed, setFailed] = useState(false);
  if (option.icon && !failed) {
    return (
      <span
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-black/10",
          className,
        )}
        aria-hidden
      >
        <img
          src={option.icon}
          alt=""
          className="h-full w-full object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <AppMonogram
      label={option.label}
      brandColor={option.brandColor}
      className={cn(className, "text-[10px]")}
    />
  );
}

interface AppTileProps {
  option: ToolOption;
  selected: boolean;
  notFound: boolean;
  compact: boolean;
  reduced: boolean;
  onToggle: (id: string) => void;
}

function AppTile({
  option,
  selected,
  notFound,
  compact,
  reduced,
  onToggle,
}: AppTileProps) {
  const checkBadge = (
    <AnimatePresence initial={false}>
      {selected && (
        <motion.span
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { scale: 0, opacity: 0 }}
          transition={reduced ? { duration: 0 } : SPRING}
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-brand text-brand-foreground",
            compact ? "-right-1 -top-1 h-3.5 w-3.5" : "right-1.5 top-1.5 h-4 w-4",
          )}
          aria-hidden
        >
          <Check className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} strokeWidth={3} />
        </motion.span>
      )}
    </AnimatePresence>
  );

  const base =
    "relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const selectedCls = selected
    ? "bg-brand-muted ring-2 ring-brand"
    : "border border-border bg-surface hover:bg-accent/40";

  if (compact) {
    return (
      <motion.button
        type="button"
        aria-pressed={selected}
        aria-label={`${option.label}${notFound ? " (not found)" : ""}`}
        onClick={() => onToggle(option.id)}
        {...pressScale(reduced)}
        className={cn(
          base,
          "flex items-center gap-2 rounded-lg px-2.5 py-1.5",
          selectedCls,
          notFound && "opacity-60",
        )}
      >
        {checkBadge}
        <AppLogo option={option} className="h-5 w-5" />
        <span className="text-xs text-foreground">{option.label}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      aria-label={`${option.label}${notFound ? " (not found)" : ""}`}
      onClick={() => onToggle(option.id)}
      {...pressScale(reduced)}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ duration: DURATION.fast, ease: EASE_OUT }}
      className={cn(
        base,
        "flex flex-col items-center gap-2 rounded-xl p-3",
        selectedCls,
        notFound && "opacity-60",
      )}
    >
      {checkBadge}
      <AppLogo option={option} className="h-8 w-8" />
      <span className="line-clamp-1 text-center text-xs text-foreground">
        {option.label}
      </span>
      {notFound && (
        <span className="text-[10px] leading-none opacity-60">· not found</span>
      )}
    </motion.button>
  );
}

/**
 * Tile-based, logo-first selector. Prop-compatible with the old `ToolChips`
 * (`options`, `selected`, `onToggle`, `availability`) so it drops into the
 * multi-select AI-tools / apps sections, and — via `compact` + a single-item
 * `selected` array — also backs the single-select IDE and terminal-app pickers.
 * Real brand logos with a monogram fallback; motion-driven press + selection
 * feedback (reduced-motion aware).
 */
export function AppPicker({
  options,
  selected,
  onToggle,
  availability,
  compact = false,
}: AppPickerProps) {
  const reduced = useReducedMotion();
  const tiles = options.map((opt) => (
    <AppTile
      key={opt.id}
      option={opt}
      selected={selected.includes(opt.id)}
      notFound={availability?.[opt.id]?.available === false}
      compact={compact}
      reduced={reduced}
      onToggle={onToggle}
    />
  ));

  return (
    <div
      className={cn(
        compact
          ? "flex flex-wrap gap-2"
          : "grid grid-cols-4 gap-2 sm:grid-cols-5",
      )}
    >
      {tiles}
    </div>
  );
}
