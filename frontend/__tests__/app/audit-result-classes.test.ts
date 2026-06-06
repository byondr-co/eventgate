import { describe, expect, it } from "vitest";

import { resultClasses } from "@/app/(app)/orgs/[slug]/events/[eventSlug]/audit/page";

describe("audit resultClasses", () => {
  it("maps results to semantic token classes", () => {
    expect(resultClasses("success")).toContain("bg-success");
    expect(resultClasses("success")).toContain("text-success-foreground");
    expect(resultClasses("warning")).toContain("bg-warning");
    expect(resultClasses("warning")).toContain("text-warning-foreground");
    expect(resultClasses("error")).toContain("bg-destructive");
  });

  it("uses no hardcoded green/amber/red", () => {
    for (const r of ["success", "warning", "error"] as const) {
      expect(resultClasses(r)).not.toMatch(/green-|amber-|red-/);
    }
  });
});
