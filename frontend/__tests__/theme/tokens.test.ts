import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

describe("theme tokens", () => {
  it("no longer uses the blue-violet primary hue", () => {
    expect(css).not.toContain("264.376");
  });

  it("defines a near-black primary in :root", () => {
    expect(css).toMatch(/--primary:\s*oklch\(0\.205 0 0\)/);
  });

  it("defines a success token in both modes", () => {
    const occurrences = css.match(/--success:/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("maps success into the tailwind theme", () => {
    expect(css).toContain("--color-success: var(--success)");
  });
});
