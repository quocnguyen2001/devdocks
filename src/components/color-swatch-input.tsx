import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import { Input } from "@/components/ui/input";
import { isHexColor } from "@/lib/color";
import { cn } from "@/lib/utils";

interface ColorSwatchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
}

const POPOVER_HEIGHT = 220; // approx react-colorful popover height incl. padding
const POPOVER_GAP = 4;

/**
 * Accent-color field: a swatch button that opens a `react-colorful` picker, plus
 * a hex text input for manual entry. Empty value = "no accent". Replaces the raw
 * `#hex` text input in the workspace editor.
 *
 * The popover is rendered through a portal into `document.body` and positioned
 * `fixed` from the swatch button's bounding rect, so it escapes the editor's
 * `overflow-y-auto` scroll container (and any ancestor `overflow-hidden`)
 * instead of being clipped by it.
 */
export function ColorSwatchInput({
  value,
  onChange,
  placeholder = "#b8232c",
  id,
}: ColorSwatchInputProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    flip: boolean;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const valid = isHexColor(value);

  const computePosition = () => {
    const btn = swatchRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < POPOVER_HEIGHT && rect.top > spaceBelow;
    setCoords({
      top: flip
        ? Math.max(8, rect.top - POPOVER_HEIGHT - POPOVER_GAP)
        : rect.bottom + POPOVER_GAP,
      left: rect.left,
      flip,
    });
  };

  useEffect(() => {
    if (!open) return;
    computePosition();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = !!wrapRef.current?.contains(target);
      const insidePopover = !!popoverRef.current?.contains(target);
      if (!insideTrigger && !insidePopover) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // capture: a scroll can originate from the editor's inner scroll container,
    // which wouldn't bubble to a non-capturing window listener.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computePosition is stable per render intent
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2">
      <button
        ref={swatchRef}
        type="button"
        aria-label="Pick accent color"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-9 w-9 shrink-0 rounded-md border border-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !valid && "bg-muted",
        )}
        style={valid ? { backgroundColor: value } : undefined}
      />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={value !== "" && !valid}
        spellCheck={false}
        autoComplete="off"
      />
      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="z-50 rounded-xl border border-border bg-popover p-3 shadow-popover"
          >
            <HexColorPicker
              color={valid ? value : "#b8232c"}
              onChange={onChange}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
