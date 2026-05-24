# Paperless Pre-check-in — SaaS Brief

> **Status:** Brainstorm output. No implementation. Architecture/product brief intended to seed a future implementation plan.
> **Brand:** Gatethres (pronounced GATE-thress · Khmer: ហ្គេតថ្រេស — resolved 2026-05-24; was working name "Eventgate")
> **Date:** 2026-05-19

---

## Context

The existing repo at `/Users/vinei/Projects/Paperless-Pre-check-in/` is a Google Apps Script + Sheets MVP for paperless event entry. It successfully demonstrates a disciplined product model:

- Separate **pre-registered** (info before, fast door) and **walk-in** (fast door, info inside) flows.
- Pre-registered QR encodes **only the raw token** — possession ≠ permission.
- Pre-registered check-in mutation requires an **authorized staff scanner session**.
- Walk-in tokens are **unique per guest** and persisted before display.
- **Explicit state transitions** (`registered_not_arrived → checked_in`, `displayed → checked_in`, etc.).
- All exceptional cases (duplicate, invalid, missing, unauthorized) route to a separate **help desk lane**.
- Reliability at the door is prioritized over cleverness.

The Apps Script implementation has reached its ceiling: shared staff code, no offline capability, single-spreadsheet backend, no multi-tenancy, manual QR delivery, no named staff identity, no real billing model. The goal is to evolve this into a **production SaaS** built on Django + Next.js + PostgreSQL, targeting Southeast Asian event organizers, while **preserving every firm product decision** from the current MVP.

### Scoping decisions confirmed with user (this session)

| Decision | Choice |
|---|---|
| First market | SEA / Cambodia private events |
| Event scale target | 100–1,000 attendees per event |
| Ticketing scope | Free registration built-in at MVP; paid ticketing in Phase 3 |
| Offline scanner | **Must-have at MVP** |
| Staff auth | Per-event PIN handed out at staff briefing |
| QR delivery | Email + self-serve download + Telegram bot |
| Multi-tenancy | Shared Postgres with row-level `org_id` scoping |
| Billing at MVP | Deferred — manual invoicing during customer development |
| Scanner platform | PWA only (offline-capable) |
| Languages | English + Khmer |
| Dashboard realtime | Polling every 5–10s |

---

## 1. SaaS Product Concept

**Gatethres** is a SaaS for fast, paperless event entrance. It packages the original product insight — separate the fast door interaction from the slow information collection — as a multi-tenant web product.

**Tagline candidate:** *"Move the queue, not the questions."*

**Who it's for (MVP):**
- Small-to-mid event organizers in SEA running 100–1,000 attendee events.
- Conferences, corporate offsites, association events, religious gatherings, university orientations, community events.
- Currently using paper sign-in sheets, Google Forms + manual lookup, or no system.

**Pain points solved beyond the demo:**
- Door congestion at peak arrival (the demo's core).
- No reusable setup per event — every event today is bespoke spreadsheet work.
- No real audit trail for who let whom in.
- No way for organizers to share access with staff without sharing the whole spreadsheet.
- No offline survivability when venue WiFi fails.
- No reusable guest data across events for repeat attendees.

**Commercial positioning:**
- Sold to event organizers, not attendees.
- Per-event pricing (Phase 3): low entry tier (~$50 / event up to 200 guests), pro tier (~$150 / event up to 1,000 guests). Free trial up to 50 guests.
- Self-serve signup. Manual invoicing until product-market fit (~first 10–20 customers).
- Differentiator vs Eventbrite/Peatix: **purpose-built for the door**, offline-first scanner, fast walk-in flow, Khmer support.

---

## 2. Use Cases (Prioritized)

| Segment | Fit | Notes |
|---|---|---|
| **Conferences** | High | Lane-based scanning, badge printing later. Primary persona. |
| **Corporate events** | High | Annual general meetings, training days. Predictable buyer (HR / admin). |
| **Religious / community** | High | Cambodia has strong NGO/religious event ecosystem. Often free, large, recurring. |
| **University orientation / exams** | Medium | Seasonal, slow procurement, but sticky. Defer aggressive sales until Phase 2. |
| **Hospitality / venue check-in** | Low (MVP) | Different product (recurring guests, room assignment). Phase 4+ if at all. |
| **Paid ticketed events** | **Phase 3** | Needs payment, refunds, seat inventory, tax — explicitly deferred. |
| **Trade shows / expos** | Medium | Door scanning fits; lead retrieval is a separate adjacent product. |

---

## 3. Core Product Modules

| Module | MVP | Description |
|---|---|---|
| Organization / workspace | ✅ | Create org, invite members, manage settings, transfer ownership |
| Event management | ✅ | Create event, configure registration fields, set event PIN, archive |
| Guest registration | ✅ | Hosted public form per event (multilingual), required field configuration |
| QR / token generation | ✅ | Raw-token QR per guest, walk-in token issuance, server-side validation |
| Scanner PWA (offline) | ✅ | Installable PWA, offline check-in, durable device tokens, sync queue |
| Walk-in display | ✅ | One displayed QR per gate/device, persisted before display |
| Help desk | ✅ | Token lookup, manual check-in, mark for manual review, audit-tracked |
| Organizer dashboard | ✅ | Counts polled every 5–10s, per-gate breakdown, manual review queue |
| Audit log viewer | ✅ | Read-only audit trail for token mutations |
| Notifications | ✅ | Email + Telegram bot for QR delivery; staff invite emails |
| Admin / settings | ✅ | Org settings, event settings, member roles, scanner device list |
| Real-time live updates | Phase 2 | SSE for live dashboard, live scanner activity feed |
| Analytics / reporting | Phase 2 | Throughput, peak windows, gate utilization, exports |
| Native staff identity | Phase 2 | Magic-link login per staff, named attribution (replacing event PIN) |
| Paid ticketing | Phase 3 | Stripe + ABA PayWay, refunds, seat inventory |
| Branded subdomains | Phase 3 | `eventname.gatethres.app` or custom domain |
| Public API + webhooks | Phase 3 | Integrations with HubSpot, Mailchimp, Slack notifications |

---

## 4. User Roles & Permissions

| Role | Scope | Permissions |
|---|---|---|
| **Platform admin (staff at Gatethres)** | Global | Impersonate, support tools, billing management, plan management |
| **Organization owner** | Org | Full control of org, billing, member management, transfer ownership |
| **Organization admin** | Org | Manage members (except owner), create/edit/delete events, view all data |
| **Event manager** | Per event | Create/edit one event, manage guest list, configure form, view dashboard |
| **Registration staff** | Per event | Add guests manually, resend QR, view guest list |
| **Scanner staff (door)** | Per event | Operate scanner PWA, perform check-in — **identity = event PIN + device token** at MVP |
| **Help desk staff** | Per event | Lookup tokens, manual check-in, mark manual review |
| **Guest** | Self | Register, receive QR, walk-in claim, complete info form |

**Permissions enforcement:**
- DRF permissions checked against `OrganizationMembership` and per-event `EventStaff` rows.
- Scanner/walk-in/help-desk roles bound per-event, not per-org, so an org can hire seasonal staff for one event.
- Device tokens at MVP are bound to an event + scope (`gate`, `lane`) — they cannot operate against any other event.

---

## 5. Recommended Architecture

### High-level

```text
                 ┌─────────────────────────────────────────────────┐
                 │                  Cloudflare                     │
                 │     (DNS, WAF, CDN for static + QR images)      │
                 └────────────────┬────────────────────────────────┘
                                  │
        ┌─────────────────────────┴──────────────────────────┐
        │                                                    │
   ┌────▼──────────────┐                            ┌────────▼────────────────┐
   │  Next.js (Vercel) │                            │  Django + DRF (Fly.io)  │
   │                   │ ─── REST/JSON (HTTPS) ───▶ │  Gunicorn behind Uvicorn│
   │  - dashboard      │ ◀── JWT / device token ─── │                         │
   │  - public pages   │                            │  - api/v1/*             │
   │  - PWA scanner    │                            │  - admin/  (Django)     │
   │  - i18n: en, km   │                            │                         │
   └───────────────────┘                            └──────┬──────────────────┘
                                                           │
                              ┌────────────────────────────┼───────────────────────┐
                              │                            │                       │
                       ┌──────▼─────┐              ┌──────▼──────┐         ┌──────▼────────┐
                       │ Postgres 16│              │  Redis 7    │         │ S3-compatible │
                       │  (Neon /   │              │  (Upstash / │         │ (Cloudflare R2│
                       │  Supabase) │              │   Render)   │         │  / DO Spaces) │
                       └────────────┘              └─────────────┘         └───────────────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │   Celery    │
                                                   │  workers    │
                                                   │ (Fly.io)    │
                                                   └──────┬──────┘
                                                          │
                              ┌───────────────────────────┼─────────────────────────┐
                              │                           │                         │
                       ┌──────▼──────┐            ┌──────▼─────────┐         ┌──────▼──────────┐
                       │  Resend /   │            │ Telegram Bot   │         │ Sentry          │
                       │  AWS SES    │            │  API           │         │ (errors + perf) │
                       └─────────────┘            └────────────────┘         └─────────────────┘
```

### Backend stack

- **Python 3.12, Django 5, Django REST Framework**.
- **Postgres 16** (managed). Use partial unique indexes, `pg_advisory_xact_lock` for token mutations.
- **Redis** for cache, Celery broker, rate limiting, idempotency keys.
- **Celery** for QR rendering (using `segno` for SVG/PNG locally — no Quickchart dependency in production), email delivery, Telegram delivery, CSV export.
- **JWT** for org users (short access + refresh, stored httpOnly cookie). **Device tokens** for scanner PWAs (long-lived, revocable, scoped per event).
- **DRF ViewSets** + `django-filter` for list endpoints, `drf-spectacular` for OpenAPI schema.
- **django-tenants** ❌ not needed — shared schema with row-level `org_id` is sufficient at this scale.

### Frontend stack

- **Next.js 14 (App Router)**, **React 18**, **TypeScript**.
- **shadcn/ui** (Radix + Tailwind), **lucide-react** icons.
- **next-intl** for English + Khmer.
- **TanStack Query** for data fetching + cache; **TanStack Table** for guest list.
- **Zod** for form validation; **react-hook-form** for forms.
- **Workbox** for service worker; **Dexie** for IndexedDB (scanner offline cache).
- **html5-qrcode** or native `BarcodeDetector` for scanning.

### Multi-tenancy

- Single Postgres database, shared schema.
- Every tenant-scoped table has `organization_id` FK.
- Custom DRF base permission `IsOrgMember` resolves `request.user → org_id` and filters querysets via a `OrganizationScopedQuerySet` manager.
- Cross-org access is impossible by construction: no view returns objects without `org_id` filter applied.
- Event-scoped operations (scanner check-in) carry both `event_id` and the device's `org_id`; mismatch = 403.

### QR / token validation flow

```text
Pre-registered guest flow:
  1. Guest registers via public form (no auth).
  2. Server creates Guest row, generates long random entry_token (32 bytes hex).
  3. Server enqueues Celery task to render QR PNG (containing only entry_token) and deliver via chosen channel.
  4. At the door: scanner PWA (enrolled, unlocked with event PIN) reads token.
  5. Scanner POSTs { token, device_id, gate, scanner_label, client_idempotency_key, scanned_at } to /api/v1/checkins/.
  6. Server validates: device token valid → event match → guest exists → entry_status == registered_not_arrived → advisory lock on guest row → transition → audit row → return result.
  7. Offline mode: scanner has pre-fetched guest list; validates locally, queues mutation, syncs on reconnect (server is authoritative; conflicts surface as duplicate_scan + manual review).

Walk-in flow:
  1. Walk-in display PWA (enrolled, unlocked with event PIN) requests current/next QR for (event, gate, lane).
  2. Server returns or creates a walk-in token, status displayed, with claim URL.
  3. Guest scans displayed QR → opens claim URL → server validates token in displayed state → transitions to checked_in + claimed_pending_info → returns confirmation page.
  4. Confirmation page embeds inside-hall information form. Form submit → info_status = info_completed.
  5. Walk-in display polls and prepares next QR after current is claimed.
```

### Background jobs

- `send_qr_email(guest_id)` — render QR PNG, attach, send via Resend.
- `send_qr_telegram(guest_id)` — send QR to guest's Telegram via bot.
- `expire_walkin_displays` — periodic, only voids tokens still in `displayed` after event end (NOT an auto-expiry during event — preserves the no-auto-expiry decision).
- `compute_dashboard_snapshot(event_id)` — cached aggregate (60s TTL) so the polling dashboard hits Redis, not Postgres.
- `export_guest_list(event_id, format)` — CSV/Excel/PDF.

### Deployment

- **Frontend:** Vercel (Next.js native, edge caching, easy Khmer/English routing).
- **Backend + Celery:** Fly.io (Singapore region, supports both web and worker processes, persistent volumes for QR rendering temp files).
- **Postgres:** Neon (branching for staging) or Supabase (auth bundle not used — pure Postgres). Singapore region.
- **Redis:** Upstash (Singapore) or Render Redis.
- **Object storage:** Cloudflare R2 (no egress fees, important since QR PNGs are served on every guest registration).
- **Email:** Resend (good developer experience, transactional only) with SES as fallback at higher volume.
- **Telegram:** self-hosted bot in Django (using `python-telegram-bot` or simple HTTP calls).
- **Monitoring:** Sentry (errors + slow transactions). Healthcheck endpoint for uptime monitoring (BetterStack or Uptime Robot).

---

## 6. Data Model (PostgreSQL)

All tables are SaaS-aware; tenant-scoped tables have `organization_id`. UUIDv7 (time-ordered) used for IDs where possible.

### Core identity & tenancy

```sql
users (
  id uuid PK,
  email citext UNIQUE NOT NULL,
  full_name text,
  password_hash text,            -- nullable (magic-link only at MVP for org users)
  is_active boolean DEFAULT true,
  created_at, updated_at
)

organizations (
  id uuid PK,
  name text NOT NULL,
  slug citext UNIQUE NOT NULL,
  country_code char(2),          -- 'KH' default
  default_timezone text DEFAULT 'Asia/Phnom_Penh',
  plan text DEFAULT 'trial',
  created_at, updated_at
)

organization_memberships (
  id uuid PK,
  organization_id uuid FK,
  user_id uuid FK,
  role text CHECK (role IN ('owner','admin','manager','staff')),
  invited_at, accepted_at,
  UNIQUE (organization_id, user_id)
)
```

### Events & registration

```sql
events (
  id uuid PK,
  organization_id uuid FK NOT NULL,
  slug citext NOT NULL,           -- public registration form URL slug
  name text NOT NULL,
  status text CHECK (status IN ('draft','open','live','closed','archived')),
  starts_at timestamptz, ends_at timestamptz,
  timezone text NOT NULL,
  venue text,
  registration_open boolean DEFAULT true,
  walkins_enabled boolean DEFAULT true,
  event_pin_hash text,            -- bcrypt of per-event staff PIN
  event_pin_rotated_at timestamptz,
  created_at, updated_at,
  UNIQUE (organization_id, slug)
)
CREATE INDEX ON events (organization_id, status);

registration_fields (
  id uuid PK,
  event_id uuid FK NOT NULL,
  field_key text NOT NULL,        -- 'name', 'email', 'phone_or_chat', 'organization', custom keys
  label_en text, label_km text,
  field_type text CHECK (field_type IN ('text','email','phone','select','textarea')),
  required boolean DEFAULT false,
  options_json jsonb,             -- for select fields
  order_index int NOT NULL,
  UNIQUE (event_id, field_key)
)
```

### Guests, tokens, check-ins

```sql
guests (
  id uuid PK,
  organization_id uuid FK NOT NULL,    -- denormalized for fast tenant filter
  event_id uuid FK NOT NULL,
  guest_type text CHECK (guest_type IN ('pre_registered','walk_in')) NOT NULL,
  entry_token text NOT NULL,           -- long random, raw QR payload for pre-reg
  entry_status text CHECK (entry_status IN
    ('registered_not_arrived','checked_in','displayed','voided','manual_review')) NOT NULL,
  info_status text CHECK (info_status IN
    ('claimed_pending_info','info_completed','manual_review')) NULL,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  email citext,
  phone_or_chat text,
  full_name text,
  organization_name text,
  source text,                          -- 'registration_form', 'csv_import', 'walk_in_display'
  gate text, scanner text,              -- lane/device labels filled at check-in
  checked_in_at timestamptz,
  created_at, updated_at,
  UNIQUE (event_id, entry_token)
);
CREATE INDEX guests_event_entry_status_idx ON guests (event_id, entry_status);
CREATE INDEX guests_event_email_idx ON guests (event_id, email);
-- Partial unique to prevent two displayed walk-in tokens for same gate/scanner:
CREATE UNIQUE INDEX one_displayed_walkin_per_scope
  ON guests (event_id, gate, scanner)
  WHERE entry_status = 'displayed' AND guest_type = 'walk_in';
```

### Scanner devices & sessions

```sql
scanner_devices (
  id uuid PK,
  organization_id uuid FK NOT NULL,
  event_id uuid FK NOT NULL,
  label text NOT NULL,                 -- 'Gate 1 Lane A'
  role text CHECK (role IN ('scanner','walkin_display','helpdesk')) NOT NULL,
  enrolled_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  device_token_hash text NOT NULL,     -- bcrypt; device sends raw token, server compares
  UNIQUE (event_id, label, role)
);
CREATE INDEX scanner_devices_lookup ON scanner_devices (event_id, role, revoked_at);

event_pin_sessions (
  id uuid PK,
  event_id uuid FK NOT NULL,
  scanner_device_id uuid FK NOT NULL,
  unlocked_at timestamptz,
  expires_at timestamptz,
  unlocked_by_ip inet
);
```

### Audit log

```sql
audit_events (
  id uuid PK,
  organization_id uuid FK NOT NULL,
  event_id uuid FK,
  occurred_at timestamptz NOT NULL,
  actor_type text CHECK (actor_type IN ('user','scanner_device','guest','system')) NOT NULL,
  actor_id text,                       -- user UUID, device UUID, guest UUID, 'system'
  action text NOT NULL,                -- 'checkin.success', 'walkin.claim', 'token.create', etc.
  guest_id uuid,
  entry_token text,
  previous_status text, new_status text,
  result text CHECK (result IN ('success','warning','error')),
  gate text, scanner text,
  details_json jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_event_time ON audit_events (event_id, occurred_at DESC);
-- audit_events is append-only; enforce with a trigger that REVOKEs UPDATE/DELETE for app role.
```

### Manual review

```sql
manual_review_cases (
  id uuid PK,
  organization_id uuid FK NOT NULL,
  event_id uuid FK NOT NULL,
  guest_id uuid FK,
  opened_at timestamptz NOT NULL,
  opened_by text,                      -- 'system' or user id or device id
  reason text NOT NULL,                -- 'duplicate_scan', 'token_not_found', 'wrong_event', ...
  status text CHECK (status IN ('open','resolved')) DEFAULT 'open',
  resolved_at timestamptz, resolved_by uuid FK users,
  resolution_notes text,
  details_json jsonb DEFAULT '{}'::jsonb
);
CREATE INDEX manual_review_open ON manual_review_cases (event_id, status, opened_at);
```

### Notifications

```sql
notification_dispatches (
  id uuid PK,
  organization_id uuid FK NOT NULL,
  event_id uuid FK,
  guest_id uuid FK,
  channel text CHECK (channel IN ('email','telegram','self_serve')) NOT NULL,
  template text NOT NULL,              -- 'pre_reg_qr', 'reminder', etc.
  status text CHECK (status IN ('queued','sent','failed','bounced')),
  attempts int DEFAULT 0,
  sent_at timestamptz, error text,
  created_at
);
```

### Status transitions (unchanged from MVP)

| Flow | Before | After |
|---|---|---|
| Pre-reg authorized check-in | `entry_status=registered_not_arrived` | `entry_status=checked_in` |
| Walk-in claim | `entry_status=displayed` | `entry_status=checked_in, info_status=claimed_pending_info` |
| Walk-in void by staff | `entry_status=displayed` | `entry_status=voided` |
| Walk-in info form complete | `info_status=claimed_pending_info` | `info_status=info_completed` |

### Concurrency & locking

- Replace Apps Script `LockService` with `SELECT … FOR UPDATE` on the `guests` row inside a transaction, plus `pg_advisory_xact_lock(hashtext(entry_token))` for offline-sync deduplication.
- All check-in writes are idempotent via `client_idempotency_key` (stored in a small `idempotency_keys` table or Redis with 24h TTL).

---

## 7. Django App Structure

```text
backend/
├── manage.py
├── config/
│   ├── settings/{base,dev,prod,test}.py
│   ├── urls.py
│   ├── asgi.py / wsgi.py
│   └── celery.py
├── apps/
│   ├── accounts/        # User, auth, magic-link (Phase 2 named staff)
│   ├── orgs/            # Organization, OrganizationMembership, invites
│   ├── events/          # Event, RegistrationField, event PIN management
│   ├── guests/          # Guest model, registration form submission, CSV import
│   ├── tokens/          # Token generation, transition validator, QR rendering
│   ├── checkins/        # Pre-reg check-in endpoint, idempotency, advisory lock
│   ├── walkins/         # Walk-in display, claim, void, info completion
│   ├── devices/         # Scanner device enrollment, device-token issuance
│   ├── audit/           # AuditEvent model, append-only trigger
│   ├── helpdesk/        # ManualReviewCase, lookup, override actions
│   ├── notifications/   # Email + Telegram dispatch, templates
│   ├── dashboard/       # Aggregate snapshot endpoint (Redis-cached)
│   └── common/          # OrgScopedQuerySet, IsOrgMember permission, base models
├── tests/
└── requirements/{base.txt, dev.txt, prod.txt}
```

**Key cross-cutting modules:**
- `apps.common.models.OrgScopedModel` (abstract base, every tenant-scoped model inherits).
- `apps.common.permissions.IsOrgMember`, `HasEventRole`, `IsEnrolledScanner`.
- `apps.common.middleware.OrgContextMiddleware` (resolves request → org_id, sets thread-local).
- `apps.tokens.transitions.TransitionValidator` (single source of truth for valid `entry_status`/`info_status` moves, mirrors current `TokenService.validateTransition()`).

---

## 8. Next.js App Structure

```text
frontend/
├── app/
│   ├── (public)/
│   │   ├── e/[orgSlug]/[eventSlug]/register/page.tsx     # Public registration form
│   │   ├── e/[orgSlug]/[eventSlug]/claim/[token]/page.tsx# Walk-in claim + info form
│   │   └── e/[orgSlug]/[eventSlug]/info/[token]/page.tsx # Walk-in info standalone
│   │
│   ├── (auth)/
│   │   ├── login/page.tsx                                # Magic-link request
│   │   └── auth/callback/page.tsx                        # Magic-link consumption
│   │
│   ├── (app)/                                            # Org dashboard (authenticated)
│   │   ├── layout.tsx                                    # Sidebar + org switcher
│   │   ├── page.tsx                                      # Org home / event list
│   │   ├── events/
│   │   │   ├── new/page.tsx                              # Create-event wizard
│   │   │   └── [eventId]/
│   │   │       ├── page.tsx                              # Event dashboard (live counts)
│   │   │       ├── settings/page.tsx                     # Event settings + PIN management
│   │   │       ├── form/page.tsx                         # Registration form builder
│   │   │       ├── guests/page.tsx                       # Guest list (table)
│   │   │       ├── guests/[guestId]/page.tsx             # Guest detail / resend QR
│   │   │       ├── helpdesk/page.tsx                     # Manual review queue
│   │   │       ├── devices/page.tsx                      # Scanner enrollment management
│   │   │       ├── audit/page.tsx                        # Audit log viewer
│   │   │       └── analytics/page.tsx                    # Phase 2
│   │   ├── members/page.tsx                              # Invite team
│   │   └── settings/page.tsx                             # Org settings
│   │
│   └── (scanner)/                                        # PWA scanner subapp
│       ├── layout.tsx                                    # Offline-aware shell
│       ├── enroll/page.tsx                               # Device enrollment via QR (issued by org)
│       ├── unlock/page.tsx                               # Event PIN entry
│       ├── scan/page.tsx                                 # Camera + scan loop
│       ├── walkin/page.tsx                               # Walk-in QR display
│       ├── helpdesk/page.tsx                             # Token search + manual check-in
│       └── offline/page.tsx                              # Pending sync queue + diagnostics
│
├── components/                                           # shadcn + composite components
│   ├── ui/                                               # shadcn primitives
│   ├── scanner/                                          # CameraView, ScanResultCard, …
│   ├── dashboard/                                        # CountCard, LiveCounter, …
│   └── forms/                                            # RegistrationFormRenderer, …
├── lib/
│   ├── api.ts                                            # fetch wrapper, types from OpenAPI
│   ├── auth.ts                                           # session helpers
│   ├── i18n/                                             # en.json, km.json
│   ├── pwa/                                              # serviceWorker, syncQueue, db (Dexie)
│   └── qr/                                               # camera + BarcodeDetector wrappers
├── public/manifest.webmanifest                           # PWA manifest
└── next.config.mjs                                       # withPWA (workbox)
```

**Three subapps in one repo:**
1. Public guest pages (no auth, internationalized).
2. Authenticated org dashboard (JWT cookie).
3. PWA scanner (device-token authenticated, offline-capable, isolated route group).

This means a single Next.js codebase but three distinct experiences with different auth and caching policies.

---

## 9. UX Direction & Visual System

**Visual direction:** modern, fast, operational, trustworthy. Calm color palette with high-contrast status colors. Large tap targets on scanner pages (event staff use phones one-handed). No animation beyond essential feedback. Plain language, never marketing-speak.

**Color semantics (preserve current MVP):**
- Success / "Checked in. Please enter." → green-600.
- Duplicate → amber-500.
- Invalid / unauthorized → red-600.
- Manual review → yellow-400 + sends to help desk.

**Mobile-first non-negotiables:**
- Scanner UI works at arm's length in bright outdoor lighting.
- Camera viewport ≥ 60% of screen.
- Result card is full-screen for 1.5s minimum before auto-resume.
- Walk-in display works in landscape on a tablet.

**Accessibility:**
- WCAG AA contrast on all status messages.
- All actions reachable via keyboard for help-desk laptop use.
- Screen-reader labels on QR results.

---

## 10. shadcn/ui + v0 Strategy

**Screens worth generating with Vercel v0** (in order of leverage):

| Screen | v0 useful? | Reason |
|---|---|---|
| Public registration form | ✅✅✅ | High polish needed; users see it before trusting product |
| Event dashboard (counts) | ✅✅ | v0 is strong at metric layouts |
| Guest list table | ✅✅ | TanStack Table + shadcn is v0's sweet spot |
| Help desk / manual review screen | ✅✅ | List + detail pattern v0 handles well |
| Event create wizard | ✅ | Multi-step shadcn pattern, v0 helpful starting point |
| Scanner camera UI | ❌ | Too custom (camera, offline state, result card); hand-build |
| Walk-in QR display | ❌ | Single large QR, hand-build |
| Walk-in claim confirmation | ✅ | Static-ish, v0 fine for the confirmation card |

### Concrete v0 prompts

**Prompt 1 — Public registration form**

> Build a public event registration form page using shadcn/ui and Tailwind. The page header shows an event banner (placeholder image), event name, date, and venue. Below it is a single-column form with fields: Full name (required), Email (required), Phone or Chat ID (required), Organization (optional), and a Notes textarea (optional). Use shadcn Form, Input, Label, Textarea components. The submit button is large, full-width on mobile, primary color, with loading state. After submit, show a success screen with a large QR placeholder image, a "Save to Photos" button, and four short instructions: "Save this QR", "Bring it to the event", "Show it to staff at the door", "You'll enter immediately". Support a language toggle (English / ខ្មែរ) in the top-right. Mobile-first.

**Prompt 2 — Event dashboard**

> Build an event organizer dashboard using shadcn/ui. Top bar shows event name, status badge ("Live"), starts/ends time, and an "Open scanner" button. Below it, a 3-column metric grid showing: "Pre-registered checked in" (number / total), "Walk-ins entered" (number), "Pending info" (number with amber accent if > 0), "Manual review" (number with red accent if > 0). Below that, a 2-column section: left card "Recent check-ins" showing the last 10 check-ins with name, time, gate, and a status dot; right card "Manual review queue" showing open cases with reason and a "Resolve" button. Add a small "Last updated 3s ago" indicator implying auto-polling. Use shadcn Card, Badge, Button, Table. Light + dark mode both work.

**Prompt 3 — Guest list table**

> Build a guest list page using shadcn/ui and TanStack Table. Filter bar across the top: search input (by name/email), filter chips for guest type (pre-registered / walk-in / all), status filter (all / arrived / not arrived / manual review), and an export button. Table columns: Name, Email, Phone, Type (badge), Entry status (colored badge), Info status (colored badge), Checked in at, Gate, and a row actions menu (View, Resend QR, Mark manual review). Selecting rows enables a bulk actions bar (Resend QR, Export selected). Sticky table header, virtualized rows, mobile shows a stacked card view. Use shadcn Table, Input, Badge, Button, DropdownMenu.

**Prompt 4 — Help desk / manual review**

> Build a help desk screen for event staff using shadcn/ui. Left pane (40% width on desktop, full-width on mobile): list of open manual review cases sorted by oldest first, each card shows: reason (badge), guest name if known, time opened, token preview. Right pane: case detail view with guest info (name, email, phone, gate), full audit trail (timeline), and resolution actions: "Approve check-in", "Mark resolved with note", "Mark void". Above the list, a search input "Look up by token, name, or email" with a "Manual check-in" button. The whole page reads as calm and methodical, not alarming. Use shadcn ScrollArea, Card, Badge, Button, Timeline (built from primitives), Textarea, Input.

**Prompt 5 — Event create wizard**

> Build a 4-step event creation wizard using shadcn/ui. Step indicator at top: 1. Basics, 2. Registration form, 3. Door setup, 4. Review. Step 1: event name, slug (auto-derived, editable), starts/ends datetime, timezone (default Asia/Phnom_Penh), venue. Step 2: form field builder — preset fields (name, email, phone) are required and locked; user can add custom fields (text, select, textarea), reorder by drag, set required toggle, and edit English + Khmer labels per field. Step 3: configure walk-in (toggle), event staff PIN (generate or set), expected gates (chips). Step 4: review summary card + "Create event" primary button. Each step has Back / Next; last step has Create. Use shadcn Stepper (built from primitives), Form, Switch, Sortable list, Card, Button. Mobile-first, single column.

**Prompt 6 — Walk-in claim confirmation**

> Build a guest-facing walk-in claim confirmation page using shadcn/ui. The hero section is a large green checkmark icon and the text "ENTRY CONFIRMED" — this must be unmistakable at a glance. Below it, smaller text: "Please enter the hall. Complete the form below once you're inside." Then below a divider, the same registration form (Full name, Email, Phone or Chat ID, Organization, Notes), with a primary submit button "Save my info". On submit, replace the form with a calm confirmation: "Thanks! Your info is saved." Language toggle in the corner. Use shadcn Card, Form, Input, Textarea, Button. Mobile-first.

---

## 11. Migration from MVP to SaaS

### Preserve

- The full state machine (`registered_not_arrived → checked_in`, `displayed → checked_in`, `displayed → voided`, `claimed_pending_info → info_completed`).
- Two-status model (`entry_status` vs `info_status`).
- Help-desk-as-fallback operating model.
- Raw-token QR for pre-registered guests.
- Pre-reg check-in mutation requires authorized session (now: event PIN + device token; later: per-staff identity).
- Append-only audit log.
- Walk-in tokens persisted before display, unique per guest.
- No automatic walk-in expiry.
- All test cases from `docs/operations-playbook.md` translate to integration tests.

### Redesign

- Sheets → Postgres with proper indexes, advisory locks, transactional integrity.
- Shared staff access code → per-event PIN + per-device durable token + (Phase 2) per-staff magic-link identity.
- Apps Script `LockService` → `pg_advisory_xact_lock` + `SELECT … FOR UPDATE`.
- Quickchart-generated QR (network dependency) → server-side `segno` PNG generation, stored in object storage, served by CDN.
- Single global event → multi-tenant model with `organization → event` hierarchy.
- Apps Script web app routing → DRF API + Next.js routing.
- `setupSpreadsheetSchema()` and properties → Django migrations + `setup` management command.
- Polling dashboard via refresh → polling dashboard via TanStack Query (5–10s interval), still cache-backed.

### Discard

- The `check_in_url` legacy column — gone in v1 schema.
- Apps Script `CacheService` session model — replaced by JWT/device tokens.
- Quickchart dependency.
- The single-spreadsheet-per-event operating assumption.
- Manual deployment via clasp.

### Mapping table (MVP → SaaS)

| MVP concept | SaaS concept |
|---|---|
| `apps-script/Config.gs` constants | `apps.events.models.Event` + `apps.common.constants` |
| `apps-script/Code.gs` doGet/doPost router | DRF URL conf + Next.js routes |
| `apps-script/Sheets.gs` `SheetStore` | DRF ViewSets + Django ORM |
| `apps-script/Tokens.gs` `TokenService` | `apps.tokens.transitions` + `apps.tokens.qr` |
| `apps-script/ScannerAuth.gs` | `apps.devices.auth` (device token middleware) |
| `apps-script/Locking.gs` `withScriptLock` | `pg_advisory_xact_lock` helper in `apps.common.locks` |
| `apps-script/Templates/StaffAccess.html` | `(scanner)/unlock/page.tsx` |
| `apps-script/Templates/Scanner.html` | `(scanner)/scan/page.tsx` + offline service worker |
| `apps-script/Templates/WalkinDisplay.html` | `(scanner)/walkin/page.tsx` |
| `apps-script/Templates/WalkinClaim.html` | `app/(public)/e/[…]/claim/[token]/page.tsx` |
| `apps-script/Templates/RegistrationForm.html` | `app/(public)/e/[…]/register/page.tsx` |
| `apps-script/Templates/Dashboard.html` | `app/(app)/events/[eventId]/page.tsx` |
| `AuditLog` sheet (append-only) | `audit_events` table + REVOKE UPDATE/DELETE trigger |
| Google Forms import | CSV import endpoint + webhook (Phase 2) for external forms |
| `STAFF_ACCESS_CODE` | Per-event PIN + per-device token |

---

## 12. Phased Roadmap

### Phase 1 — SaaS Foundation (≈10–14 weeks)

Goal: a real customer can run a real 500-person event end-to-end on this product, including offline scanner.

Milestones:
1. **W1–2** Project scaffolding: monorepo, Django + DRF skeleton, Next.js skeleton, Postgres + migrations, CI, Sentry, staging deploy.
2. **W3–4** Accounts, orgs, memberships, magic-link login for org users, org switcher in UI.
3. **W5–6** Event CRUD, registration form builder (with EN+KM), public registration form page, guest record, QR generation (segno), self-serve download, Resend email delivery.
4. **W7–8** Scanner PWA: enrollment, event PIN unlock, online check-in, walk-in display, walk-in claim, info form.
5. **W9–10** **Offline scanner**: service worker, IndexedDB cache, pending sync queue, conflict resolution. (This is the hardest sprint.)
6. **W11** Help desk page, manual review queue, audit log viewer, dashboard polling.
7. **W12** Telegram bot integration, CSV guest import.
8. **W13–14** End-to-end QA with a real test event of 200–500 attendees. Performance tuning. Documentation. Pricing copy. Launch landing page.

Exit criteria:
- Two paying / pilot customers run real events.
- Zero data-loss incidents during pilots.
- p95 check-in latency under 400ms online; under 80ms offline.
- All MVP test cases from operations playbook pass as integration tests.

### Phase 2 — Production Event Workflows (≈8 weeks after Phase 1)

- Named staff identity (magic-link per staff replaces single-PIN, but PIN remains as fallback).
- SSE-powered live dashboard.
- CSV export, PDF guest list export.
- Bulk actions on guest list (resend QR, mark void, etc.).
- Per-event templates (clone last event's config).
- Improved analytics: throughput by gate, peak window detection.
- WhatsApp Business delivery (with template approval flow).
- Help desk improvements: staff notes, case threading.

### Phase 3 — Monetization, Integrations, Scale (≈12 weeks)

- Stripe Checkout + ABA PayWay for paid ticketing.
- Plan tiers (Free / Pro / Business), seat-based metering.
- Public REST API + webhooks.
- Branded subdomains and custom domains.
- Integration: Mailchimp, HubSpot, Slack.
- Multi-event registration funnels.
- Native Android scanner wrapper (TWA or Capacitor) if PWA hits adoption limits.
- Audit log export (CSV, JSON), SOC2-readiness checklist.

---

## 13. Risks & Trade-offs

| Category | Risk | Mitigation |
|---|---|---|
| Operational | Offline scanner sync conflicts at large events | Server-authoritative reconciliation; conflicts always land in manual review; integration tests with concurrent device simulators |
| Security | Per-event PIN leakage allows malicious check-in | PIN unlock issues device-scoped token only; rotate PIN; revoke devices; named-staff identity Phase 2 |
| Security | Device token theft | Short refresh window, IP-bound on first use, revocable from dashboard, audit trail of all check-ins per device |
| QR abuse | Token guessing / brute force | 32-byte random tokens; rate-limit per-IP; failed-token lookups logged |
| Privacy | Guest PII storage (Cambodia) | Encrypt at rest (managed Postgres), no PII in logs, configurable retention per org (default 12 months), GDPR-style export/delete tooling Phase 2 |
| Offline / poor network | Venue WiFi failure at peak | Scanner stays operational offline; walk-in display degrades gracefully if it can't fetch next QR (shows last one + manual void) |
| Scaling | 5× expected event load | Postgres advisory locks + idempotency keys handle bursts; horizontal Celery workers; Redis-backed dashboard cache; load-test before pilot |
| Multi-tenancy | Cross-tenant data leak | Every query routes through `OrgScopedQuerySet`; integration tests assert isolation; admin audit |
| Vendor | Quickchart-style external QR service outage | No external QR dependency — `segno` is local |
| Vendor | Telegram API rate limits | Queue + retry with backoff; fallback to email |
| Complexity | Multi-tenancy + offline sync + i18n simultaneously is a lot | Phase 1 scope is deliberately disciplined; analytics, branded domains, named staff all deferred |

---

## 14. Resolved Decisions (from brainstorm)

All twelve open questions were resolved in the brainstorm session:

| # | Question | Decision |
|---|---|---|
| 1 | Brand / product name | ✅ **Resolved 2026-05-24 → Gatethres** (pronounced GATE-thress, coined truncation of *gate + thres(hold)*). All 10 checked TLDs were truly unregistered at decision time; `gatethres.com` registered. See [Plan H spec](./plans/2026-05-24-plan-h-brand-rename-and-prod-split.md). |
| 2 | Hosting region / data residency | **Singapore is fine for all MVP customers.** No Cambodia-resident requirement. Re-evaluate only if a specific customer asks. |
| 3 | Telegram bot architecture | **Single global bot, deep-linked per event.** `@<placeholder>Bot` with `/start <event_token>` flow. Per-org bots deferred to Phase 2+. |
| 4 | Khmer translation | **Translator identified.** Involve them at form-builder, scanner, walk-in, and email-template stages. Plan a copy-review pass before each pilot event. |
| 5 | Pilot customer commitment | **Committed pilots with confirmed event dates exist.** Phase 1 timeline anchors to their dates. Capture each pilot event's date + scale in the Phase-1 plan so the W13–14 QA sprint hits a real event. |
| 6 | Pricing hypothesis | **Per-event tiered by attendee count.** ~$50 / event ≤200, ~$150 / event ≤1,000, custom above. Hypothesis only; validate with pilots. Billing infra still deferred. |
| 7 | Offline scanner pre-fetch ceiling | **10,000 guests.** Full sync on enrollment, ~5 MB IndexedDB budget. Above 10k → "use online mode" warning. Partial-sync is a Phase-2 concern. |
| 8 | Help desk override authority | **Only `manual_review` and `registered_not_arrived`.** Cannot un-void or re-check-in already-checked-in guests — those require an org admin override and log a high-priority audit event. |
| 9 | Pre-reg QR delivery timing | **Immediate on registration + bulk "resend all" action.** Single setting; no per-event scheduling complexity. |
| 10 | Audit log retention | **5 years default**, hot table. Revisit when first enterprise customer asks. |
| 11 | Walk-in QR format | **URL-based** (current MVP behavior preserved). Pre-reg stays token-only. Justification: the actor differs (guest vs. staff). |
| 12 | CSV import field mapping | **Smart inference + manual override.** Auto-detect Name/Email/Phone; user reviews and corrects unknowns. |

### Implications worth noting

- **§5 Architecture** is unchanged — every architectural choice the user made matched the recommended option in the brief.
- **§12 Phase 1 timeline** now anchors to the committed pilot event dates. The W13–14 sprint *is* the first pilot event; back-plan W1 from there.
- **Khmer translator** is a concrete project resource — add them to the W3 (form builder) and W7 (scanner copy) sprints in the future implementation plan.
- **Help desk override scope** (Q8) and **QR delivery timing** (Q9) and **walk-in URL format** (Q11) need to be reflected in the Phase 1 acceptance criteria.
- **Brand name** is the only remaining Phase-0 task: shortlist 5 candidates, check `.com`/`.app` availability + trademark, pick before pilot launch.

---

## 15. Critical Files (Future SaaS Repo)

When implementation begins, these files will be the most important to design carefully:

| File | Why critical |
|---|---|
| `backend/apps/tokens/transitions.py` | Single source of truth for valid state transitions. Mirrors current `TokenService.validateTransition()`. |
| `backend/apps/checkins/views.py` | Hot path; advisory lock + idempotency. |
| `backend/apps/devices/auth.py` | Device-token validation. Security boundary for offline scanner. |
| `backend/apps/common/permissions.py` | Tenant isolation enforcement. |
| `backend/apps/audit/models.py` + trigger | Append-only guarantee. |
| `frontend/app/(scanner)/scan/page.tsx` | Camera + offline UX. Largest UI risk. |
| `frontend/lib/pwa/syncQueue.ts` | Offline sync logic. Most subtle distributed-system code in the product. |
| `frontend/lib/pwa/db.ts` | Dexie schema for guest cache + pending mutations. |
| `frontend/app/(public)/e/[orgSlug]/[eventSlug]/register/page.tsx` | First-impression page; needs translation + accessibility care. |

---

## 16. Verification & Test Strategy

End-to-end verification plan when implementation begins:

1. **Unit tests:** Token transition validator, advisory-lock helper, OrgScopedQuerySet (cross-tenant leakage tests), audit-event append guard.
2. **Integration tests (Django + Postgres):** Every test case from `docs/operations-playbook.md` translated:
   - Authorized pre-reg success
   - Duplicate pre-reg scan
   - Invalid token
   - Unauthorized scanner (no device token)
   - Wrong event
   - Walk-in claim success, duplicate claim, voided claim, invalid token
   - Walk-in info completion happy path + missing required field
   - Concurrent check-ins on the same token (only one wins; other goes to manual review)
3. **PWA offline tests (Playwright):** Service worker installed, scanner enrolls, network goes offline, scanner performs N check-ins, network restored, all N sync without duplicates.
4. **Load test:** 50 concurrent scanners, 1,000 guests, peak window of 200 check-ins/min. p95 latency target: 400ms online.
5. **Manual QA matrix:** Chrome/Safari iOS/Android, low-light QR scans, screenshot scans, popup-blocked browsers, intermittent network.
6. **Pilot event:** One real 200–500 person event with the founding team on standby. Document any incident in a post-mortem before declaring Phase 1 done.

---

## 17. Next Step

Once this brief is approved, the recommended next step is to invoke **`superpowers:writing-plans`** to convert this brief into a concrete, ordered implementation plan for Phase 1 (the SaaS foundation), with task-level decomposition and explicit critical-path identification.

---

## Appendix A: Decision Heritage

The following firm decisions from `docs/decision-log.md` are preserved verbatim in the SaaS design and **must not be reversed without explicit, documented reason**:

- Separate pre-registered and walk-in data completion (2026-05-06).
- Use paperless walk-in QR display, not pre-printed cards (2026-05-06).
- Unique walk-in tokens, not one generic QR (2026-05-06).
- Generate and persist tokens before display (2026-05-06).
- No automatic walk-in expiry in MVP (2026-05-06).
- Help desk as fallback for exceptional cases (2026-05-06).
- Pre-registered QR is identity, staff session is permission (2026-05-18).
- Encode raw token only in pre-registered guest QR (2026-05-18).
- Browser camera + manual fallback (2026-05-18) — extended to PWA in SaaS.
- Public root shows registration only, staff routes are gated (2026-05-18) — extended via auth + role permissions in SaaS.
