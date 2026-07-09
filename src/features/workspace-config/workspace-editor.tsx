import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Braces,
  Code2,
  Globe,
  Info,
  Plus,
  Sparkles,
  Terminal,
  Trash2,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/dialog";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ColorSwatchInput } from "@/components/color-swatch-input";
import { FolderInput } from "@/components/folder-input";
import { AppPicker } from "@/components/app-picker";
import { useDetectedTools } from "@/hooks/use-detected-tools";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { DURATION, EASE_OUT } from "@/lib/motion";
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

  const reduced = useReducedMotion();
  const aiTools = watch("aiTools");
  const applications = watch("applications");
  const path = watch("path");
  const accentColor = watch("accentColor") ?? "";
  const ideApp = watch("ideApp") ?? "";

  // Collapsed-section summaries: let a folded section report its state at a
  // glance (Linear-style) instead of forcing an expand to check.
  const ideLabel = IDE_OPTIONS.find((o) => o.id === ideApp)?.label;
  const hooksVal = watch("hooks");
  const hookCount =
    (hooksVal?.beforeLaunch.length ?? 0) +
    (hooksVal?.afterLaunch.length ?? 0) +
    (hooksVal?.beforeClose.length ?? 0);
  const countLabel = (n: number, noun: string) =>
    n === 0 ? "None" : `${n} ${noun}${n === 1 ? "" : "s"}`;

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

  return (
    <>
      {/* Full-height flex column: pinned header + footer, one scroll region in
          between — so the window frame no longer scrolls as a whole. */}
      <form onSubmit={submit} className="flex h-full flex-col">
        <header className="shrink-0 border-b border-border px-6 py-3.5">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={requestCancel}
              aria-label="Back to workspaces"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">
                {initial ? "Edit workspace" : "New workspace"}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {initial
                  ? initial.path
                  : "Set up a launch profile — editor, terminals, tools, and hooks."}
              </p>
            </div>
            {isDirty && (
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground"
                title="Unsaved changes"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-brand"
                  aria-hidden
                />
                Unsaved
              </span>
            )}
          </div>
        </header>

        {/* The single scroll region. `min-h-0` lets this flex child shrink below
            its content so overflow scrolls here, not on the app shell. */}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-5xl space-y-3 px-6 py-6">
            <CollapsibleSection
              title="General"
              icon={<Info className="h-4 w-4" />}
              description="Name, path, description, tags, and accent color."
              open={open.general}
              onOpenChange={() => toggle("general")}
              hasError={sectionHasError("general")}
            >
              <div className="space-y-3">
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label>Path</Label>
                  <FolderInput
                    value={path}
                    onChange={(v) => setValue("path", v, { shouldDirty: true })}
                    placeholder="/Users/me/Projects/app"
                  />
                  {errors.path && (
                    <p className="text-xs text-destructive">
                      {errors.path.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" {...register("description")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags (comma-separated)</Label>
                    <Input
                      id="tags"
                      {...register("tags")}
                      placeholder="php, api"
                    />
                  </div>
                  <div className="space-y-2">
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
              icon={<Code2 className="h-4 w-4" />}
              description="Editor to open the project in."
              summary={ideLabel ?? "None"}
              open={open.ide}
              onOpenChange={() => toggle("ide")}
              hasError={sectionHasError("ide")}
            >
              {/* Single-select: an empty selection = "None". Clicking the
                  active editor again clears it back to None. */}
              <AppPicker
                compact
                options={IDE_OPTIONS}
                selected={ideApp ? [ideApp] : []}
                onToggle={(id) =>
                  setValue("ideApp", ideApp === id ? "" : id, {
                    shouldDirty: true,
                  })
                }
                availability={availability}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Terminals"
              icon={<Terminal className="h-4 w-4" />}
              description="Terminal tabs to spawn on launch."
              summary={countLabel(terminals.fields.length, "terminal")}
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
                <AnimatePresence initial={false}>
                  {terminals.fields.map((f, i) => {
                    const isWarp = watch(`terminals.${i}.app`) === "warp";
                    return (
                      // No Motion `layout`: it animates size via scale (blurs
                      // content) and isn't suppressed by `initial={false}`, so a
                      // re-render (watch/async) mid-animation can leave a stuck,
                      // blurred, overlapping frame. Enter/exit reveal is enough.
                      <motion.div
                        key={f.fieldId}
                        initial={reduced ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={
                          reduced
                            ? { opacity: 0 }
                            : { opacity: 0, height: 0 }
                        }
                        transition={{
                          duration: reduced ? 0 : DURATION.base,
                          ease: EASE_OUT,
                        }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 rounded-md border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <AppPicker
                                compact
                                options={TERMINAL_OPTIONS}
                                selected={[watch(`terminals.${i}.app`)]}
                                onToggle={(id) =>
                                  setValue(`terminals.${i}.app`, id, {
                                    shouldDirty: true,
                                  })
                                }
                                availability={availability}
                              />
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
                              className={cn(
                                "col-span-2",
                                isWarp && "opacity-60",
                              )}
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
                              Warp is launch-only — it can't auto-run a
                              cwd/command.
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="AI tools & applications"
              icon={<Sparkles className="h-4 w-4" />}
              description="AI assistants and extra apps to open."
              summary={
                aiTools.length + applications.length === 0
                  ? "None"
                  : `${aiTools.length + applications.length} selected`
              }
              open={open.tools}
              onOpenChange={() => toggle("tools")}
              hasError={sectionHasError("tools")}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>AI tools</Label>
                  <AppPicker
                    options={AI_TOOL_OPTIONS}
                    selected={aiTools}
                    onToggle={(id) => toggleTool("aiTools", id)}
                    availability={availability}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Additional applications</Label>
                  <AppPicker
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
              icon={<Globe className="h-4 w-4" />}
              description="Pages to open in your browser on launch."
              summary={countLabel(urls.fields.length, "URL")}
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
                    onClick={() =>
                      urls.append({ url: "https://", browser: "" })
                    }
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
                <AnimatePresence initial={false}>
                  {urls.fields.map((f, i) => (
                    // No Motion `layout` — see the terminals list above for why
                    // (scale-blur + interrupted-animation corruption on re-render).
                    <motion.div
                      key={f.fieldId}
                      initial={reduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{
                        duration: reduced ? 0 : DURATION.base,
                        ease: EASE_OUT,
                      }}
                      className="space-y-1 overflow-hidden"
                    >
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
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Environment variables"
              icon={<Braces className="h-4 w-4" />}
              description="Injected into launched terminals and commands."
              summary={countLabel(watch("envVars")?.length ?? 0, "variable")}
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
              icon={<Webhook className="h-4 w-4" />}
              description="Shell commands run at launch/close lifecycle points."
              summary={countLabel(hookCount, "hook")}
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
          </div>
        </div>

        {/* Pinned action bar — Save/Cancel always reachable without scrolling;
            announces validation errors via aria-live. */}
        <footer className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
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
        </footer>
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
