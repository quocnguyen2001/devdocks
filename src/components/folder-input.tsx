import { open } from "@tauri-apps/plugin-dialog";
import { Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FolderInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Text input paired with a native folder picker (tauri-plugin-dialog). */
export function FolderInput({ value, onChange, placeholder }: FolderInputProps) {
  const browse = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") onChange(dir);
  };

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={browse}
        aria-label="Browse folders"
      >
        <Folder className="h-4 w-4" />
      </Button>
    </div>
  );
}
