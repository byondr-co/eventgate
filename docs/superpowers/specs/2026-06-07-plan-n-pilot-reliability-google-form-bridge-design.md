# Design - Plan N: Pilot Reliability + Google Form Bridge

**Date:** 2026-06-07
**Status:** Approved direction - pending implementation plan
**Author:** brainstormed with Vinei

## Context

Eventgate is 12 days from the Click Cam pilot opening on 2026-06-19. The pilot window runs
from 2026-06-19 through 2026-07-17. The T-7 gate is 2026-06-12.

Recent work has shipped the UI/UX refinement wave through Phase 5c on `origin/main`.
That work is out of scope for this plan. Plan N focuses on the next product and
operations decision: protect the pilot while adding a small Google Form bridge that
lets Click Cam keep an existing Google Form workflow if it is useful before launch.

Google integration is valuable for the pilot, but it is not launch-blocking. If the
bridge is not green by the T-7 rehearsal, Eventgate still launches with native public
registration and CSV import.

## Approved Direction

Use **Option 1: Pilot Reliability + Google Form Bridge**.

This means:

- Build a narrow, additive Google Form submission bridge using Apps Script and an
  Eventgate webhook.
- Keep the scanner, help desk, audit, QR delivery, and guest records inside Eventgate.
- Run pilot reliability checks as the primary launch gate.
- Treat the bridge as optional at launch: enabled only if it passes rehearsal.
- Defer product-grade Google OAuth, Forms API watches, Pub/Sub, and two-way sync until
  after the pilot.

## Roadmap

### Now to 2026-06-12: Plan N

Primary outcome: Click Cam can safely run the pilot, with the Google Form bridge
available only if it passes rehearsal.

Workstreams:

- Google Form bridge MVP.
- Pilot dry-run checklist updates.
- Production smoke and ingress tests.
- Operator-facing installation guide for the Apps Script bridge.
- Cutoff decision: bridge enabled only if green by T-7.

### 2026-06-13 to 2026-06-18: Stabilization Window

Primary outcome: no new surface area unless a dry-run finding requires it.

Allowed:

- Bug fixes from rehearsal.
- Copy fixes.
- Bridge install or documentation fixes.
- Runbook updates.
- Small UI polish only when it reduces operator confusion.

Avoid:

- New integrations.
- Security refactors.
- Schema changes unless additive and necessary.
- Broad backlog items.

### 2026-06-19 to 2026-07-17: Live Pilot Watch

Primary outcome: operate calmly and collect evidence.

Cadence:

- Before each real event or use day: health, ingress, and scanner check.
- During event: Sentry, Fly, dashboard, and help desk watch.
- After event: short operational note, metrics, customer feedback, and incident log.
- Weekly: decide whether any pilot hotfix is worth shipping.

### Post-Pilot Decision

After Click Cam feedback, choose one of three product bets:

1. **Native Eventgate forms become primary.** Google bridge remains a migration/helper
   tool. Best if customers accept moving registration into Eventgate.
2. **Integration-first Eventgate.** Google Forms, Sheets, Facebook lead forms, and
   similar sources become core onboarding value. Best if organizers strongly prefer
   existing form tools.
3. **Door-system specialization.** Eventgate focuses on scanning, walk-ins, help desk,
   audit, and offline reliability, while external tools own registration.

Current hypothesis: ship the Google bridge as pilot helper, then decide post-pilot
whether integrations are core or onboarding glue.

## Goals

Plan N is successful when:

- Click Cam can keep using its Google Form while Eventgate owns QR issuance, guest
  records, scanning, help desk, and audit.
- Door-day operation does not depend on Google being live. Once guests are in
  Eventgate, scanner operation is independent.
- The bridge can fail without corrupting guests, duplicating QR sends, or blocking
  launch.
- The runbook dry-run remains the primary launch gate.
- The implementation is small enough to disable cleanly if the bridge slips.

## Non-Goals

- No Google OAuth.
- No Google Forms API watch.
- No Cloud Pub/Sub.
- No check-in sync back to Google Sheets.
- No self-serve Google account connection UI.
- No automatic Google Form creation from Eventgate.
- No broad deferred-backlog sweep.
- No `ALLOWED_HOSTS` tightening before pilot unless already proven safe.
- No refresh-token/logout security refactor before pilot.
- No custom domains, analytics, billing, or paid ticketing work.

## Track A - Google Form Bridge MVP

### Architecture

Use a small Eventgate-side integration plus a copy-paste Apps Script snippet.

Recommended backend location: a new `apps.integrations` Django app. This keeps bridge
models, webhook views, and tests separate from the existing `apps.guests` guest-list
logic while still reusing `apps.guests.services.register_guest()`.

The bridge is event-scoped:

- One bridge config belongs to one organization and one event.
- It has an enabled/disabled state.
- It has a generated secret used by Apps Script.
- It maps Google Form question labels to Eventgate `RegistrationField.field_key`
  values.
- It has a duplicate policy. Pilot default: upsert by email.

### Backend Data Model

#### `GoogleFormBridge`

Fields:

- `organization`
- `event`
- `name`
- `enabled`
- `secret_hash`
- `field_mapping`
- `duplicate_policy`
- `created_by`
- `created_at`
- `updated_at`
- `last_seen_at`

`field_mapping` is JSON:

```json
{
  "Full Name": "name",
  "Email": "email",
  "Phone": "phone_or_chat",
  "Company": "organization"
}
```

Keys are Google Form labels from `e.namedValues`. Values are Eventgate field keys.
Allowed values are the event's registration field keys. Unknown target keys are
rejected when saving config or when processing a submission.

`duplicate_policy` values:

- `upsert_by_email`: pilot default. If a same-event guest with the same email exists,
  fill missing fields and update changed custom fields. Do not resend QR unless a
  future explicit resend option is added.
- `reject_duplicates`: accepted design alternative, not the pilot default.

#### `GoogleFormSubmission`

Fields:

- `organization`
- `event`
- `bridge`
- `submission_id`
- `guest`
- `status`
- `payload_hash`
- `received_payload`
- `error`
- `created_at`
- `processed_at`

Unique constraint:

- `(bridge, submission_id)`

Statuses:

- `accepted`
- `duplicate`
- `updated`
- `rejected`

This table is the idempotency record. If Apps Script retries a submission, Eventgate
returns the prior outcome instead of creating another guest or sending another QR.

### Webhook

Route:

```text
POST /api/v1/integrations/google-forms/<bridge_id>/submissions/
```

Authentication:

- Apps Script sends `X-Eventgate-Bridge-Secret: <secret>`.
- Eventgate compares the presented secret to `secret_hash`.
- On mismatch, return `401` with a clean JSON error and no guest mutation.

Payload:

```json
{
  "submission_id": "sheet-row-42",
  "submitted_at": "2026-06-07T10:15:00+07:00",
  "fields": {
    "Full Name": "Alice Dara",
    "Email": "alice@example.com",
    "Phone": "+85512345678",
    "Company": "The Click Cam"
  }
}
```

Rules:

- JSON only. DRF default parser already handles this.
- `submission_id` is required. The Apps Script snippet can generate it from row number,
  timestamp, and email if the form event does not provide a stable id.
- `fields` must be an object of string keys to scalar values.
- The bridge must be enabled.
- The event must still be accepting registration unless the user explicitly changes
  the existing Eventgate event setting.

Processing flow:

1. Authenticate bridge secret.
2. Load bridge with organization and event.
3. Reject disabled bridge.
4. Create or find `GoogleFormSubmission` by `(bridge, submission_id)`.
5. If already processed, return its prior outcome.
6. Map Google labels to Eventgate field keys.
7. Validate required Eventgate fields.
8. If no duplicate exists, call `register_guest(event=event, payload=payload, source="google_form_bridge")`.
9. If duplicate exists and policy is `upsert_by_email`, update allowed guest fields without sending a new QR.
10. Write audit.
11. Return clean JSON with outcome and guest id.

Response examples:

```json
{
  "status": "accepted",
  "guest_id": "..."
}
```

```json
{
  "status": "duplicate",
  "guest_id": "...",
  "detail": "Submission was already processed."
}
```

```json
{
  "status": "rejected",
  "detail": "Missing required: email"
}
```

### Duplicate and Update Behavior

Pilot default is upsert by email because Google Form users can resubmit or an operator
can retry the script.

For an existing same-event guest with the same email:

- Do not call `register_guest()`.
- Do not create a new token.
- Do not send a new QR email.
- Update `full_name`, `phone_or_chat`, and custom fields only when the incoming value
  is non-empty and different.
- Preserve `entry_status`, `checked_in_at`, `gate`, `scanner`, and audit history.
- Write `integration.google_form_guest_updated` if any guest fields changed.
- Write `integration.google_form_guest_duplicate` if nothing changed.

### Audit Actions

Use the existing `write_audit()` helper.

Actions:

- `integration.google_form_guest_created`
- `integration.google_form_guest_updated`
- `integration.google_form_guest_duplicate`
- `integration.google_form_submission_rejected`
- `integration.google_form_bridge_disabled`

Audit details should include:

- `bridge_id`
- `submission_id`
- `payload_hash`
- mapped field keys
- duplicate policy
- reason for rejection when applicable

### Admin Surface

Add a minimal event-scoped settings surface under the event configuration area.

Content:

- Enable/disable bridge.
- Create/rotate bridge secret.
- Copy webhook URL.
- Copy Apps Script snippet.
- Configure field mapping from Google labels to Eventgate field keys.
- Show last received submission time.
- Show recent submission outcomes, if inexpensive to include.

This UI should be practical, not polished as a full Google integration. The key
operator need is to install and test the bridge before T-7.

### Apps Script Snippet

Preferred pilot path: Sheet-bound trigger. It is easier to inspect and can write sync
status beside each row.

Script behavior:

1. Install an `onFormSubmit(e)` trigger on the Google response Sheet.
2. Read `e.namedValues`.
3. Build `submission_id` from row number or timestamp plus email.
4. POST JSON to Eventgate with `UrlFetchApp.fetch()`.
5. Send `X-Eventgate-Bridge-Secret`.
6. Write sync status to a sheet column if possible:
   - `synced`
   - `duplicate`
   - `updated`
   - `rejected: <reason>`
   - `failed: <http status>`
7. Retry once on transient 5xx or network failure.

The docs should also include a Form-bound variant for cases where a response Sheet is
not convenient, but the Sheet-bound trigger is the recommended Click Cam install path.

### Install Checklist

The operator checklist should cover:

1. Eventgate: create bridge, configure mappings, enable bridge.
2. Eventgate: copy webhook URL and secret.
3. Google Sheet: open Extensions -> Apps Script.
4. Paste script.
5. Set constants: webhook URL and secret.
6. Add installable trigger for `onFormSubmit`.
7. Submit a test form response.
8. Confirm Eventgate guest appears and QR email is sent.
9. Confirm Google Sheet sync status is written.
10. Disable test bridge or delete test guest if needed.

## Track B - Pilot Reliability

### Reliability Gates

- **2026-06-10:** Google bridge must be locally tested and ready for staging/prod
  install rehearsal.
- **2026-06-12 T-7:** production dry-run. If the bridge is not green, disable it and
  proceed with Eventgate native registration or CSV import.
- **2026-06-16 T-3:** only targeted fixes from dry-run findings.
- **2026-06-18 T-1:** final device/customer rehearsal. No new feature work.
- **2026-06-19:** pilot launch.

### Reliability Scope

Verify:

- `origin/main` deploy state.
- Backend health.
- Migrations.
- Celery worker and beat.
- Redis.
- Sentry.
- Email.
- Telegram.
- Vercel frontend readiness.
- Device enroll.
- PIN unlock.
- Scanner cache prime.
- Pre-registered scan.
- Duplicate scan.
- Offline queue and replay.
- Help desk escalation.
- Walk-in display QR.
- Walk-in claim.
- Walk-in info form.
- Walk-in capacity boundary.
- Blocked re-scan reminder.
- Native registration.
- CSV import.
- Google Form bridge, if enabled.
- Audit, help desk, and stats surfaces reflecting the above.
- Printed guest-list fallback.
- Operator runbook readiness.

### Bridge Fallback

If the bridge is disabled or fails rehearsal:

- Click Cam uses Eventgate native registration, or the team imports the latest Google
  Sheet responses by CSV before the event.
- Scanner and help desk flows remain unchanged.
- Apps Script can remain installed but the bridge is set `enabled=false`, causing
  clean rejected responses without guest mutation.
- Any unsynced Google Sheet rows can be imported later by CSV.

### Runbook Updates

Plan N should update the pilot runbook with:

- Google bridge install steps.
- Bridge test steps.
- Bridge cutoff decision.
- Bridge disable procedure.
- Google Sheet manual retry procedure.
- Ingress smoke covering native form, CSV, and Google bridge.
- Post-pilot feedback questions about whether Google Form integration was necessary
  or merely convenient.

## Testing Strategy

### Backend Tests

Required tests:

- Creating a bridge stores a hashed secret and exposes the raw secret only at creation
  or rotation time.
- Webhook rejects missing or wrong secret.
- Webhook rejects disabled bridge without guest mutation.
- Webhook maps Google labels to Eventgate field keys.
- Webhook rejects unknown mapping targets.
- Webhook creates a guest through `register_guest()` and enqueues QR email.
- Webhook records idempotency and does not create/send twice on retry.
- Duplicate email with `upsert_by_email` updates allowed fields without resending QR.
- Duplicate email with no changed fields returns duplicate/no-op.
- Required Eventgate fields are enforced.
- Rejected submissions write audit.
- Created/updated/duplicate submissions write audit with bridge and submission ids.

### Frontend Tests

Focused tests:

- Bridge settings panel renders webhook URL, mapping controls, and enabled toggle.
- Copy/install section shows Apps Script snippet.
- Mapping form only allows valid Eventgate field keys.
- Rotate secret flow shows the new secret once.
- Disabled bridge state is visually clear.

### Manual Verification

Use a real test Google Sheet:

1. Submit a valid form row.
2. Confirm Eventgate guest appears.
3. Confirm QR email is sent.
4. Submit the same row again or run the script manually.
5. Confirm no duplicate guest and no duplicate QR send.
6. Submit a row with missing required fields.
7. Confirm rejected status in the Sheet and audit row in Eventgate.
8. Disable the bridge.
9. Submit another row.
10. Confirm clean disabled response and no guest mutation.

## Security and Privacy

- The bridge secret is a bearer credential. Store it hashed server-side and show it
  only on create/rotate.
- Apps Script installation instructions must tell the customer not to paste the
  secret into public docs or shared screenshots.
- The webhook must not log full payloads in application logs. Store full received
  payload only in the `GoogleFormSubmission` row for debugging and audit.
- Audit rows should include payload hash and field keys, not excessive PII.
- Rate limit the webhook per bridge or per IP if the existing throttle setup makes
  this cheap. If not included in Plan N, add it as a post-pilot hardening candidate.

## Risks

| Risk | Mitigation |
|---|---|
| Apps Script install friction slows the customer | Provide copy-paste script, checklist, and a rehearsal before T-7. |
| Script retries duplicate a guest | `GoogleFormSubmission` idempotency plus duplicate-by-email policy. |
| Google Form labels change after mapping | Rehearsal catches it; webhook returns rejected with clear reason; CSV fallback remains available. |
| Bridge ships but is unreliable by T-7 | Disable bridge and use native Eventgate registration or CSV import. |
| Duplicate email update overwrites important data | Only update allowed fields with non-empty values; never touch entry status, check-in fields, or token. |
| Scope expands into Google OAuth | Hard non-goal before pilot. Revisit post-pilot only. |

## Implementation Order

1. Backend bridge model, secret handling, webhook, idempotency, and tests.
2. Apps Script snippet and installation docs.
3. Minimal admin UI for bridge settings and mapping.
4. Runbook and Plan N verification checklist.
5. Full T-7 dry-run and cutoff decision.

## Open Decisions Resolved

- **Is Google integration needed before pilot?** Useful, not launch-blocking.
- **Which integration shape?** Apps Script bridge, not OAuth/PubSub.
- **Who installs the script?** Vinei can coordinate with Click Cam and convince them to install it on the Form or response Sheet.
- **Recommended trigger?** Sheet-bound trigger for pilot because it can write sync status and is easier to inspect.
- **Fallback if not ready?** Disable bridge and use Eventgate native registration or CSV import.
