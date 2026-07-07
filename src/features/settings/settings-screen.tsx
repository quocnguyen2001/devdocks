import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settings-store";
import {
  FONT_FAMILY_LABELS,
  UI_SCALE_LABELS,
  type FontFamily,
  type UiScale,
} from "@/types/settings";
import type { Theme } from "@/types/theme";
import { cn } from "@/lib/utils";

interface Option<T> {
  value: T;
  label: string;
}

/** Segmented single-choice control (radiogroup) for compact enum settings. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabelledby,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabelledby?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledby}
      className="inline-flex items-center rounded-lg border border-input bg-muted p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-section">{title}</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-elevated/40">
        {children}
      </div>
    </section>
  );
}

/** One setting row: label + optional description on the left, control on the
 *  right. The control (a radiogroup or switch — not a native labelable input) is
 *  associated to the label via `aria-labelledby={labelId}`, so the label carries
 *  an `id` but no `htmlFor`. */
function SettingRow({
  label,
  description,
  labelId,
  control,
}: {
  label: string;
  description?: string;
  labelId?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

const THEME_OPTIONS: Option<Theme>[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const FONT_OPTIONS = (Object.keys(FONT_FAMILY_LABELS) as FontFamily[]).map(
  (v) => ({ value: v, label: FONT_FAMILY_LABELS[v] }),
);

const SCALE_OPTIONS = (Object.keys(UI_SCALE_LABELS) as UiScale[]).map((v) => ({
  value: v,
  label: UI_SCALE_LABELS[v],
}));

export function SettingsScreen() {
  const {
    theme,
    fontFamily,
    uiScale,
    launchAtLogin,
    setTheme,
    setFontFamily,
    setUiScale,
    setLaunchAtLogin,
    resetAppearance,
  } = useSettingsStore();

  const themeId = useId();
  const fontId = useId();
  const scaleId = useId();
  const loginId = useId();

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-display">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Appearance and startup preferences for DevDock.
        </p>
      </div>

      <SettingsSection title="Appearance">
        <SettingRow
          label="Theme"
          description="Match the system, or force light / dark."
          labelId={themeId}
          control={
            <Segmented
              ariaLabelledby={themeId}
              options={THEME_OPTIONS}
              value={theme}
              onChange={(v) => void setTheme(v)}
            />
          }
        />
        <SettingRow
          label="Font"
          description="System is SF Pro on macOS; Rounded / Mono / Serif use native families."
          labelId={fontId}
          control={
            <Segmented
              ariaLabelledby={fontId}
              options={FONT_OPTIONS}
              value={fontFamily}
              onChange={(v) => void setFontFamily(v)}
            />
          }
        />
        <SettingRow
          label="Interface size"
          description="Scales the whole interface, like an editor's zoom."
          labelId={scaleId}
          control={
            <Segmented
              ariaLabelledby={scaleId}
              options={SCALE_OPTIONS}
              value={uiScale}
              onChange={(v) => void setUiScale(v)}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Startup">
        <SettingRow
          label="Launch at login"
          description="Open DevDock automatically when you sign in to your Mac."
          labelId={loginId}
          control={
            <Switch
              aria-labelledby={loginId}
              checked={launchAtLogin}
              onCheckedChange={(v) => void setLaunchAtLogin(v)}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="About">
        <SettingRow
          label="Version"
          control={
            <span className="text-mono tabular text-muted-foreground">
              v{__APP_VERSION__}
            </span>
          }
        />
        <SettingRow
          label="Reset appearance"
          description="Restore theme, font, and interface size to defaults."
          control={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void resetAppearance()}
            >
              Reset
            </Button>
          }
        />
      </SettingsSection>
    </div>
  );
}
