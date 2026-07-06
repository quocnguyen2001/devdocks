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

interface EnvVarsSectionProps {
  control: Control<WorkspaceForm>;
  register: UseFormRegister<WorkspaceForm>;
}

export function EnvVarsSection({ control, register }: EnvVarsSectionProps) {
  const fa = useFieldArray({ control, name: "envVars" });
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Environment variables</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fa.append({ key: "", value: "" })}
        >
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
            {...register(`envVars.${i}.key`)}
          />
          <Input placeholder="value" {...register(`envVars.${i}.value`)} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fa.remove(i)}
            aria-label="Remove variable"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </section>
  );
}
