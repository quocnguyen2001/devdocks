import { useState } from "react";
import {
  useFieldArray,
  type Control,
  type UseFormGetValues,
  type UseFormRegister,
} from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { WorkspaceForm } from "@/features/workspace-config/form-model";

type HookPath = "hooks.beforeLaunch" | "hooks.afterLaunch" | "hooks.beforeClose";

interface HookListProps {
  control: Control<WorkspaceForm>;
  register: UseFormRegister<WorkspaceForm>;
  getValues: UseFormGetValues<WorkspaceForm>;
  name: HookPath;
  title: string;
  note?: string;
}

function HookList({
  control,
  register,
  getValues,
  name,
  title,
  note,
}: HookListProps) {
  const fa = useFieldArray({ control, name });
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const add = () => {
    setFocusIdx(fa.fields.length);
    fa.append({ command: "", cwd: "", timeoutSecs: 30, failurePolicy: "continue" });
  };

  const removeWithUndo = (i: number) => {
    const val = getValues(`${name}.${i}`);
    fa.remove(i);
    toast("Hook removed", {
      action: { label: "Undo", onClick: () => fa.insert(i, val) },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {fa.fields.length > 0 && (
        <div className="grid grid-cols-[1fr_5rem_6rem_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>Command</span>
          <span>Timeout&nbsp;s</span>
          <span>On&nbsp;fail</span>
          <span className="sr-only">Actions</span>
        </div>
      )}
      {fa.fields.map((f, i) => (
        <div
          key={f.id}
          className="grid grid-cols-[1fr_5rem_6rem_auto] items-center gap-2"
        >
          <Input
            {...register(`${name}.${i}.command`)}
            placeholder="command (runs via sh -c)"
            aria-label="hook command"
            ref={(el) => {
              register(`${name}.${i}.command`).ref(el);
              if (el && i === focusIdx) {
                el.focus();
                setFocusIdx(null);
              }
            }}
          />
          <Input
            type="number"
            min={1}
            aria-label="timeout seconds"
            {...register(`${name}.${i}.timeoutSecs`, { valueAsNumber: true })}
          />
          <Select aria-label="failure policy" {...register(`${name}.${i}.failurePolicy`)}>
            <option value="continue">continue</option>
            <option value="halt">halt</option>
          </Select>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => removeWithUndo(i)}
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
  getValues: UseFormGetValues<WorkspaceForm>;
}

export function HooksSection({ control, register, getValues }: HooksSectionProps) {
  return (
    <section className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Shell commands run at lifecycle points, with your privileges via{" "}
        <code className="rounded bg-muted px-1">sh -c</code>. Each is bounded by
        its timeout; "halt" stops the run on failure.
      </p>
      <HookList
        control={control}
        register={register}
        getValues={getValues}
        name="hooks.beforeLaunch"
        title="Before launch"
      />
      <HookList
        control={control}
        register={register}
        getValues={getValues}
        name="hooks.afterLaunch"
        title="After launch"
      />
      <HookList
        control={control}
        register={register}
        getValues={getValues}
        name="hooks.beforeClose"
        title="Before close"
        note="Best-effort on app quit — not guaranteed on force-quit, crash, or logout."
      />
    </section>
  );
}
