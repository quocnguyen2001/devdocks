import { Toaster as SonnerToaster } from "sonner";
import { useSettingsStore } from "@/store/settings-store";

/** App toast host. Mount once near the root. Sonner provides `aria-live`,
 *  auto-dismiss, and Undo actions (Decision #3). Theme follows the app setting. */
export function Toaster() {
  const theme = useSettingsStore((s) => s.theme);
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-brand text-brand-foreground",
          cancelButton: "bg-secondary text-secondary-foreground",
        },
      }}
    />
  );
}

// Re-export so callers import both from one place.
export { toast } from "sonner";
