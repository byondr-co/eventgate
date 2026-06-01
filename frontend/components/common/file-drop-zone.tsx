"use client";

import { useRef, useState } from "react";

type Props = {
  /** Called when a valid file is chosen (drag or click). */
  onFile: (file: File) => void;
  /**
   * Accepted MIME types / extensions passed to the hidden <input>.
   * Also used to validate dragged files by type.
   * Example: "image/*" or ".csv,text/csv"
   */
  accept?: string;
  /** Primary label shown in the drop zone. */
  label?: string;
  /** Secondary hint line shown below the label. */
  hint?: string;
  /** Icon / emoji to display above the label. */
  icon?: string;
  /** Optional validation run before onFile is called. Return an error string to reject. */
  validate?: (file: File) => string | null;
  disabled?: boolean;
};

export function FileDropZone({
  onFile,
  accept,
  label = "Drop a file here",
  hint = "or click to choose a file",
  icon = "⬆",
  validate,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (validate) {
      const msg = validate(file);
      if (msg) {
        setError(msg);
        return;
      }
    }
    setError(null);
    onFile(file);
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(false);
          acceptFile(e.dataTransfer.files[0]);
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-50 border-input bg-muted/20"
            : dragOver
              ? "border-primary bg-accent cursor-pointer"
              : "border-input bg-muted/30 hover:bg-muted/50 cursor-pointer"
        }`}
      >
        <div className="text-3xl mb-2">{icon}</div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-1">{hint}</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        disabled={disabled}
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
