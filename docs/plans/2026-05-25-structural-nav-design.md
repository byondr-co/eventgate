# Structural Navigation — Design Spec (2026-05-25)

> **Status:** brainstorm-validated 2026-05-25. Awaiting writing-plans pass to convert into implementation tasks.
>
> **Pilot context:** first pilot 2026-06-05 → 2026-07-03 for The Click Cam. T-7 prep is 2026-05-29 (4 days away). This spec ships before T-3.

## 1. Goal

Solve the operator way-finding pain surfaced during Plan H T9 smoke (2026-05-25 — see [`improvement-and-findings-logs.md`](improvement-and-findings-logs.md) "UI lacks proper navigation"). Two related complaints, both addressed:

- **"Where am I?"** — no hierarchy indicator when an operator drills into `org → event → devices/scanner/walkin/audit/etc.`
- **"How do I jump?"** — no consistent back button or sibling-route navigation; operators rely on browser back or URL surgery

## 2. Out of scope (explicit non-goals)

- **Org-level layout file** — org level only has 2 routes (Events list, Members); the existing event-list page header is fine. If org breadcrumb is wanted later, that's a separate layout segment.
- **Mobile hamburger Sheet drawer** — 7 tabs on a 360px viewport scroll fine; over-investment for v1.
- **Khmer translations of nav labels** — pattern supports it (next-intl already wired), but Khmer copy review is pending Vatana's full pass (runbook item). Translations are a `km.json` follow-up edit, no code changes.
- **Tab badge counts beyond Help desk + Guests** — Devices and Audit do not get badges. Devices is setup-time, Audit is noisy during live events.
- **Backend changes** — pure frontend pass. Existing `count` fields on paginated endpoints provide all data.
- **Breadcrumb on routes outside `(app)`** — `/scanner/*`, `/login`, `/e/...` public routes keep their existing layouts.

## 3. Decisions captured from the 2026-05-25 brainstorm

| Question | Decision |
|---|---|
| Scope of pain to solve | Both orientation **and** jump-ability (breadcrumb + persistent menu) |
| Persistent-menu pattern | **A · Contextual tab bar** — horizontal tabs below breadcrumb, scoped per level. (Sidebar and top-nav-with-dropdowns rejected.) |
| Which levels get tabs | **Event-context routes only** (Dashboard / Form / Guests / Devices / Help desk / Audit / Settings) — 7 tabs |
| Tab badge counts | **Help desk** (open tickets) + **Guests** (total registered) |
| Badge refresh cadence | 30s polling + refetch on window focus |
| Mobile behavior | `overflow-x-auto` horizontal scroll with mask-image edge gradient hint; no Sheet drawer |
| i18n | English-only for this PR; pattern (`t("nav.*")`) wired so Khmer is a JSON-only follow-up |

## 4. Architecture

### 4.1 Layout file

```
frontend/app/(app)/orgs/[slug]/events/[eventSlug]/layout.tsx
```

A new Next.js segment layout that wraps every route nested under `/orgs/[slug]/events/[eventSlug]/...` — Dashboard (`page.tsx`), Settings, Form, Audit, Help desk, Devices, Guests, and Imports/[id].

Because Next.js preserves segment layouts across child route changes, the breadcrumb + tabs do not re-mount when the operator jumps between tabs — they just re-render their active state. This keeps the count badge queries alive across navigation (no refetch storm on every tab click).

Layout structure:

```tsx
<div className="space-y-4">
  <BreadcrumbTrail />
  <EventTabsNav orgSlug={slug} eventSlug={eventSlug} />
  {children}
</div>
```

### 4.2 New components

Location: `frontend/components/nav/`

- **`breadcrumb-trail.tsx`** — derives the trail from `usePathname()` plus the active org and event data. Each non-terminal segment is a `<Link>`; the current segment is plain text. Renders inline `Home › The Click Cam › May Pilot Event › Devices`.

- **`event-tabs-nav.tsx`** — renders the 7-item horizontal tab bar. Active tab matched by prefix on `usePathname()`. Uses `<Link>` elements (not JS handlers) for keyboard accessibility and right-click-able URLs.

### 4.3 shadcn additions

- **`Breadcrumb`** primitive (`pnpm dlx shadcn@latest add breadcrumb`) — stateless markup, no JS runtime
- **No `Tabs` primitive added** — shadcn `<Tabs>` is for in-page tabbed content with shared state; our nav "tabs" are styled `<Link>` elements. We use `buttonVariants` for consistency with the existing pattern in `events-table.tsx`.

### 4.4 New lib hooks

Location: `frontend/lib/`

- **`useOpenTicketsCount(orgSlug, eventSlug)`** — fetches `GET /api/v1/orgs/{org}/events/{event}/helpdesk/tickets/?status=open&page_size=1`, returns just the `count` field. `refetchInterval: 30000`, `refetchOnWindowFocus: true`. Query key: `["helpdesk-open-count", orgSlug, eventSlug]` — distinct from `useTickets` so the 30s badge cadence doesn't collide with the 5s list-page cadence.

- **`useGuestsCount(orgSlug, eventSlug)`** — same pattern against `/api/v1/orgs/{org}/events/{event}/guests/?page_size=1`. 30s polling.

Implementation note: DRF returns the `count` metadata regardless of `page_size`. `page_size=1` keeps payloads to ~200 bytes per refresh.

### 4.5 Files touched (existing)

- **`frontend/app/(app)/orgs/[slug]/events/[eventSlug]/page.tsx`** — remove the button row (current lines 30-67). Tab bar replaces it. Keep the `<h1>`, status card, stats widget, public-registration card.

- **`frontend/lib/i18n/messages/en.json`** — add a `nav` namespace with the 7 tab labels plus "Home".

## 5. Behavior

### 5.1 Active-route detection

`event-tabs-nav.tsx` matches each tab's href against `usePathname()` with prefix-match:

```ts
const tabHref = `/orgs/${slug}/events/${eventSlug}/devices`;
const isActive = pathname === tabHref || pathname.startsWith(tabHref + "/");
```

The **Dashboard** tab is special — its href is `/orgs/${slug}/events/${eventSlug}` (no trailing segment), so it uses an exact-match check to avoid matching every sub-route:

```ts
const dashboardHref = `/orgs/${slug}/events/${eventSlug}`;
const isDashboardActive = pathname === dashboardHref;
```

Deep nested route `/events/[eventSlug]/imports/[id]` activates the **Guests** tab via an explicit special-case in the tab config (imports are guest-list ops).

### 5.2 Breadcrumb labels

- **Home** → static text linking to `/`
- **Org segment** → uses `useOrg(slug).data?.name`; falls back to the slug while loading
- **Event segment** → uses `useEvent(slug, eventSlug).data?.name`; falls back to the slug while loading
- **Current section** → static label matching the active tab (e.g., "Devices", "Help desk")

Loading state: while `useOrg` / `useEvent` are pending, breadcrumb shows the slug as a placeholder rather than a skeleton — operators on slow connections should not see a blank header. No additional fetches; reuses existing react-query keys.

### 5.3 Mobile behavior

Tab bar: `overflow-x-auto` with subtle `mask-image` gradient on the right edge to hint scrollability. No hamburger drawer for v1.

Breadcrumb: wraps to multiple lines if needed; no truncation.

### 5.4 Badge rendering

In `event-tabs-nav.tsx`:

- **Help desk** — shows `Help desk · 3` when count > 0; just `Help desk` when count is 0, loading, or errored. Avoids visual clutter when there's nothing to act on.
- **Guests** — shows `Guests · 142` whenever count is defined, even at 0. Total attendance is useful information even at zero, and registration is the headline pilot metric.

Badge styling: small muted span next to the tab label (`text-xs text-muted-foreground bg-muted px-1 rounded`). Not a full shadcn `<Badge>` — keeps tab visual weight light.

## 6. Testing

### 6.1 Unit tests (vitest)

**`frontend/__tests__/components/nav/breadcrumb-trail.test.tsx`** — ~5 cases:
1. Renders correct segments on org-only pathname (Home / Org)
2. Renders correct segments on event-detail pathname (Home / Org / Event)
3. Renders correct segments on event sub-route (Home / Org / Event / Section)
4. Last segment is plain text, earlier are `<Link>` elements
5. Falls back to slug when `useOrg` / `useEvent` are loading

**`frontend/__tests__/components/nav/event-tabs-nav.test.tsx`** — parameterized + targeted:
1. Each of 7 tabs has correct href shape `/orgs/{slug}/events/{eventSlug}/{section}`
2. For each section pathname, the matching tab is active and others are not (7-row `it.each`)
3. Dashboard tab is active only on exact event-detail pathname, not on sub-routes
4. `imports/[id]` deep route activates the Guests tab
5. Help desk renders count badge when count > 0
6. Help desk renders no badge when count is 0
7. Guests renders count badge always (including 0)

Mocks: `vi.mock("@/lib/orgs")`, `vi.mock("@/lib/events")`, `vi.mock("@/lib/helpdesk")`, `vi.mock("@/lib/guests")`.

### 6.2 No e2e tests

Next.js segment layouts are exercised via the component tests. A Playwright e2e for nav would be over-investment for pilot. The existing dashboard-flow Playwright tests (if any) should continue to pass unchanged — the layout addition does not affect their selectors.

### 6.3 Gates

Same 8 gates as the last two PRs: pytest, mypy `apps config`, ruff check, ruff format, lint, prettier, tsc, vitest.

## 7. Known trade-offs

1. **Duplicate help-desk fetches on the help-desk page.** The badge polls 30s; the help-desk page itself polls 5s via `useTickets`. Different query keys means no cache sharing. For pilot scale (<10 tickets at peak), bandwidth is invisible. Documented here in case it shows up in production observability. Mitigation if needed: share a query key by passing the badge component the existing `useTickets` data.

2. **Slug-as-placeholder in breadcrumb during initial load.** When `useOrg` / `useEvent` are pending, the breadcrumb shows the slug instead of the display name. Trade-off: avoids skeleton flicker but reads less friendly during the brief load window. Pilot operators load each event once per session, so the impact is minimal.

3. **No tab badge for "items I haven't seen yet".** Counts are absolute totals (open tickets / registered guests), not deltas-since-last-visit. A "new since visit" model would need client-side state and is out of scope.

## 8. Rollout

- **Branch:** `feature/structural-nav` (already created off main tip `6cb8cec` 2026-05-25)
- **Commits:** this spec doc lands as `docs(plans): structural-nav design spec`. Implementation lands as one or more `feat(nav): ...` commits on the same branch.
- **PR:** single PR to `main`. Bundles spec + implementation. CI must be green before merge; merge style left to operator (squash or rebase, matching the recent pattern).
- **Estimated effort:** 1 implementation session — small enough for a single-agent dispatch in a worktree.

## 9. Follow-ups (deferred, documented for visibility)

- **Khmer translations** of `nav.*` keys — queued behind Vatana's full copy review (runbook item).
- **Org-level breadcrumb / nav** — only if pain surfaces in pilot. Members link can move into a future org-level tab bar.
- **Tab badge for Audit** ("entries today") — only if operators say they miss it. Currently judged noisy.
- **Sheet drawer for narrow viewports** — only if door-day operators report tab-scroll friction on phones.
- **"New since visit" badge model** — bigger UX feature; client-side persistence; out of scope.
