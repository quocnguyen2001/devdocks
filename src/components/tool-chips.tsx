import { cn } from "@/lib/utils";
import type { ToolOption } from "@/lib/tool-catalog";
import type { Detected } from "@/types/launch";

interface ToolChipsProps {
  options: ToolOption[];
  selected: string[];
  onToggle: (id: string) => void;
  availability?: Record<string, Detected>;
}

/** Toggleable chips for a multi-select tool list, annotated with availability. */
export function ToolChips({
  options,
  selected,
  onToggle,
  availability,
}: ToolChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.id);
        const found = availability?.[opt.id]?.available;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(opt.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "border-input bg-transparent hover:bg-accent",
            )}
          >
            {opt.label}
            {found === false && (
              <span className="ml-1 opacity-60">· not found</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
