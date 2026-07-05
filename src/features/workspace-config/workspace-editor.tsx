import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FolderInput } from "@/components/folder-input";
import { ToolChips } from "@/components/tool-chips";
import { useDetectedTools } from "@/hooks/use-detected-tools";
import {
  AI_TOOL_OPTIONS,
  APP_OPTIONS,
  IDE_OPTIONS,
  TERMINAL_OPTIONS,
} from "@/lib/tool-catalog";
import { cn } from "@/lib/utils";
import { EnvVarsSection } from "@/features/workspace-config/env-vars-section";
import { HooksSection } from "@/features/workspace-config/hooks-section";
import {
  fromWorkspace,
  newFormDefaults,
  toWorkspace,
  workspaceFormSchema,
  type WorkspaceForm,
} from "@/features/workspace-config/form-model";
import type { Workspace } from "@/types/workspace";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface WorkspaceEditorProps {
  initial?: Workspace;
  onSave: (ws: Workspace) => Promise<void> | void;
  onCancel: () => void;
}

export function WorkspaceEditor({
  initial,
  onSave,
  onCancel,
}: WorkspaceEditorProps) {
  const { availability } = useDetectedTools();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WorkspaceForm>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: initial ? fromWorkspace(initial) : newFormDefaults(),
  });

  // keyName defaults to "id", which collides with TerminalConfig.id and would
  // overwrite the real id with RHF's render uid — use a non-colliding key.
  const terminals = useFieldArray({
    control,
    name: "terminals",
    keyName: "fieldId",
  });
  const urls = useFieldArray({
    control,
    name: "browserUrls",
    keyName: "fieldId",
  });

  const aiTools = watch("aiTools");
  const applications = watch("applications");
  const path = watch("path");

  const toggle = (name: "aiTools" | "applications", id: string) => {
    const cur = name === "aiTools" ? aiTools : applications;
    setValue(
      name,
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      { shouldDirty: true },
    );
  };

  const submit = handleSubmit(async (form) => {
    await onSave(toWorkspace(form, initial));
  });

  const ideAvail = (id: string) =>
    availability[id]?.available === false ? " (not found)" : "";

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {initial ? "Edit workspace" : "New workspace"}
        </h2>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* General */}
      <section className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" {...register("name")} placeholder="Laravel CRM" />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Path</Label>
          <FolderInput
            value={path}
            onChange={(v) => setValue("path", v, { shouldDirty: true })}
            placeholder="/Users/me/Projects/app"
          />
          {errors.path && (
            <p className="text-xs text-destructive">{errors.path.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" {...register("description")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" {...register("tags")} placeholder="php, api" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accent">Accent color</Label>
            <Input id="accent" {...register("accentColor")} placeholder="#b8232c" />
          </div>
        </div>
      </section>

      {/* IDE */}
      <section className="space-y-1.5">
        <Label htmlFor="ide">IDE</Label>
        <select id="ide" className={selectClass} {...register("ideApp")}>
          <option value="">None</option>
          {IDE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
              {ideAvail(o.id)}
            </option>
          ))}
        </select>
      </section>

      {/* Terminals */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Terminals</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              terminals.append({
                id: crypto.randomUUID(),
                app: "iterm2",
                cwd: ".",
                command: "",
                delay: 0,
              })
            }
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {terminals.fields.map((f, i) => {
          const isWarp = watch(`terminals.${i}.app`) === "warp";
          return (
            <div
              key={f.fieldId}
              className="space-y-2 rounded-md border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <select
                  className={selectClass}
                  {...register(`terminals.${i}.app`)}
                >
                  {TERMINAL_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => terminals.remove(i)}
                  aria-label="Remove terminal"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  {...register(`terminals.${i}.cwd`)}
                  placeholder="cwd (e.g. . or backend)"
                />
                <Input
                  className={cn("col-span-2", isWarp && "opacity-60")}
                  {...register(`terminals.${i}.command`)}
                  placeholder="command (e.g. npm run dev)"
                  // readOnly (not disabled): RHF excludes disabled fields from
                  // submission, which would make command `undefined` and fail
                  // Zod validation, silently blocking save for Warp terminals.
                  readOnly={isWarp}
                />
              </div>
              {isWarp && (
                <p className="text-xs text-muted-foreground">
                  Warp is launch-only — it can't auto-run a cwd/command.
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* AI tools + applications */}
      <section className="space-y-2">
        <Label>AI tools</Label>
        <ToolChips
          options={AI_TOOL_OPTIONS}
          selected={aiTools}
          onToggle={(id) => toggle("aiTools", id)}
          availability={availability}
        />
      </section>
      <section className="space-y-2">
        <Label>Additional applications</Label>
        <ToolChips
          options={APP_OPTIONS}
          selected={applications}
          onToggle={(id) => toggle("applications", id)}
          availability={availability}
        />
      </section>

      {/* Browser URLs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Browser URLs</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => urls.append({ url: "https://", browser: "" })}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {urls.fields.map((f, i) => (
          <div key={f.fieldId} className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                {...register(`browserUrls.${i}.url`)}
                placeholder="https://example.com"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => urls.remove(i)}
                aria-label="Remove URL"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {errors.browserUrls?.[i]?.url && (
              <p className="text-xs text-destructive">
                {errors.browserUrls[i]?.url?.message}
              </p>
            )}
          </div>
        ))}
      </section>

      <EnvVarsSection control={control} register={register} />
      <HooksSection control={control} register={register} />
    </form>
  );
}
