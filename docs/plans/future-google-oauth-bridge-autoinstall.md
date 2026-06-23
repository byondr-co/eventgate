# Future: Google OAuth auto-install for the Google Form bridge (Option C)

> **Status:** Parked memo, not a plan. Captured 2026-06-19 during the Event Setup
> Wizard build (slice 1 of the post-pilot UX uplift). Do NOT start without an
> explicit decision to revisit.

## What this is

The wizard's bridge sub-wizard (shipped in slice 1) still requires the organizer
to **manually paste an Apps Script snippet** into their Google Sheet's Apps Script
editor and run "Initialize setup." This is the one remaining technical step we
could not remove, because installing the script and its `onFormSubmit` trigger
happens **inside Google's UI**, which we do not control.

**Option C** eliminates that paste entirely: Eventgate uses **Google OAuth + the
Apps Script API (and/or Forms API)** to programmatically install the bridge script
and trigger into the organizer's Sheet on their behalf. The organizer would only
click "Connect Google," authorize, pick the form/sheet, and be done — zero paste,
zero Apps Script editor.

## Why it was deferred (slice 1)

- **No OAuth infrastructure exists** in the codebase today (no Google OAuth client,
  no token storage/refresh, no consent flow).
- **Large surface:** Google Cloud project + OAuth consent screen verification
  (sensitive/restricted scopes for Apps Script/Drive), token lifecycle, per-user
  Google credentials, error handling for revoked/expired grants.
- **Restricted-scope review:** the Apps Script API + Drive scopes are Google
  "restricted" scopes — they require a security assessment / verification for a
  published app, which is a multi-week external dependency.
- **The pilot showed guided-manual is acceptable:** with the wizard's "send a test
  submission" trust gate, organizers can complete the manual install with
  confidence. The paste is a one-time, ~2-minute step.

## When to revisit

Pick this up if any of these become true:
1. Manual Apps Script install becomes the **top organizer complaint again** after
   the wizard ships (watch the next round of feedback in
   `docs/plans/improvement-and-findings-logs.md`).
2. We need to support **Google Forms without a linked Sheet**, or richer
   form-field sync that the Sheet-row Apps Script can't provide.
3. We're already standing up Google OAuth for another reason (e.g. Google sign-in,
   Calendar, Drive export) — the marginal cost of adding Apps Script install drops.

## Rough shape (when it happens)

- Google Cloud project + OAuth consent screen (restricted-scope verification).
- Backend: OAuth client, encrypted per-user token store, refresh handling.
- Backend: Apps Script API call to create/bind the script + `onFormSubmit` trigger
  using the existing snippet logic in `frontend/lib/google-form-bridge-apps-script.ts`
  (ported server-side or via the API's project content endpoints).
- Wizard: replace the "install" + "test" manual sub-steps with a single
  "Connect Google → authorize → pick form → done" flow; keep the manual path as a
  fallback for orgs that decline OAuth.
- Its own spec → plan → build cycle.
