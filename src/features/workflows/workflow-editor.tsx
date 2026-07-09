import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "motion/react";
import { useFieldArray, useForm } from "react-hook-form";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorSwatchInput } from "@/components/color-swatch-input";
import { CollapsibleSection } from "@/components/collapsible-section";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StepCard, StepCardOverlay } from "@/features/workflows/step-card";
import { StepTypePicker } from "@/features/workflows/step-type-picker";
import {
  fromWorkflow,
  newStep,
  newWorkflowDefaults,
  toWorkflow,
  workflowFormSchema,
  type StepForm,
  type WorkflowForm,
} from "@/features/workflows/form-model";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { useInstalledAppsStore } from "@/store/installed-apps-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { Workflow } from "@/types/workflow";

interface WorkflowEditorProps {
  initial?: Workflow;
  onSave: (wf: Workflow) => Promise<void> | void;
  onCancel: () => void;
}

export function WorkflowEditor({ initial, onSave, onCancel }: WorkflowEditorProps) {
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetch);
  const fetchInstalledApps = useInstalledAppsStore((s) => s.fetch);
  useEffect(() => {
    void fetchWorkspaces();
    void fetchInstalledApps();
  }, [fetchWorkspaces, fetchInstalledApps]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<WorkflowForm>({
    resolver: zodResolver(workflowFormSchema),
    mode: "onBlur",
    defaultValues: initial ? fromWorkflow(initial) : newWorkflowDefaults(),
  });

  // keyName defaults to "id", which would collide with WorkflowStep.id and get
  // overwritten by RHF's render uid — use a non-colliding key (research pitfall #2).
  const { fields, append, remove, move, insert } = useFieldArray({
    control,
    name: "steps",
    keyName: "fieldId",
  });

  // Open-state is keyed by RHF's `fieldId`. Absent → open, so a freshly added
  // or duplicated step auto-expands. Steps present when editing an existing
  // workflow are seeded collapsed once so the list stays compact.
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const toggleStep = (fieldId: string) =>
    setOpenSteps((s) => ({ ...s, [fieldId]: !s[fieldId] }));
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && fields.length > 0) {
      seededRef.current = true;
      setOpenSteps(Object.fromEntries(fields.map((f) => [f.fieldId, false])));
    }
  }, [fields]);

  const [discardOpen, setDiscardOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appPickerOpen, setAppPickerOpen] = useState(false);
  // Id of the card currently being dragged — drives the DragOverlay clone and
  // suppresses per-item clipping during a drag (issue #2).
  const [activeId, setActiveId] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const accentColor = watch("accentColor") ?? "";
  const activeIndex = activeId
    ? fields.findIndex((f) => f.fieldId === activeId)
    : -1;

  const sensors = useSensors(
    // Require 8px of travel before a drag starts, so a click/tap on the grip
    // (or a scroll) no longer fires a spurious drag (issue #2).
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (over && active.id !== over.id) {
      const from = fields.findIndex((f) => f.fieldId === active.id);
      const to = fields.findIndex((f) => f.fieldId === over.id);
      if (from !== -1 && to !== -1) move(from, to);
    }
  };

  const addStep = (kind: StepForm["kind"]) => {
    // A newly appended step has no entry in `openSteps` yet; unknown steps
    // default to open (see the card's `?? true`), so it auto-expands.
    append(newStep(kind));
  };

  const submit = handleSubmit(async (form) => {
    await onSave(toWorkflow(form, initial));
  });

  const requestCancel = () => (isDirty ? setDiscardOpen(true) : onCancel());

  // The editor owns Escape while mounted: App.tsx suppresses the window-level
  // Escape handler for workflow-new/workflow-edit modes, so this is the only
  // path — same discard confirm as the Cancel button (red-team F11).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Yield Escape to an open overlay: the step-type menu closes itself and
      // the discard dialog (Radix) handles its own Escape. Only treat Escape
      // as editor-cancel when nothing is layered on top.
      if (pickerOpen || discardOpen || appPickerOpen) return;
      e.stopPropagation();
      requestCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestCancel reads latest isDirty via closure each render
  }, [isDirty, pickerOpen, discardOpen, appPickerOpen]);

  const stepsErrorMessage =
    typeof errors.steps?.message === "string" ? errors.steps.message : undefined;
  const errorCount = Object.keys(errors).length;

  return (
    <>
      <form onSubmit={submit} className="flex h-full flex-col">
        <header className="shrink-0 border-b border-border px-6 py-3.5">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={requestCancel}
              aria-label="Back to workflows"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">
                {initial ? "Edit workflow" : "New workflow"}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                Chain workspace launches, apps, scripts, and delays.
              </p>
            </div>
            {isDirty && (
              <span
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground"
                title="Unsaved changes"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                Unsaved
              </span>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto max-w-5xl space-y-3 px-6 py-6">
            <CollapsibleSection
              title="General"
              icon={<Info className="h-4 w-4" />}
              description="Name, description, and accent color."
              open
              onOpenChange={() => {}}
              hasError={!!errors.name}
            >
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="wf-name">Name</Label>
                  <Input
                    id="wf-name"
                    {...register("name")}
                    placeholder="Morning routine"
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "wf-name-error" : undefined}
                  />
                  {errors.name && (
                    <p id="wf-name-error" className="text-xs text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wf-description">Description</Label>
                  <Textarea id="wf-description" {...register("description")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wf-accent">Accent color</Label>
                  <ColorSwatchInput
                    id="wf-accent"
                    value={accentColor}
                    onChange={(v) =>
                      setValue("accentColor", v, { shouldDirty: true })
                    }
                  />
                </div>
              </div>
            </CollapsibleSection>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-card-title text-foreground">Steps</h3>
                {stepsErrorMessage && (
                  <p className="text-xs text-destructive">{stepsErrorMessage}</p>
                )}
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={({ active }) => setActiveId(String(active.id))}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <SortableContext
                  items={fields.map((f) => f.fieldId)}
                  strategy={verticalListSortingStrategy}
                >
                  <AnimatePresence initial={false}>
                    {fields.map((field, index) => (
                      // No Motion `layout` here: it animates size via scale
                      // transforms (blurs card text) and position via translate,
                      // and — unlike enter/exit — is NOT suppressed by
                      // AnimatePresence `initial={false}`. The async store fetches
                      // and the seeding effect re-render on editor open, and an
                      // interrupted layout animation left a stuck, blurred,
                      // overlapping frame. Reorder is already handled by dnd-kit's
                      // own transform; enter/exit reveal is kept below.
                      <motion.div
                        key={field.fieldId}
                        initial={reduced ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={{
                          duration: reduced ? 0 : DURATION.base,
                          ease: EASE_OUT,
                        }}
                        // Clip only for the height reveal; drop it during a drag
                        // so a translating card is never cut off (issue #2).
                        className={
                          activeId === null ? "overflow-hidden pb-2" : "pb-2"
                        }
                      >
                        <StepCard
                          sortableId={field.fieldId}
                          index={index}
                          register={register}
                          watch={watch}
                          setValue={setValue}
                          errors={errors.steps}
                          open={openSteps[field.fieldId] ?? true}
                          onOpenChange={() => toggleStep(field.fieldId)}
                          onAppPickerOpenChange={setAppPickerOpen}
                          onRemove={() => remove(index)}
                          onDuplicate={() => {
                            const dup = {
                              ...watch(`steps.${index}`),
                              id: crypto.randomUUID(),
                            };
                            insert(index + 1, dup);
                          }}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </SortableContext>
                <DragOverlay dropAnimation={reduced ? null : undefined}>
                  {activeIndex >= 0 ? (
                    <StepCardOverlay
                      index={activeIndex}
                      step={watch(`steps.${activeIndex}`)}
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>

              <StepTypePicker onPick={addStep} onOpenChange={setPickerOpen} />
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p aria-live="polite" className="text-xs text-destructive">
              {errorCount > 0 &&
                `${errorCount} field${errorCount > 1 ? "s" : ""} need attention.`}
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
