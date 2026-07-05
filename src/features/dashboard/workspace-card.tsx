import { motion } from "motion/react";
import { Copy, Pencil, Play, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/workspace";

interface WorkspaceCardProps {
  ws: Workspace;
  isFavorite: boolean;
  launching: boolean;
  onLaunch: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function WorkspaceCard({
  ws,
  isFavorite,
  launching,
  onLaunch,
  onToggleFavorite,
  onEdit,
  onDuplicate,
  onDelete,
}: WorkspaceCardProps) {
  const accent = ws.accentColor || undefined;
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4"
      style={
        accent ? { borderLeftColor: accent, borderLeftWidth: "3px" } : undefined
      }
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{ws.name}</p>
          <p className="truncate text-xs text-muted-foreground">{ws.path}</p>
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Star
            className={cn("h-4 w-4", isFavorite && "fill-yellow-400 text-yellow-400")}
          />
        </button>
      </div>

      {ws.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ws.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between">
        <Button size="sm" onClick={onLaunch} disabled={launching}>
          <Play className="h-4 w-4" /> Launch
        </Button>
        <div className="flex gap-0.5">
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDuplicate}
            aria-label="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
