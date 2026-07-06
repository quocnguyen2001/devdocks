import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/dialog";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ColorSwatchInput } from "@/components/color-swatch-input";
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

type SectionKey =
  | "general"
  | "ide"
  | "terminals"
  | "tools"
  | "urls"
  | "env"
  | "hooks";

// Which collapsible section owns each top-level form field (for the error dot +
// auto-expand on failed submit).
const SECTION_FOR_FIELD: Record<string, SectionKey> = {
  name: "general",
  path: "general",
  description: "general",
  tags: "general",
  accentColor: "general",
  ideApp: "ide",
  terminals: "terminals",
  aiTools: "tools",
  applications: "tools",
  browserUrls: "urls",
  envVars: "env",
  hooks: "hooks",
};

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
    setFocus,
    getValues,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<WorkspaceForm>({
    resolver: zodResolver(workspaceFormSchema),
    mode: "onBlur",
    defaultValues: initial ? fromWorkspace(initial) : newFormDefaults(),
  });

  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    general: true,
    ide: false,
    terminals: false,
    tools: false,
    urls: false,
    env: false,
    hooks: false,
  });
  const toggle = (k: SectionKey) => setOpen((s) => ({ ...s, [k]: !s[k] }));
  const [discardOpen, setDiscardOpen] = useState(false);

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
  const accentColor = watch("accentColor") ?? "";

  const toggleTool = (name: "aiTools" | "applications", id: string) => {
    const cur = name === "aiTools" ? aiTools : applications;
    setValue(
      name,
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      { shouldDirty: true },
    );
  };

  const errorKeys = Object.keys(errors);
  const sectionHasError = (k: SectionKey) =>
    errorKeys.some((f) => SECTION_FOR_FIELD[f] === k);

  const submit = handleSubmit(
    async (form) => {
      await onSave(toWorkspace(form, initial));
    },
    (errs) => {
      // Expand every section that contains an error, then focus the first one.
      const keys = Object.keys(errs);
      setOpen((s) => {
        const next = { ...s };
        keys.forEach((k) => {
          const sec = SECTION_FOR_FIELD[k];
          if (sec) next[sec] = true;
        });
        return next;
      });
      const first = keys[0] as keyof WorkspaceForm | undefined;
      if (first) {
        try {
          setFocus(first);
        } catch {
          /* array-path fields aren't directly focusable — best effort */
        }
      }
    },
  );

  const requestCancel = () => (isDirty ? setDiscardOpen(true) : onCancel());

  const ideAvail = (id: string) =>
    availability[id]?.available === false ? " (not found)" : "";

  return (
    <>
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 p-6 pb-24">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            {initial ? "Edit workspace" : "New workspace"}
          </h2>
          {isDirty && (
            <span
              className="h-2 w-2 rounded-full bg-brand"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </div>

        <CollapsibleSection
          title="General"
          open={open.general}
          onOpenChange={() => toggle("general")}
          hasError={sectionHasError("general")}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="Laravel CRM"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {errors.name && (
                <p id="name-error" className="text-xs text-destructive">
                  {errors.name.message}
                </p>
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
                <ColorSwatchInput
                  id="accent"
                  value={accentColor}
                  onChange={(v) =>
                    setValue("accentColor", v, { shouldDirty: true })
                  }
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="IDE"
          open={open.ide}
          onOpenChange={() => toggle("ide")}
          hasError={sectionHasError("ide")}
        >
          <Select id="ide" {...register("ideApp")}>
            <option value="">None</option>
            {IDE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {ideAvail(o.id)}
              </option>
            ))}
          </Select>
        </CollapsibleSection>

        <CollapsibleSection
          title="Terminals"
          open={open.terminals}
          onOpenChange={() => toggle("terminals")}
          hasError={sectionHasError("terminals")}
        >
          <div className="space-y-3">
            <div className="flex justify-end">
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
                    <div className="flex-1">
                      <Select {...register(`terminals.${i}.app`)}>
                        {TERMINAL_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </div>
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
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="AI tools & applications"
          open={open.tools}
          onOpenChange={() => toggle("tools")}
          hasError={sectionHasError("tools")}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>AI tools</Label>
              <ToolChips
                options={AI_TOOL_OPTIONS}
                selected={aiTools}
                onToggle={(id) => toggleTool("aiTools", id)}
                availability={availability}
              />
            </div>
            <div className="space-y-2">
              <Label>Additional applications</Label>
              <ToolChips
                options={APP_OPTIONS}
                selected={applications}
                onToggle={(id) => toggleTool("applications", id)}
                availability={availability}
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Browser URLs"
          open={open.urls}
          onOpenChange={() => toggle("urls")}
          hasError={sectionHasError("urls")}
        >
          <div className="space-y-3">
            <div className="flex justify-end">
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
                    aria-invalid={!!errors.browserUrls?.[i]?.url}
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
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Environment variables"
          open={open.env}
          onOpenChange={() => toggle("env")}
          hasError={sectionHasError("env")}
        >
          <EnvVarsSection
            control={control}
            register={register}
            getValues={getValues}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Hooks"
          open={open.hooks}
          onOpenChange={() => toggle("hooks")}
          hasError={sectionHasError("hooks")}
        >
          <HooksSection
            control={control}
            register={register}
            getValues={getValues}
          />
        </CollapsibleSection>

        {/* Sticky action bar — Save/Cancel always reachable; announces errors. */}
        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-border bg-surface/90 px-6 py-3 backdrop-blur">
          <p aria-live="polite" className="text-xs text-destructive">
            {errorKeys.length > 0 &&
              `${errorKeys.length} field${errorKeys.length > 1 ? "s" : ""} need attention.`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={requestCancel}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Save
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard changes?"
        description="You have unsaved changes. Leaving will discard them."
        confirmLabel="Discard"
        destructive
        onConfirm={onCancel}
      />
    </>
  );
}
