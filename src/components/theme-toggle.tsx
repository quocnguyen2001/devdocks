import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settings-store";
import type { Theme } from "@/types/theme";

const cycle: Theme[] = ["light", "dark", "system"];
const icons: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Cycles theme light → dark → system and persists the choice. */
export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const Icon = icons[theme];

  const next = () =>
    void setTheme(cycle[(cycle.indexOf(theme) + 1) % cycle.length]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={next}
      aria-label={`Theme: ${theme}. Click to change.`}
      title={`Theme: ${theme}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
