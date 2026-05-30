"use client";

import { useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
};

export function CsvDropZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
    if (!isCsv) {
      setError("CSV files only");
      return;
    }
    setError(null);
    onFile(file);
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        aria-label="CSV drop zone"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptFile(e.dataTransfer.files[0]);
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-accent" : "border-input bg-muted/30 hover:bg-muted/50"
        }`}
      >
        <div className="text-3xl mb-2">⬆</div>
        <div className="font-medium">Drop your CSV here</div>
        <div className="text-xs text-muted-foreground mt-1">or click to choose a file</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
