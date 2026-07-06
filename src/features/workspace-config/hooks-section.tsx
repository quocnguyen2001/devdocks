import {
  useFieldArray,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceForm } from "@/features/workspace-config/form-model";

type HookPath = "hooks.beforeLaunch" | "hooks.afterLaunch" | "hooks.beforeClose";

interface HookListProps {
  control: Control<WorkspaceForm>;
  register: UseFormRegister<WorkspaceForm>;
  name: HookPath;
  title: string;
  note?: string;
}

function HookList({ control, register, name, title, note }: HookListProps) {
  const fa = useFieldArray({ control, name });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            fa.append({
              command: "",
              cwd: "",
              timeoutSecs: 30,
              failurePolicy: "continue",
            })
          }
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {fa.fields.map((f, i) => (
        <div
          key={f.id}
          className="grid grid-cols-[1fr_5rem_6rem_auto] items-center gap-2"
        >
          <Input
            {...register(`${name}.${i}.command`)}
            placeholder="command (runs via sh -c)"
          />
          <Input
            type="number"
            min={1}
            aria-label="timeout seconds"
            {...register(`${name}.${i}.timeoutSecs`, { valueAsNumber: true })}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="failure policy"
            {...register(`${name}.${i}.failurePolicy`)}
          >
            <option value="continue">continue</option>
            <option value="halt">halt</option>
          </select>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fa.remove(i)}
            aria-label="Remove hook"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

interface HooksSectionProps {
  control: Control<WorkspaceForm>;
  register: UseFormRegister<WorkspaceForm>;
}

export function HooksSection({ control, register }: HooksSectionProps) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Hooks</h3>
        <p className="text-xs text-muted-foreground">
          Shell commands run at lifecycle points, with your privileges via{" "}
          <code className="rounded bg-muted px-1">sh -c</code>. Each is bounded by
          its timeout; "halt" stops the run on failure.
        </p>
      </div>
      <HookList
        control={control}
        register={register}
        name="hooks.beforeLaunch"
        title="Before launch"
      />
      <HookList
        control={control}
        register={register}
        name="hooks.afterLaunch"
        title="After launch"
      />
      <HookList
        control={control}
        register={register}
        name="hooks.beforeClose"
        title="Before close"
        note="Best-effort on app quit — not guaranteed on force-quit, crash, or logout."
      />
    </section>
  );
}
