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
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Environment variables</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Injected into launched terminals and commands. Terminal env is written to
        the shell — not a secrets-grade store.
      </p>
      {fa.fields.map((f, i) => (
        <div key={f.id} className="flex items-center gap-2">
          <Input
            className="w-44"
            placeholder="KEY"
            aria-label="Variable name"
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
    </section>
  );
}
