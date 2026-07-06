import { useState } from "react";
import { motion } from "motion/react";
import {
  AppWindow,
  Code2,
  Copy,
  Globe,
  Pencil,
  Play,
  Sparkles,
  SquareTerminal,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { fadeInUp, starPulse } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/workspace";

interface WorkspaceCardProps {
  ws: Workspace;
  isFavorite: boolean;
  /** True only while THIS workspace's launch is in flight. */
  launching: boolean;
  onLaunch: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Icons summarizing what a workspace launches (at-a-glance "tool stack"). */
function toolStack(ws: Workspace) {
  const items: { key: string; icon: typeof Code2; label: string }[] = [];
  if (ws.ide) items.push({ key: "ide", icon: Code2, label: `IDE: ${ws.ide.app}` });
  if (ws.terminals.length)
    items.push({
      key: "term",
      icon: SquareTerminal,
      label: `${ws.terminals.length} terminal(s)`,
    });
  if (ws.aiTools.length)
    items.push({
      key: "ai",
      icon: Sparkles,
      label: `${ws.aiTools.length} AI tool(s)`,
    });
  if (ws.applications.length)
    items.push({
      key: "app",
      icon: AppWindow,
      label: `${ws.applications.length} app(s)`,
    });
  if (ws.browserUrls.length)
    items.push({
      key: "url",
      icon: Globe,
      label: `${ws.browserUrls.length} URL(s)`,
    });
  return items;
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stack = toolStack(ws);

  return (
    <motion.div
      className="group flex flex-col gap-3 rounded-xl border border-border bg-elevated/70 p-4 shadow-xs transition-[box-shadow,border-color] hover:border-border-strong hover:shadow-md"
      style={
        accent ? { borderLeftColor: accent, borderLeftWidth: "3px" } : undefined
      }
      {...fadeInUp(reduced)}
      whileHover={reduced ? undefined : { y: -2 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{ws.name}</p>
          <p className="truncate text-xs text-muted-foreground">{ws.path}</p>
        </div>
        <motion.button
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
          className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...starPulse(reduced)}
        >
          <Star
            className={cn(
              "h-4 w-4",
              isFavorite && "fill-yellow-400 text-yellow-400",
            )}
          />
        </motion.button>
      </div>

      {stack.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 text-muted-foreground">
          {stack.map(({ key, icon: Icon, label }) => (
            <span
              key={key}
              className="flex items-center gap-1 text-xs"
              title={label}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">{label}</span>
            </span>
          ))}
        </div>
      )}

      {ws.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ws.tags.map((t) => (
            <Badge key={t} size="sm">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between">
        <Button size="sm" onClick={onLaunch} loading={launching}>
          {!launching && <Play className="h-4 w-4" />} Launch
        </Button>
        {/* Secondary actions: revealed on hover/focus, always present for keyboard. */}
        <div className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
            onClick={() => setConfirmOpen(true)}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${ws.name}"?`}
        description="This removes the workspace configuration. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </motion.div>
  );
}
