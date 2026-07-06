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
import { toast } from "@/components/ui/toast";
import type { WorkspaceForm } from "@/features/workspace-config/form-model";

interface EnvVarsSectionProps {
  control: Control<WorkspaceForm>;
  register: UseFormRegister<WorkspaceForm>;
  getValues: UseFormGetValues<WorkspaceForm>;
}

export function EnvVarsSection({
  control,
  register,
  getValues,
}: EnvVarsSectionProps) {
  const fa = useFieldArray({ control, name: "envVars" });
  // Index of a just-appended row whose first field should receive focus.
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const add = () => {
    setFocusIdx(fa.fields.length);
    fa.append({ key: "", value: "" });
  };

  const removeWithUndo = (i: number) => {
    const val = getValues(`envVars.${i}`);
    fa.remove(i);
    toast("Variable removed", {
      action: { label: "Undo", onClick: () => fa.insert(i, val) },
    });
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Written to the launched shell — not a secrets-grade store.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {fa.fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
          No variables yet.
        </p>
      ) : (
        <div className="space-y-2">
          {fa.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <Input
                className="w-44 font-mono"
                placeholder="KEY"
                aria-label="Variable name"
                spellCheck={false}
                autoComplete="off"
                {...register(`envVars.${i}.key`)}
                ref={(el) => {
                  register(`envVars.${i}.key`).ref(el);
                  if (el && i === focusIdx) {
                    el.focus();
                    setFocusIdx(null);
                  }
                }}
              />
              <Input
                placeholder="value"
                aria-label="Variable value"
                spellCheck={false}
                autoComplete="off"
                {...register(`envVars.${i}.value`)}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeWithUndo(i)}
                aria-label="Remove variable"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
