# PR4 — Guide Grid Derived From Step Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Guide` (`frontend/components/common/guide.tsx`) derives its grid column classes from `steps.length` instead of hardwiring `sm:grid-cols-2 lg:grid-cols-4`.

**Architecture:** A lookup of literal Tailwind class strings keyed by the clamped step count (1–4) — Tailwind requires statically analyzable class names, so no template interpolation. The devices page (only consumer, 4 steps) renders byte-identically to today. Spec: `docs/superpowers/specs/2026-06-11-ui-ux-deepening-guide-grid-design.md`.

**Tech Stack:** Next.js client components, Tailwind, vitest + @testing-library/react (jsdom).

---

## Context for the engineer

- **Working directory** for all commands: `frontend/`. Run `nvm use 20` once per shell before any pnpm command. If the worktree lacks `node_modules`, run `pnpm install` first.
- `pnpm test <path>` runs `vitest run <path>`.
- Unit tests live in the root `frontend/__tests__/` mirror tree. The Guide test already exists at `frontend/__tests__/components/common/guide.test.tsx` — **extend it**, do not create a new file.
- **Commit style** (repo convention): single-line conventional-commit subject, no body, no trailer. Pre-commit hooks may rewrite files; re-stage and re-commit if so. Never `--no-verify`. Git paths below are repo-relative (`frontend/...`).
- Branch: `claude/pr4-guide-grid` (already created off `origin/main` @ `385f49e`).

Current `frontend/components/common/guide.tsx`:

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

export type GuideStep = {
  illustration: React.FC<{ className?: string }>;
  title: React.ReactNode;
  body?: React.ReactNode;
};

type GuideProps = {
  steps: GuideStep[];
  className?: string;
};

function Guide({ steps, className }: GuideProps) {
  return (
    <ol className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {steps.map((step, i) => {
        const Illustration = step.illustration;
        return (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <Illustration className="size-8 text-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">{i + 1}</span>
            </div>
            <p className="text-sm font-semibold">{step.title}</p>
            {step.body && <p className="text-xs text-muted-foreground">{step.body}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export { Guide };
```

The existing test file (`frontend/__tests__/components/common/guide.test.tsx`) has a `describe("Guide")` with two tests: "renders an ordered list with one numbered step per item" (2-step fixture using `DeviceCreate`/`CopyCode` illustrations from `@/lib/illustrations`) and an `InstallGuide` test. Both must stay unchanged and passing.

---

### Task 1: Derive Guide grid classes from step count

**Files:**
- Modify: `frontend/components/common/guide.tsx`
- Extend: `frontend/__tests__/components/common/guide.test.tsx`

- [ ] **Step 1: Add failing tests**

Append inside the existing `describe("Guide", ...)` block in `frontend/__tests__/components/common/guide.test.tsx` (reuse the already-imported `DeviceCreate` illustration; add a small helper above the new tests):

```tsx
  const makeSteps = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      illustration: DeviceCreate,
      title: `Step ${i + 1}`,
    }));

  it.each([
    { n: 1, expectClasses: [], absentClasses: ["sm:grid-cols-2", "lg:grid-cols-4"] },
    { n: 2, expectClasses: ["sm:grid-cols-2"], absentClasses: ["lg:grid-cols-3", "lg:grid-cols-4"] },
    { n: 3, expectClasses: ["sm:grid-cols-2", "lg:grid-cols-3"], absentClasses: ["lg:grid-cols-4"] },
    { n: 4, expectClasses: ["sm:grid-cols-2", "lg:grid-cols-4"], absentClasses: ["lg:grid-cols-3"] },
    { n: 5, expectClasses: ["sm:grid-cols-2", "lg:grid-cols-4"], absentClasses: ["lg:grid-cols-3"] },
  ])("derives grid classes from $n step(s)", ({ n, expectClasses, absentClasses }) => {
    render(<Guide steps={makeSteps(n)} />);
    const list = screen.getByRole("list");
    for (const c of expectClasses) expect(list.className).toContain(c);
    for (const c of absentClasses) expect(list.className).not.toContain(c);
  });

  it("still merges a caller-provided className", () => {
    render(<Guide steps={makeSteps(2)} className="mt-6" />);
    expect(screen.getByRole("list").className).toContain("mt-6");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `pnpm test __tests__/components/common/guide.test.tsx`
Expected: FAIL — the `n: 1`, `n: 2`, and `n: 3` cases fail (hardwired classes present where `absentClasses` forbids them); `n: 4`, `n: 5`, the className test, and the two pre-existing tests pass.

- [ ] **Step 3: Implement**

In `frontend/components/common/guide.tsx`, add the lookup above `Guide` and change the `<ol>` line:

```tsx
const STEP_GRID: Record<1 | 2 | 3 | 4, string> = {
  1: "", // single column everywhere
  2: "sm:grid-cols-2", // 2-up from sm; no lg class needed
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

function Guide({ steps, className }: GuideProps) {
  const cols = Math.min(Math.max(steps.length, 1), 4) as 1 | 2 | 3 | 4;
  return (
    <ol className={cn("grid gap-4", STEP_GRID[cols], className)}>
```

(Everything inside the `<ol>` — the `steps.map` body — is unchanged. `GuideStep`, `GuideProps`, imports, and the export stay as they are.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/components/common/guide.test.tsx`
Expected: PASS — all tests including the two pre-existing ones.

- [ ] **Step 5: Run the full unit suite (guards the devices page and everything else)**

Run: `pnpm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/common/guide.tsx "frontend/__tests__/components/common/guide.test.tsx"
git commit -m "fix(ui): derive Guide grid columns from step count"
```

---

### Task 2: Gate and PR

**Files:** none (verification + PR only)

- [ ] **Step 1: Run the four-command merge gate**

Run (from `frontend/`): `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: all pass (eslint may show 3 pre-existing `no-img-element` warnings in unrelated files — warnings, not errors).

- [ ] **Step 2: Run the Playwright a11y spec locally (UI change)**

Run: `pnpm test:e2e tests/a11y.spec.ts`
Expected: 3 passed. (Boots the app; if the dev port is busy, stop the other instance.)

- [ ] **Step 3: Push and open the PR**

Verify `gh auth status` shows `vineidev` active (switch with `gh auth switch -u vineidev` if not).

```bash
git push -u origin claude/pr4-guide-grid
gh pr create \
  --title "fix(ui): derive Guide grid columns from step count (PR4)" \
  --body "PR4 (final) of the UI/UX-deepening lane. Guide hardwired sm:grid-cols-2 lg:grid-cols-4; columns now derive from steps.length via a literal-class lookup clamped to 1–4 (5+ wraps). The devices page (only consumer, 4 steps) renders identically. Spec: docs/superpowers/specs/2026-06-11-ui-ux-deepening-guide-grid-design.md. Plan: docs/plans/2026-06-11-pr4-guide-grid.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR opens against `main`; CI `frontend` + `e2e` jobs pass.
