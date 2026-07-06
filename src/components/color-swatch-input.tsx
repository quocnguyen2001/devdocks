import { useEffect, useRef, useState } from "react";
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

/**
 * Accent-color field: a swatch button that opens a `react-colorful` picker, plus
 * a hex text input for manual entry. Empty value = "no accent". Replaces the raw
 * `#hex` text input in the workspace editor.
 */
export function ColorSwatchInput({
  value,
  onChange,
  placeholder = "#b8232c",
  id,
}: ColorSwatchInputProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const valid = isHexColor(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex items-center gap-2">
      <button
        type="button"
        aria-label="Pick accent color"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg border border-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      {open && (
        <div className="absolute left-0 top-11 z-50 rounded-xl border border-border bg-popover p-3 shadow-popover">
          <HexColorPicker
            color={valid ? value : "#b8232c"}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}
