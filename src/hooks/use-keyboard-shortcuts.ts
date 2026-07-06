import { useEffect } from "react";

interface Shortcuts {
  onNew?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
}

/** App-level keyboard shortcuts: ⌘/Ctrl+N (new), ⌘/Ctrl+F (search), Esc.
 *  A callback only fires (and only preempts the default) when provided. */
export function useKeyboardShortcuts({ onNew, onSearch, onEscape }: Shortcuts) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === "n" && onNew) {
        e.preventDefault();
        onNew();
      } else if (meta && key === "f" && onSearch) {
        e.preventDefault();
        onSearch();
      } else if (e.key === "Escape" && onEscape) {
        onEscape();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNew, onSearch, onEscape]);
}
