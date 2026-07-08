import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AppWindow,
  ChevronDown,
  Clock,
  Copy,
  GripVertical,
  Play,
  Terminal,
  Trash2,
} from "lucide-react";
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FolderInput } from "@/components/folder-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { StepForm, WorkflowForm } from "@/features/workflows/form-model";
import { useInstalledAppsStore } from "@/store/installed-apps-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { cn } from "@/lib/utils";

const KIND_META: Record<StepForm["kind"], { label: string; icon: typeof Play }> = {
  launchWorkspace: { label: "Launch workspace", icon: Play },
  openApp: { label: "Open app", icon: AppWindow },
  runScript: { label: "Run script", icon: Terminal },
  delay: { label: "Delay", icon: Clock },
};

interface StepCardProps {
  sortableId: string;
  index: number;
  register: UseFormRegister<WorkflowForm>;
  watch: UseFormWatch<WorkflowForm>;
  setValue: UseFormSetValue<WorkflowForm>;
  errors: FieldErrors<WorkflowForm>["steps"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

/** One step card in the ordered list: drag handle (also the keyboard reorder
 *  affordance), kind icon, label/kind summary, enable toggle, actions menu, and
 *  a collapsible body of per-kind fields + the common failurePolicy footer. */
export function StepCard({
  sortableId,
  index,
  register,
  watch,
  setValue,
  errors,
  open,
  onOpenChange,
  onRemove,
  onDuplicate,
}: StepCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortableId });
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const installedApps = useInstalledAppsStore((s) => s.apps);

  const step = watch(`steps.${index}`);
  const kind = step.kind;
  const { label: kindLabel, icon: Icon } = KIND_META[kind];
  const stepErrors = errors?.[index];
  const hasError = !!stepErrors;

  // RHF's FieldErrors type merges every discriminant member into one shape, so
  // TS can't narrow a per-kind field (e.g. `workspaceId`) off a discriminated
  // union's error object. Runtime `kind` already guards which field renders,
  // so this indexed read is safe; the cast is confined to error-message lookup.
  const fieldError = (name: string): string | undefined =>
    (stepErrors as Record<string, { message?: string }> | undefined)?.[name]
      ?.message;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-border bg-elevated/40",
        isDragging && "relative z-10 opacity-90 shadow-popover",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder step ${index + 1}: ${step.label || kindLabel}`}
          className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 text-left"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground"
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {index + 1}. {step.label || kindLabel}
              </span>
              {hasError && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                  aria-hidden
                />
              )}
              {!step.enabled && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  (disabled)
                </span>
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {kindLabel}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        <span id={`step-${sortableId}-enabled-label`} className="sr-only">
          Enable step {index + 1}
        </span>
        <Switch
          id={`step-${sortableId}-enabled`}
          checked={step.enabled}
          onCheckedChange={(v) =>
            setValue(`steps.${index}.enabled`, v, { shouldDirty: true })
          }
          aria-labelledby={`step-${sortableId}-enabled-label`}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onDuplicate}
          aria-label="Duplicate step"
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          aria-label="Delete step"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border p-3.5">
          <div className="space-y-1.5">
            <Label htmlFor={`step-${sortableId}-label`}>Label (optional)</Label>
            <Input
              id={`step-${sortableId}-label`}
              {...register(`steps.${index}.label`)}
              placeholder={kindLabel}
            />
          </div>

          {kind === "launchWorkspace" && (
            <div className="space-y-1.5">
              <Label htmlFor={`step-${sortableId}-ws`}>Workspace</Label>
              <Select
                id={`step-${sortableId}-ws`}
                {...register(`steps.${index}.workspaceId`)}
                aria-invalid={!!fieldError("workspaceId")}
              >
                <option value="">Select a workspace…</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </Select>
              {step.kind === "launchWorkspace" &&
                step.workspaceId &&
                !workspaces.some((ws) => ws.id === step.workspaceId) && (
                  <p className="text-xs text-destructive">
                    This workspace was deleted.
                  </p>
                )}
              {fieldError("workspaceId") && (
                <p className="text-xs text-destructive">
                  {fieldError("workspaceId")}
                </p>
              )}
            </div>
          )}

          {kind === "openApp" && (
            <div className="space-y-1.5">
              <Label htmlFor={`step-${sortableId}-app`}>App name</Label>
              {/* Pick-or-type: the datalist lists apps installed on this machine,
                  but a custom name is still accepted (validated on run). */}
              <Input
                id={`step-${sortableId}-app`}
                list={`step-${sortableId}-app-list`}
                {...register(`steps.${index}.appName`)}
                placeholder="Slack"
                autoComplete="off"
                aria-invalid={!!fieldError("appName")}
              />
              <datalist id={`step-${sortableId}-app-list`}>
                {installedApps.map((app) => (
                  <option key={app.path} value={app.name} />
                ))}
              </datalist>
              {fieldError("appName") && (
                <p className="text-xs text-destructive">
                  {fieldError("appName")}
                </p>
              )}
            </div>
          )}

          {kind === "runScript" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`step-${sortableId}-cmd`}>Command</Label>
                <Textarea
                  id={`step-${sortableId}-cmd`}
                  {...register(`steps.${index}.command`)}
                  placeholder="npm run build"
                  aria-invalid={!!fieldError("command")}
                />
                {fieldError("command") && (
                  <p className="text-xs text-destructive">
                    {fieldError("command")}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Working directory (optional)</Label>
                  <FolderInput
                    value={step.kind === "runScript" ? step.cwd : ""}
                    onChange={(v) =>
                      setValue(`steps.${index}.cwd`, v, { shouldDirty: true })
                    }
                    placeholder="Workspace directory"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`step-${sortableId}-timeout`}>
                    Timeout (secs)
                  </Label>
                  <Input
                    id={`step-${sortableId}-timeout`}
                    type="number"
                    min={1}
                    max={3600}
                    {...register(`steps.${index}.timeoutSecs`, {
                      valueAsNumber: true,
                    })}
                    aria-invalid={!!fieldError("timeoutSecs")}
                  />
                </div>
              </div>
            </div>
          )}

          {kind === "delay" && (
            <div className="space-y-1.5">
              <Label htmlFor={`step-${sortableId}-duration`}>
                Duration (ms)
              </Label>
              <Input
                id={`step-${sortableId}-duration`}
                type="number"
                min={1}
                max={3_600_000}
                {...register(`steps.${index}.durationMs`, {
                  valueAsNumber: true,
                })}
                aria-invalid={!!fieldError("durationMs")}
              />
              {fieldError("durationMs") && (
                <p className="text-xs text-destructive">
                  {fieldError("durationMs")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5 border-t border-border pt-3">
            <Label htmlFor={`step-${sortableId}-policy`}>On failure</Label>
            <Select
              id={`step-${sortableId}-policy`}
              {...register(`steps.${index}.failurePolicy`)}
            >
              <option value="continue">Continue to next step</option>
              <option value="halt">Halt the run</option>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
