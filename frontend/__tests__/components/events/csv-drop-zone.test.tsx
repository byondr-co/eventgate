import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CsvDropZone } from "@/components/events/csv-drop-zone";

describe("CsvDropZone", () => {
  it("renders the drop-zone hint", () => {
    render(<CsvDropZone onFile={vi.fn()} />);
    expect(screen.getByText(/drop your csv here/i)).toBeInTheDocument();
    expect(screen.getByText(/or click to choose a file/i)).toBeInTheDocument();
  });

  it("calls onFile when a CSV is dropped", () => {
    const onFile = vi.fn();
    render(<CsvDropZone onFile={onFile} />);
    const zone = screen.getByLabelText(/csv drop zone/i);
    const file = new File(["a,b\n1,2"], "test.csv", { type: "text/csv" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("rejects non-CSV files with an inline message", () => {
    const onFile = vi.fn();
    render(<CsvDropZone onFile={onFile} />);
    const zone = screen.getByLabelText(/csv drop zone/i);
    const file = new File(["x"], "image.png", { type: "image/png" });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/csv files only/i)).toBeInTheDocument();
  });
});
