import { useId, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Leading glyph shown in a tinted square (size it h-4 w-4 at the call site). */
  icon?: ReactNode;
  /** One-line hint under the title, explaining what the section controls. */
  description?: string;
  /** Right-aligned state summary (e.g. "2 terminals"); shown only while collapsed
   *  so a folded section still tells you what's inside without expanding it. */
  summary?: ReactNode;
  /** Show an error dot in the header (e.g. a collapsed section has invalid fields). */
  hasError?: boolean;
  children: ReactNode;
}

/** Controlled collapsible form section. Accessible disclosure: button header
 *  with `aria-expanded`/`aria-controls`, chevron rotates on open (reduced-motion
 *  aware). Icon + description give the header identity; a collapsed-state summary
 *  and error dot surface what's hidden inside a folded section. */
export function CollapsibleSection({
  title,
  open,
  onOpenChange,
  icon,
  description,
  summary,
  hasError = false,
  children,
}: CollapsibleSectionProps) {
  const panelId = useId();
  const reduced = useReducedMotion();

  return (
    <section className="rounded-xl border border-border bg-elevated/40 transition-colors">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {icon && (
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground"
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-card-title truncate text-foreground">
              {title}
            </span>
            {hasError && (
              <>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                  aria-hidden
                />
                {/* Part of the button's accessible name so SRs announce the error
                    state when the disclosure control is focused. */}
                <span className="sr-only">(has errors)</span>
              </>
            )}
          </span>
          {description && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        {summary != null && !open && (
          <span className="shrink-0 text-xs text-muted-foreground tabular">
            {summary}
          </span>
        )}
        {/* Always rotate so open/closed stays visible under reduced motion —
            the transition just becomes instant instead of animated. */}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduced ? 0 : DURATION.base, ease: EASE_OUT }}
          className="shrink-0 text-muted-foreground"
          aria-hidden
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>
      {/* Height-collapse reveal. `overflow-hidden` lives on the animating box (not
          the section root) so the height 0↔auto transition clips cleanly while the
          section itself can host overflowing children. `initial={false}` skips the
          entrance animation for the default-open section on mount. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : DURATION.base, ease: EASE_OUT }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
