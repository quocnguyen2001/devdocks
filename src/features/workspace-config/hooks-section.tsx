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

type HookPath =
  | "hooks.beforeLaunch"
  | "hooks.afterLaunch"
  | "hooks.beforeClose";

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
    fa.append({
      command: "",
      cwd: "",
      timeoutSecs: 30,
      failurePolicy: "continue",
    });
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label>{title}</Label>
          {note && (
            <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {fa.fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
          No {title.toLowerCase()} hooks.
        </p>
      ) : (
        <div className="space-y-2">
          {fa.fields.map((f, i) => (
            <div
              key={f.id}
              className="space-y-2.5 rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex items-start gap-2">
                <Input
                  className="flex-1 font-mono"
                  {...register(`${name}.${i}.command`)}
                  placeholder="command (runs via sh -c)"
                  aria-label="hook command"
                  spellCheck={false}
                  autoComplete="off"
                  ref={(el) => {
                    register(`${name}.${i}.command`).ref(el);
                    if (el && i === focusIdx) {
                      el.focus();
                      setFocusIdx(null);
                    }
                  }}
                />
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
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    Timeout (s)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-24"
                    aria-label="timeout seconds"
                    {...register(`${name}.${i}.timeoutSecs`, {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    On failure
                  </span>
                  <Select
                    className="h-8 w-32"
                    aria-label="failure policy"
                    {...register(`${name}.${i}.failurePolicy`)}
                  >
                    <option value="continue">Continue</option>
                    <option value="halt">Halt run</option>
                  </Select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface HooksSectionProps {
  control: Control<WorkspaceForm>;
  register: UseFormRegister<WorkspaceForm>;
  getValues: UseFormGetValues<WorkspaceForm>;
}

export function HooksSection({
  control,
  register,
  getValues,
}: HooksSectionProps) {
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
