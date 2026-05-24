## Purpose of this document
This document is to keep track of the improvement and findings of the project. This document is also to keep track of the features that are not working, not implemented, and the features that are working but need improvement. This document is also to keep track of the bugs and issues that are found during the development and testing phase. This document is also to keep track of the feedback and suggestions from the users and stakeholders.

Important note: Everything in this docuument should not be autonomously implemented without the approval of the project manager and the team lead.

## What is not working
- Invite member is not works
- **Device creation: 500 + raw HTML on unique (Label, Role) violation** (surfaced during Plan H T9 smoke, 2026-05-25). The `unique_together` (or unique constraint) check on device Label + Role bubbles up as a `django.db.utils.IntegrityError` → unhandled 500 → Django's debug HTML page (or empty 500 in prod-mode), instead of being caught by the serializer's `validate()` and re-raised as a `ValidationError` so the form renders a proper field-level message. Affects: dashboard → org → event → devices → "Add device" form. **Pre-existing bug — not Plan H related.** Deferred for separate hygiene fix. Likely fix: in the device-create serializer/view, wrap the save in a try/except `IntegrityError` and translate to a `ValidationError({"label": "A device with this label and role already exists."})` — or add an explicit serializer-level uniqueness validator that runs before save.

## What is not implemented
- No navigation button back / forward
- No update / edit feature for everything
- No delete feature for everything
- No search feature for everything
- No filter feature for everything
- No sorting feature for everything
- No pagination feature for everything
- No export feature for everything
- No import feature for everything
- No notification feature for everything
- No user role management feature for everything
- No permission management feature for everything
- No activity log feature for everything

## Operational findings / gotchas

- **2026-05-25 — Fly SSH does not inherit the Docker ENV.** Backend Dockerfile sets `ENV PATH=/app/.venv/bin:${PATH}` so the container's `release_command` (run by Fly with the Docker ENV applied) can use bare `python manage.py X`. But `flyctl ssh console` (interactive and `--command` mode) starts a fresh bash shell that does NOT inherit that Docker ENV — bare `python` resolves to the system Python (no Django), and `uv` is not in PATH at all (uv was only used at Docker build time). **Inside any `flyctl ssh ...` invocation, use `/app/.venv/bin/python manage.py …` explicitly.** Discovered during Plan H T4 webhook setup. Runbook §1.3 + Plan H execution plan updated.

- **2026-05-25 — `mypy apps/` (local pre-commit) vs `mypy apps config` (CI) scope mismatch.** Local pre-commit hooks ran mypy only against `apps/`; CI runs it against `apps config`. T5's rename touched `backend/config/settings/test.py` and introduced a type bug (`MEDIA_ROOT = tempfile.mkdtemp(...)` → `str`, but `base.py` types it as `Path` via `BASE_DIR / "media"`). The narrower-local / wider-CI gap let it pass T5's local gates and only fail at GHA. Fix landed in hotfix branch `hotfix/mypy-test-media-root` (PR #2). **Follow-up:** normalize the two mypy scopes to match.

- **2026-05-25 — `DEFAULT_FROM_EMAIL` Fly secret was stale on staging after Plan H rename.** Source code base.py default was updated to `"Gatethres <noreply@gatethres.com>"` in T5, but the runtime value is sourced from the Fly secret `DEFAULT_FROM_EMAIL` which had been set to `"Eventgate <onboarding@resend.dev>"` during initial setup and was never rotated. T9 smoke caught it — outgoing email "from" still showed Eventgate. **Fixed 2026-05-25:** `flyctl secrets set --app eventgate-backend-staging DEFAULT_FROM_EMAIL="Gatethres <onboarding@resend.dev>"`. Sender domain stays `onboarding@resend.dev` (Resend default — no domain verification needed); switch to `noreply@mail.gatethres.com` when the deferred prod env split lands.
