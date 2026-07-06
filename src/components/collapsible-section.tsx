import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Show an error dot in the header (e.g. a collapsed section has invalid fields). */
  hasError?: boolean;
  children: ReactNode;
}

/** Controlled collapsible form section. Accessible disclosure: button header
 *  with `aria-expanded`/`aria-controls`, chevron rotates on open (reduced-motion
 *  aware). An error dot surfaces problems hidden inside a collapsed section. */
export function CollapsibleSection({
  title,
  open,
  onOpenChange,
  hasError = false,
  children,
}: CollapsibleSectionProps) {
  const panelId = useId();
  const reduced = useReducedMotion();

  return (
    <section className="rounded-lg border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          {title}
          {hasError && (
            <>
              <span
                className="h-1.5 w-1.5 rounded-full bg-destructive"
                aria-hidden
              />
              {/* Part of the button's accessible name so SRs announce the error
                  state when the disclosure control is focused. */}
              <span className="sr-only">(has errors)</span>
            </>
          )}
        </span>
        <motion.span
          animate={reduced ? undefined : { rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>
      {open && (
        <div id={panelId} className={cn("border-t border-border p-3")}>
          {children}
        </div>
      )}
    </section>
  );
}
