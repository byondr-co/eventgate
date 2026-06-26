import { describe, expect, it } from "vitest";
import type { BulkAction, BulkResult } from "@/lib/guests";

describe("bulk types", () => {
  it("BulkResult shape", () => {
    const a: BulkAction = "void";
    const r: BulkResult = {
      action: a,
      done: 2,
      skipped: [{ id: "1", reason: "has_history" }],
      errors: [],
    };
    expect(r.done).toBe(2);
    expect(r.skipped[0].reason).toBe("has_history");
  });
});
