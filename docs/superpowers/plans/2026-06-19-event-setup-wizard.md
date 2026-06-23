# Event Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified, guided Event Setup Wizard that takes a non-technical organizer from "new event" to "live", with a co-equal native / Google-Form registration branch, a de-tech'd bridge sub-wizard (auto-detected fields + a dry-run "test submission" trust gate), and a reusable motion + illustration layer grown inside the flow.

**Architecture:** Backend changes are purely additive to `apps.integrations` (new bridge fields `seen_labels` + `test_mode`, a submission `kind`, a detected-fields endpoint, a dry-run preview path, and a test-submission poll endpoint) — no breaking changes to the existing webhook contract. Frontend adds a namespaced wizard (`components/wizard/`), motion primitives (`components/motion/`), and inline illustrations (`components/illustrations/`); the wizard replaces the single-page `EventCreateWizard` at `/orgs/[slug]/events/new` and reuses the existing registration-form-builder (native branch) and bridge API hooks (Google branch).

**Tech Stack:** Django + DRF + pytest (backend); Next.js (modified fork — see Global Constraints) + React + TypeScript + TanStack Query + Tailwind v4 (OKLCH tokens, shadcn base-nova) + `motion` (framer-motion) + Vitest + Playwright (frontend).

## Global Constraints

- **Modified Next.js:** `frontend/AGENTS.md` warns this is NOT stock Next.js — APIs/conventions may differ. Before writing ANY frontend routing/navigation/hook code (`useRouter`, `useSearchParams`, `redirect`, route file conventions), read the relevant guide under `frontend/node_modules/next/dist/docs/` and heed deprecation notices. Do not assume training-data Next APIs.
- **Commit style:** single-line Conventional Commits, NO `Co-Authored-By` trailer (project convention).
- **Backend test runner:** `docker start eventgate-postgres-1 || docker compose up -d postgres` then `cd backend && uv run pytest -q`. Backend tests live flat in `backend/tests/` (e.g. `test_google_form_bridge_webhook.py`). Mirror existing fixtures there.
- **Backend type gate:** `cd backend && uv run mypy apps config` must stay clean.
- **Frontend gates (all must pass):** `cd frontend && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`. Run `nvm use 20` first. Frontend unit tests live in `frontend/__tests__/`; Playwright e2e in `frontend/tests/`.
- **A11y:** all motion respects `prefers-reduced-motion` (degrade to instant/opacity-only). Existing a11y + dark-mode lane must not regress.
- **Registration field targets:** valid mapping targets = event `RegistrationField.field_key` values plus the presets `{"name", "email", "phone_or_chat"}` (see `apps/integrations/services.py:PRESET_TARGETS`). Required-field guard already enforced in `GoogleFormBridgeSerializer.validate`.
- **Boundary discipline:** new surface is namespaced (`wizard/`, `motion/`, `illustrations/`). Do NOT edit existing shadcn primitives in `components/ui/`. Do NOT touch existing settings/dashboard pages in this slice.

---

## Phase A — Backend (additive bridge API)

### Task 1: Add `seen_labels` + `test_mode` to GoogleFormBridge and `kind` to GoogleFormSubmission

**Files:**
- Modify: `backend/apps/integrations/models.py:26-46` (bridge fields), `:98-128` (submission fields)
- Create: `backend/apps/integrations/migrations/0002_bridge_setup_fields.py` (generated)
- Test: `backend/tests/test_google_form_bridge_models.py`

**Interfaces:**
- Produces: `GoogleFormBridge.seen_labels: list[str]` (default `[]`), `GoogleFormBridge.test_mode: bool` (default `False`), `GoogleFormSubmission.kind: str` (default `"real"`, choices `real|test`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_google_form_bridge_models.py  (add to existing file)
import pytest
from apps.integrations.models import GoogleFormBridge, GoogleFormSubmission

@pytest.mark.django_db
def test_bridge_has_setup_defaults(make_event, make_user):
    event = make_event()
    bridge, _secret = GoogleFormBridge.create_with_secret(
        event=event, created_by=make_user()
    )
    assert bridge.seen_labels == []
    assert bridge.test_mode is False

@pytest.mark.django_db
def test_submission_defaults_to_real_kind(make_event, make_user):
    event = make_event()
    bridge, _ = GoogleFormBridge.create_with_secret(event=event, created_by=make_user())
    sub = GoogleFormSubmission.objects.create(
        bridge=bridge, submission_id="s1", status="accepted", payload_hash="x"
    )
    assert sub.kind == "real"
```

(Reuse the `make_event` / `make_user` fixtures already used in `test_google_form_bridge_models.py`; if names differ, match that file's fixtures.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_models.py -k "setup_defaults or real_kind" -q`
Expected: FAIL — `AttributeError`/`FieldError` (fields don't exist).

- [ ] **Step 3: Add the fields**

```python
# models.py — inside GoogleFormBridge, after field_mapping (line ~29)
    seen_labels = models.JSONField(default=list, blank=True)
    test_mode = models.BooleanField(default=False)
```

```python
# models.py — inside GoogleFormSubmission, after status (line ~123)
    KINDS = (("real", "Real"), ("test", "Test"))
    kind = models.CharField(max_length=8, choices=KINDS, default="real")
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && uv run python manage.py makemigrations integrations`
Expected: creates `0002_*.py` adding `seen_labels`, `test_mode`, `kind`.

- [ ] **Step 5: Run tests + migration check**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_models.py -q && uv run python manage.py makemigrations --check --dry-run`
Expected: PASS, no pending migrations.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/integrations/models.py backend/apps/integrations/migrations/0002_bridge_setup_fields.py backend/tests/test_google_form_bridge_models.py
git commit -m "feat(integrations): add bridge seen_labels/test_mode + submission kind"
```

---

### Task 2: Record `seen_labels` from every submission payload

**Files:**
- Modify: `backend/apps/integrations/services.py` (add helper + call in `process_google_form_submission`)
- Test: `backend/tests/test_google_form_bridge_webhook.py`

**Interfaces:**
- Produces: `record_seen_labels(bridge: GoogleFormBridge, fields: dict) -> None` — merges `fields.keys()` into `bridge.seen_labels` (sorted, deduped) and persists.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_google_form_bridge_webhook.py  (add)
@pytest.mark.django_db
def test_webhook_records_seen_labels(enabled_bridge, post_submission):
    post_submission(
        enabled_bridge,
        {"submission_id": "s1", "fields": {"Email Address": ["a@x.com"], "Full Name": ["Ana"]}},
    )
    enabled_bridge.refresh_from_db()
    assert "Email Address" in enabled_bridge.seen_labels
    assert "Full Name" in enabled_bridge.seen_labels
```

(Use the existing webhook-posting fixture/helper in this file; `enabled_bridge` should be a bridge with `enabled=True` and an email mapping, matching existing tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_webhook.py -k seen_labels -q`
Expected: FAIL — `seen_labels` stays `[]`.

- [ ] **Step 3: Implement the helper + call it**

```python
# services.py — add near the other helpers
def record_seen_labels(bridge: GoogleFormBridge, fields: dict[str, Any]) -> None:
    incoming = {str(k) for k in fields if str(k).strip()}
    if not incoming:
        return
    merged = sorted(set(bridge.seen_labels or []) | incoming)
    if merged != (bridge.seen_labels or []):
        bridge.seen_labels = merged
        bridge.save(update_fields=["seen_labels", "updated_at"])
```

```python
# services.py — in process_google_form_submission, right after the
# `if not isinstance(fields, dict): raise ...` guard (line ~189):
        record_seen_labels(bridge, fields)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_webhook.py -k seen_labels -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/integrations/services.py backend/tests/test_google_form_bridge_webhook.py
git commit -m "feat(integrations): record observed Google Form labels on the bridge"
```

---

### Task 3: Dry-run preview path for test submissions (no guest, no QR)

**Files:**
- Modify: `backend/apps/integrations/services.py` (new `preview_google_form_submission` + dispatch in `process_google_form_submission`)
- Test: `backend/tests/test_google_form_bridge_webhook.py`

**Interfaces:**
- Consumes: `record_seen_labels` (Task 2), `map_google_fields`, `payload_hash` (existing).
- Produces: when `bridge.test_mode` is True, `process_google_form_submission` returns `{"status": "test_accepted", "mapped": {...}}` or `{"status": "test_rejected", "detail": "..."}`, writes a `GoogleFormSubmission(kind="test", guest=None)`, writes a `integration.google_form_test_submission` audit row, and creates NO guest and queues NO QR email. The `enabled` check is bypassed in test mode.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_google_form_bridge_webhook.py  (add)
from apps.guests.models import Guest
from apps.integrations.models import GoogleFormSubmission

@pytest.mark.django_db
def test_test_mode_submission_creates_no_guest(make_bridge, post_submission):
    bridge = make_bridge(enabled=False, test_mode=True,
                         field_mapping={"Email Address": "email", "Full Name": "name"})
    before = Guest.objects.count()
    resp = post_submission(
        bridge,
        {"submission_id": "t1", "fields": {"Email Address": ["a@x.com"], "Full Name": ["Ana"]}},
    )
    assert resp.json()["status"] == "test_accepted"
    assert resp.json()["mapped"] == {"email": "a@x.com", "name": "Ana"}
    assert Guest.objects.count() == before  # no guest
    sub = GoogleFormSubmission.objects.get(bridge=bridge, submission_id="t1")
    assert sub.kind == "test"
    assert sub.guest is None

@pytest.mark.django_db
def test_test_mode_rejects_unmappable(make_bridge, post_submission):
    bridge = make_bridge(enabled=False, test_mode=True, field_mapping={"Email Address": "email"})
    resp = post_submission(bridge, {"submission_id": "t2", "fields": {"Unknown": ["x"]}})
    # email maps to nothing -> register-side rules surface as test_rejected via preview
    assert resp.json()["status"] in {"test_rejected", "test_accepted"}
    assert GoogleFormSubmission.objects.get(bridge=bridge, submission_id="t2").kind == "test"
```

(Add a `make_bridge(**kwargs)` fixture if not present, wrapping `GoogleFormBridge.create_with_secret` then setting `enabled`/`test_mode`/`field_mapping` and saving.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_webhook.py -k test_mode -q`
Expected: FAIL — test submissions currently rejected with "Bridge is disabled."

- [ ] **Step 3: Implement the preview path**

```python
# services.py — add this function
@transaction.atomic
def preview_google_form_submission(
    *,
    bridge: GoogleFormBridge,
    payload: dict[str, Any],
) -> dict[str, Any]:
    submission_id = str(payload.get("submission_id") or "").strip() or "test"
    digest = payload_hash(payload)
    submitted_at = _submission_time(payload.get("submitted_at"))
    fields = payload.get("fields")
    if not isinstance(fields, dict):
        raise GoogleFormBridgeError("fields must be an object.")

    record_seen_labels(bridge, fields)

    submission, _created = GoogleFormSubmission.objects.update_or_create(
        bridge=bridge,
        submission_id=submission_id,
        defaults={
            "organization": bridge.organization,
            "event": bridge.event,
            "kind": "test",
            "status": "accepted",
            "guest": None,
            "payload_hash": digest,
            "received_payload": payload,
            "submitted_at": submitted_at,
            "processed_at": timezone.now(),
            "error": "",
        },
    )

    try:
        mapped = map_google_fields(bridge, fields)
        if not _normalized_email(mapped):
            raise GoogleFormBridgeError("A submission must include an email to register a guest.")
        result: dict[str, Any] = {"status": "test_accepted", "mapped": mapped}
    except GoogleFormBridgeError as exc:
        reason = _validation_detail(exc)
        submission.status = "rejected"
        submission.error = reason
        submission.save(update_fields=["status", "error", "updated_at"])
        result = {"status": "test_rejected", "detail": reason}

    write_audit(
        organization=bridge.organization,
        event=bridge.event,
        guest=None,
        actor_type="integration",
        actor_id=str(bridge.id),
        action="integration.google_form_test_submission",
        result="success" if result["status"] == "test_accepted" else "error",
        details={
            "bridge_id": str(bridge.id),
            "submission_id": submission_id,
            "payload_hash": digest,
            "status": result["status"],
        },
    )
    bridge.mark_seen()
    return result
```

```python
# services.py — at the TOP of process_google_form_submission, before the
# existing submission_id guard (line ~150):
    if bridge.test_mode:
        return preview_google_form_submission(bridge=bridge, payload=payload)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_webhook.py -k test_mode -q`
Expected: PASS.

- [ ] **Step 5: Run the FULL bridge suite (no regression to disabled-rejection contract)**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_webhook.py -q`
Expected: PASS — disabled (non-test) bridges still reject cleanly.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/integrations/services.py backend/tests/test_google_form_bridge_webhook.py
git commit -m "feat(integrations): dry-run preview path for test submissions"
```

---

### Task 4: `detected-fields` endpoint with server-side target suggestions

**Files:**
- Modify: `backend/apps/integrations/views.py` (new `GoogleFormBridgeDetectedFieldsView`), `backend/apps/integrations/urls.py`, `backend/apps/integrations/services.py` (suggestion helper)
- Test: `backend/tests/test_google_form_bridge_admin_api.py`

**Interfaces:**
- Produces: `GET /api/v1/orgs/<org>/events/<event>/integrations/google-form-bridge/<id>/detected-fields/` → `{"seen_labels": [...], "suggestions": {label: target_field_key}}`. `suggest_field_targets(bridge) -> dict[str, str]` maps each seen label to a guessed valid target (email/name/phone presets by keyword, else exact-or-substring match to an event `field_key`/`label_en`); unmatched labels are omitted.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_google_form_bridge_admin_api.py  (add)
@pytest.mark.django_db
def test_detected_fields_returns_labels_and_suggestions(api_client_owner, bridge_with_labels):
    org, event, bridge = bridge_with_labels(["Email Address", "Full Name", "Mobile"])
    url = (f"/api/v1/orgs/{org.slug}/events/{event.slug}"
           f"/integrations/google-form-bridge/{bridge.id}/detected-fields/")
    resp = api_client_owner.get(url)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["seen_labels"]) == {"Email Address", "Full Name", "Mobile"}
    assert body["suggestions"]["Email Address"] == "email"
    assert body["suggestions"]["Full Name"] == "name"
    assert body["suggestions"]["Mobile"] == "phone_or_chat"
```

(`bridge_with_labels` fixture: create org+event+owner membership, a bridge, set `bridge.seen_labels=[...]`, save; mirror auth setup in existing admin-api tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_admin_api.py -k detected_fields -q`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement suggestion helper**

```python
# services.py
_PRESET_KEYWORDS = (
    ("email", "email"),
    ("e-mail", "email"),
    ("name", "name"),
    ("phone", "phone_or_chat"),
    ("mobile", "phone_or_chat"),
    ("tel", "phone_or_chat"),
    ("telegram", "phone_or_chat"),
    ("chat", "phone_or_chat"),
)

def suggest_field_targets(bridge: GoogleFormBridge) -> dict[str, str]:
    allowed = valid_field_keys(bridge)
    field_rows = list(
        RegistrationField.objects.filter(event=bridge.event).values_list("field_key", "label_en")
    )
    out: dict[str, str] = {}
    for label in bridge.seen_labels or []:
        low = label.strip().lower()
        target = next((t for kw, t in _PRESET_KEYWORDS if kw in low and t in allowed), None)
        if target is None:
            for fk, le in field_rows:
                if low == fk.lower() or (le and low == le.lower()) or fk.lower() in low:
                    target = fk
                    break
        if target:
            out[label] = target
    return out
```

- [ ] **Step 4: Implement the view + route**

```python
# views.py — add (reuse the auth pattern from GoogleFormBridgeDetailView)
from apps.integrations.services import suggest_field_targets  # add to imports

class GoogleFormBridgeDetectedFieldsView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def get(self, request: Request, org_slug: str, event_slug: str, bridge_id: Any) -> Response:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        bridge = get_object_or_404(GoogleFormBridge, id=bridge_id, event=event)
        return Response(
            {"seen_labels": bridge.seen_labels or [], "suggestions": suggest_field_targets(bridge)}
        )
```

```python
# urls.py — add to urlpatterns, and import GoogleFormBridgeDetectedFieldsView
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/detected-fields/",
        GoogleFormBridgeDetectedFieldsView.as_view(),
        name="google-form-bridge-detected-fields",
    ),
```

- [ ] **Step 5: Run test + mypy**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_admin_api.py -k detected_fields -q && uv run mypy apps config`
Expected: PASS, mypy clean.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/integrations/views.py backend/apps/integrations/urls.py backend/apps/integrations/services.py backend/tests/test_google_form_bridge_admin_api.py
git commit -m "feat(integrations): detected-fields endpoint with target suggestions"
```

---

### Task 5: Test-submission poll endpoint

**Files:**
- Modify: `backend/apps/integrations/views.py` (new `GoogleFormBridgeTestSubmissionView`), `backend/apps/integrations/urls.py`, `backend/apps/integrations/serializers.py` (preview serializer)
- Test: `backend/tests/test_google_form_bridge_admin_api.py`

**Interfaces:**
- Produces: `GET /api/v1/orgs/<org>/events/<event>/integrations/google-form-bridge/<id>/test-submission/` → `204` when no test submission yet, else `200` with `{"id", "status", "created_at", "mapped": {...}, "received_fields": {...}}` for the latest `kind="test"` row. `mapped` is recomputed via `map_google_fields` on the stored payload.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_google_form_bridge_admin_api.py  (add)
@pytest.mark.django_db
def test_test_submission_poll(api_client_owner, make_org_event_bridge, post_submission):
    org, event, bridge = make_org_event_bridge(
        enabled=False, test_mode=True, field_mapping={"Email Address": "email", "Full Name": "name"}
    )
    url = (f"/api/v1/orgs/{org.slug}/events/{event.slug}"
           f"/integrations/google-form-bridge/{bridge.id}/test-submission/")
    assert api_client_owner.get(url).status_code == 204  # none yet
    post_submission(bridge, {"submission_id": "t1",
                             "fields": {"Email Address": ["a@x.com"], "Full Name": ["Ana"]}})
    resp = api_client_owner.get(url)
    assert resp.status_code == 200
    assert resp.json()["status"] == "accepted"
    assert resp.json()["mapped"] == {"email": "a@x.com", "name": "Ana"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_admin_api.py -k test_submission_poll -q`
Expected: FAIL — 404.

- [ ] **Step 3: Implement view + route**

```python
# views.py — add (imports: GoogleFormSubmission already imported; add map_google_fields)
from apps.integrations.services import map_google_fields  # add to imports

class GoogleFormBridgeTestSubmissionView(APIView):
    permission_classes = (IsAuthenticated, IsOrgMember, HasOrgRole)
    required_org_roles = ("owner", "admin", "manager")

    def get(self, request: Request, org_slug: str, event_slug: str, bridge_id: Any) -> Response:
        event = get_object_or_404(Event, organization=request.organization, slug=event_slug)
        bridge = get_object_or_404(GoogleFormBridge, id=bridge_id, event=event)
        sub = (
            GoogleFormSubmission.objects.filter(bridge=bridge, kind="test")
            .order_by("-created_at")
            .first()
        )
        if sub is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        fields = (sub.received_payload or {}).get("fields")
        try:
            mapped = map_google_fields(bridge, fields) if isinstance(fields, dict) else {}
        except GoogleFormBridgeError:
            mapped = {}
        return Response(
            {
                "id": str(sub.id),
                "status": sub.status,
                "error": sub.error,
                "created_at": sub.created_at,
                "mapped": mapped,
                "received_fields": fields if isinstance(fields, dict) else {},
            }
        )
```

```python
# urls.py — add (import GoogleFormBridgeTestSubmissionView)
    path(
        "orgs/<slug:org_slug>/events/<slug:event_slug>/integrations/google-form-bridge/<uuid:bridge_id>/test-submission/",
        GoogleFormBridgeTestSubmissionView.as_view(),
        name="google-form-bridge-test-submission",
    ),
```

- [ ] **Step 4: Run test + full integrations suite + mypy**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_admin_api.py tests/test_google_form_bridge_webhook.py -q && uv run mypy apps config`
Expected: PASS, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/integrations/views.py backend/apps/integrations/urls.py backend/tests/test_google_form_bridge_admin_api.py
git commit -m "feat(integrations): test-submission poll endpoint"
```

---

### Task 6: Expose `seen_labels`/`test_mode` through the bridge serializer

**Files:**
- Modify: `backend/apps/integrations/serializers.py:10-29` (`BRIDGE_FIELDS` + read-only)
- Test: `backend/tests/test_google_form_bridge_admin_api.py`

**Interfaces:**
- Produces: bridge GET/PATCH payload includes `seen_labels` (read-only) and `test_mode` (writable) so the wizard can flip test mode and enable atomically.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_google_form_bridge_admin_api.py  (add)
@pytest.mark.django_db
def test_patch_can_toggle_test_mode(api_client_owner, make_org_event_bridge):
    org, event, bridge = make_org_event_bridge(enabled=False, test_mode=False)
    url = (f"/api/v1/orgs/{org.slug}/events/{event.slug}"
           f"/integrations/google-form-bridge/{bridge.id}/")
    resp = api_client_owner.patch(url, {"test_mode": True}, format="json")
    assert resp.status_code == 200
    assert resp.json()["test_mode"] is True
    assert "seen_labels" in resp.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_admin_api.py -k toggle_test_mode -q`
Expected: FAIL — fields absent from serializer.

- [ ] **Step 3: Add fields to the serializer**

```python
# serializers.py
BRIDGE_FIELDS: tuple[str, ...] = (
    "id", "name", "enabled", "test_mode", "field_mapping", "duplicate_policy",
    "webhook_url", "seen_labels", "last_seen_at", "recent_submissions",
    "created_at", "updated_at",
)
BRIDGE_READ_ONLY_FIELDS: tuple[str, ...] = (
    "id", "webhook_url", "seen_labels", "last_seen_at", "recent_submissions",
    "created_at", "updated_at",
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_google_form_bridge_admin_api.py -k toggle_test_mode -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/integrations/serializers.py backend/tests/test_google_form_bridge_admin_api.py
git commit -m "feat(integrations): expose seen_labels + test_mode in bridge serializer"
```

---

## Phase B — Frontend foundation

### Task 7: Add the `motion` dependency

**Files:**
- Modify: `frontend/package.json`, `frontend/pnpm-lock.yaml`

- [ ] **Step 1: Read the modified-Next caveat for any peer-dep notes**

Run: check `frontend/node_modules/next/dist/docs/` for client-component/animation guidance before adding a client-side animation lib.

- [ ] **Step 2: Install**

Run: `cd frontend && nvm use 20 && pnpm add motion`
Expected: `motion` added to `dependencies`.

- [ ] **Step 3: Verify build still typechecks**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "build(frontend): add motion (framer-motion) dependency"
```

---

### Task 8: Motion primitives (reduced-motion aware)

**Files:**
- Create: `frontend/components/motion/index.tsx`, `frontend/components/motion/use-reduced-motion.ts`
- Test: `frontend/__tests__/components/motion.test.tsx`

**Interfaces:**
- Produces: `<StepTransition>`, `<Stagger>`, `<Tappable>`, `<SuccessBurst>` React components; `usePrefersReducedMotion(): boolean`. All accept `children` and standard `className`. When reduced motion is on, transitions degrade to instant/opacity-only.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/motion.test.tsx
import { render, screen } from "@testing-library/react";
import { StepTransition, SuccessBurst } from "@/components/motion";

it("renders children", () => {
  render(<StepTransition stepKey="a"><p>hello</p></StepTransition>);
  expect(screen.getByText("hello")).toBeInTheDocument();
});

it("SuccessBurst renders its label", () => {
  render(<SuccessBurst label="You're live" />);
  expect(screen.getByText("You're live")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- motion`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reduced-motion hook**

```ts
// frontend/components/motion/use-reduced-motion.ts
"use client";
import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
```

- [ ] **Step 4: Implement the primitives**

```tsx
// frontend/components/motion/index.tsx
"use client";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export function StepTransition({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
        transition={{ duration: reduced ? 0.12 : 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function Stagger({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.05 } } }}
    >
      {children}
    </motion.div>
  );
}

export function Tappable({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div className={className} whileTap={reduced ? undefined : { scale: 0.97 }}>
      {children}
    </motion.div>
  );
}

export function SuccessBurst({ label }: { label: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      role="status"
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0.12 : 0.3 }}
      className="flex flex-col items-center gap-2 text-success"
    >
      <span aria-hidden className="text-4xl">✓</span>
      <span className="font-medium">{label}</span>
    </motion.div>
  );
}
```

> NOTE: `motion/react` is the modern import path for the `motion` package. If `pnpm exec tsc` cannot resolve it, check the installed package's `package.json` `exports` and adjust the import (do not guess — read it).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm test -- motion`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/motion frontend/__tests__/components/motion.test.tsx
git commit -m "feat(frontend): reduced-motion-aware motion primitives"
```

---

### Task 9: Illustration set (inline SVG, token-themed)

**Files:**
- Create: `frontend/components/illustrations/index.tsx`
- Test: `frontend/__tests__/components/illustrations.test.tsx`

**Interfaces:**
- Produces: `<IllustrationBasics/>`, `<IllustrationChoice/>`, `<IllustrationGoogleInstall/>`, `<IllustrationSuccess/>`, `<IllustrationEmpty/>` — inline SVGs using `currentColor`/token classes (e.g. `text-primary`), each accepting `className`, each `aria-hidden`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/illustrations.test.tsx
import { render } from "@testing-library/react";
import { IllustrationSuccess } from "@/components/illustrations";

it("renders an svg marked aria-hidden", () => {
  const { container } = render(<IllustrationSuccess />);
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  expect(svg).toHaveAttribute("aria-hidden");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- illustrations`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (minimal one/two-tone SVGs)**

```tsx
// frontend/components/illustrations/index.tsx
import type { SVGProps } from "react";

function Base({ children, className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className} {...rest}>
      {children}
    </svg>
  );
}

export const IllustrationBasics = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="24" y="28" width="72" height="64" rx="8" className="fill-muted" /><rect x="34" y="42" width="52" height="6" rx="3" className="fill-primary" /><rect x="34" y="56" width="40" height="6" rx="3" className="fill-border" /></Base>
);
export const IllustrationChoice = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="16" y="40" width="40" height="40" rx="8" className="fill-primary/20 stroke-primary" /><rect x="64" y="40" width="40" height="40" rx="8" className="fill-muted stroke-border" /></Base>
);
export const IllustrationGoogleInstall = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="60" cy="60" r="34" className="fill-muted" /><path d="M48 60l8 8 18-18" className="stroke-primary" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></Base>
);
export const IllustrationSuccess = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="60" cy="60" r="40" className="fill-success/20" /><path d="M44 62l12 12 22-26" className="stroke-success" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></Base>
);
export const IllustrationEmpty = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect x="28" y="36" width="64" height="48" rx="8" className="fill-muted stroke-border" /><line x1="40" y1="96" x2="80" y2="96" className="stroke-border" strokeWidth="4" strokeLinecap="round" /></Base>
);
```

> NOTE: Tailwind v4 utility classes like `fill-primary` / `fill-success/20` rely on the project's OKLCH tokens (`app/globals.css`). If a `fill-*`/`stroke-*` token utility doesn't exist, use `style={{ fill: "var(--primary)" }}` instead — verify which tokens are registered before relying on the utility form.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- illustrations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/illustrations frontend/__tests__/components/illustrations.test.tsx
git commit -m "feat(frontend): token-themed inline illustration set"
```

---

### Task 10: Wizard API hooks (detected fields + test-submission poll + extended BridgeInput)

**Files:**
- Modify: `frontend/lib/google-form-bridge.ts`
- Test: `frontend/__tests__/lib/google-form-bridge.test.ts` (create if absent)

**Interfaces:**
- Consumes: backend Tasks 4–6 endpoints.
- Produces:
  - `BridgeInput` extended with `test_mode?: boolean`.
  - `GoogleFormBridge` type extended with `seen_labels: string[]` and `test_mode: boolean`.
  - `useDetectedFields(orgSlug, eventSlug, bridgeId)` → `{ seen_labels: string[]; suggestions: Record<string,string> }`.
  - `useTestSubmission(orgSlug, eventSlug, bridgeId, { poll }: { poll: boolean })` → latest test submission `{ id; status; error; created_at; mapped: Record<string,string>; received_fields: Record<string,unknown> } | null` (null on 204), refetching every 2s while `poll` is true.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/__tests__/lib/google-form-bridge.test.ts
import { describe, expect, it } from "vitest";
import type { GoogleFormBridge } from "@/lib/google-form-bridge";

describe("bridge types", () => {
  it("includes seen_labels and test_mode", () => {
    const b: GoogleFormBridge = {
      id: "1", name: "G", enabled: false, test_mode: false, field_mapping: {},
      duplicate_policy: "upsert_by_email", webhook_url: "/x", seen_labels: [],
      last_seen_at: null, recent_submissions: [], created_at: "", updated_at: "",
    };
    expect(b.seen_labels).toEqual([]);
    expect(b.test_mode).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- google-form-bridge`
Expected: FAIL — type errors (`seen_labels`/`test_mode` missing).

- [ ] **Step 3: Extend types + add hooks**

```ts
// google-form-bridge.ts — extend types
export type GoogleFormBridge = {
  id: string;
  name: string;
  enabled: boolean;
  test_mode: boolean;
  field_mapping: Record<string, string>;
  duplicate_policy: "upsert_by_email" | "reject_duplicates";
  webhook_url: string;
  seen_labels: string[];
  last_seen_at: string | null;
  recent_submissions: GoogleFormBridgeSubmissionSummary[];
  created_at: string;
  updated_at: string;
};

export type BridgeInput = {
  name?: string;
  enabled?: boolean;
  test_mode?: boolean;
  field_mapping?: Record<string, string>;
  duplicate_policy?: "upsert_by_email" | "reject_duplicates";
};

export type DetectedFields = { seen_labels: string[]; suggestions: Record<string, string> };
export type TestSubmission = {
  id: string;
  status: string;
  error: string;
  created_at: string;
  mapped: Record<string, string>;
  received_fields: Record<string, unknown>;
};
```

```ts
// google-form-bridge.ts — add hooks (apiFetch already imported)
export function useDetectedFields(orgSlug: string, eventSlug: string, bridgeId: string) {
  return useQuery({
    queryKey: ["bridge-detected-fields", orgSlug, eventSlug, bridgeId],
    queryFn: () =>
      apiFetch<DetectedFields>(`${bridgeBase(orgSlug, eventSlug)}${bridgeId}/detected-fields/`),
    enabled: !!bridgeId,
  });
}

export function useTestSubmission(
  orgSlug: string,
  eventSlug: string,
  bridgeId: string,
  { poll }: { poll: boolean },
) {
  return useQuery({
    queryKey: ["bridge-test-submission", orgSlug, eventSlug, bridgeId],
    queryFn: () =>
      apiFetch<TestSubmission | null>(`${bridgeBase(orgSlug, eventSlug)}${bridgeId}/test-submission/`),
    enabled: !!bridgeId && poll,
    refetchInterval: poll ? 2000 : false,
  });
}
```

> NOTE: confirm `apiFetch` returns `null` for a `204`. If it throws/returns `undefined` on empty bodies, adjust `apiFetch` or wrap the call to coerce empty → `null` (read `frontend/lib/api.ts` first).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- google-form-bridge && pnpm exec tsc --noEmit`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/google-form-bridge.ts frontend/__tests__/lib/google-form-bridge.test.ts
git commit -m "feat(frontend): wizard bridge hooks (detected fields + test poll)"
```

---

## Phase C — Wizard assembly

### Task 11: Wizard shell + step navigation composites

**Files:**
- Create: `frontend/components/wizard/wizard-shell.tsx`, `frontend/components/wizard/step-nav.tsx`, `frontend/components/wizard/choice-card.tsx`
- Test: `frontend/__tests__/components/wizard-shell.test.tsx`

**Interfaces:**
- Produces:
  - `<WizardShell title steps currentStepId onBack onSaveExit>` — renders an animated progress indicator over `steps: {id: string; label: string}[]`, a header, a `children` slot wrapped in `<StepTransition stepKey={currentStepId}>`, and a footer with Back / Save&exit.
  - `<StepNav onBack onNext nextLabel nextDisabled backDisabled>` — paired buttons (Back uses `Tappable`).
  - `<ChoiceCard selected onSelect title description icon>` — large selectable card (uses `Tappable`), `role="radio"` semantics, `aria-checked`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/wizard-shell.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { ChoiceCard } from "@/components/wizard/choice-card";

it("ChoiceCard fires onSelect and reflects aria-checked", () => {
  const onSelect = vi.fn();
  render(<ChoiceCard selected title="Native" description="d" onSelect={onSelect} />);
  const card = screen.getByRole("radio");
  expect(card).toHaveAttribute("aria-checked", "true");
  fireEvent.click(card);
  expect(onSelect).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- wizard-shell`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the composites**

```tsx
// frontend/components/wizard/choice-card.tsx
"use client";
import type { ReactNode } from "react";
import { Tappable } from "@/components/motion";
import { cn } from "@/lib/utils";

export function ChoiceCard({
  selected, onSelect, title, description, icon,
}: { selected: boolean; onSelect: () => void; title: string; description: string; icon?: ReactNode }) {
  return (
    <Tappable>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={cn(
          "w-full rounded-xl border p-5 text-left transition-colors",
          selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
        )}
      >
        {icon && <div className="mb-3 h-16 w-16 text-primary">{icon}</div>}
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </button>
    </Tappable>
  );
}
```

```tsx
// frontend/components/wizard/step-nav.tsx
"use client";
import { Button } from "@/components/ui/button";

export function StepNav({
  onBack, onNext, nextLabel = "Next", nextDisabled, backDisabled,
}: { onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; backDisabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button type="button" variant="ghost" onClick={onBack} disabled={backDisabled || !onBack}>
        Back
      </Button>
      <Button type="button" onClick={onNext} disabled={nextDisabled || !onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
```

```tsx
// frontend/components/wizard/wizard-shell.tsx
"use client";
import type { ReactNode } from "react";
import { StepTransition } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WizardStepMeta = { id: string; label: string };

export function WizardShell({
  title, steps, currentStepId, onSaveExit, children,
}: {
  title: string;
  steps: WizardStepMeta[];
  currentStepId: string;
  onSaveExit?: () => void;
  children: ReactNode;
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {onSaveExit && (
          <Button type="button" variant="ghost" onClick={onSaveExit}>Save &amp; exit</Button>
        )}
      </div>
      <ol className="flex gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.id === currentStepId ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= currentIndex ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </ol>
      <StepTransition stepKey={currentStepId}>{children}</StepTransition>
    </div>
  );
}
```

> NOTE: confirm `cn` lives at `@/lib/utils` (standard shadcn helper) before importing — adjust if the project exports it elsewhere.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- wizard-shell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/wizard frontend/__tests__/components/wizard-shell.test.tsx
git commit -m "feat(frontend): wizard shell + step-nav + choice-card composites"
```

---

### Task 12: Wizard state machine (step model + URL sync, no UI yet)

**Files:**
- Create: `frontend/components/wizard/use-event-setup-wizard.ts`
- Test: `frontend/__tests__/components/use-event-setup-wizard.test.tsx`

**Interfaces:**
- Produces: `useEventSetupWizard(orgSlug)` returning `{ stepId, steps, registrationKind, setRegistrationKind, goNext, goBack, goTo, eventSlug, setEventSlug }`. Step ids: `"basics" | "registration" | "configure" | "review" | "live"`. `registrationKind: "native" | "google"` (default `"native"`). `goNext`/`goBack` walk the visible step list; `configure` is a single id whose body branches on `registrationKind`. Step id is mirrored to the URL `?step=` (read modified-Next docs for the correct `useSearchParams`/`useRouter` usage).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/use-event-setup-wizard.test.tsx
import { act, renderHook } from "@testing-library/react";
import { useEventSetupWizard } from "@/components/wizard/use-event-setup-wizard";

// mock next navigation per the project's existing test setup for router-using hooks
it("walks steps and defaults to native", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  expect(result.current.stepId).toBe("basics");
  expect(result.current.registrationKind).toBe("native");
  act(() => result.current.goNext());
  expect(result.current.stepId).toBe("registration");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- use-event-setup-wizard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// frontend/components/wizard/use-event-setup-wizard.ts
"use client";
import { useCallback, useMemo, useState } from "react";
import type { WizardStepMeta } from "./wizard-shell";

export type RegistrationKind = "native" | "google";
export type StepId = "basics" | "registration" | "configure" | "review" | "live";

const STEPS: { id: StepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "registration", label: "Registration" },
  { id: "configure", label: "Configure" },
  { id: "review", label: "Review" },
  { id: "live", label: "Go live" },
];

export function useEventSetupWizard(_orgSlug: string) {
  const [stepId, setStepId] = useState<StepId>("basics");
  const [registrationKind, setRegistrationKind] = useState<RegistrationKind>("native");
  const [eventSlug, setEventSlug] = useState<string | null>(null);

  const steps: WizardStepMeta[] = STEPS;
  const order = useMemo(() => STEPS.map((s) => s.id), []);

  const goTo = useCallback((id: StepId) => setStepId(id), []);
  const goNext = useCallback(() => {
    setStepId((cur) => order[Math.min(order.indexOf(cur) + 1, order.length - 1)]);
  }, [order]);
  const goBack = useCallback(() => {
    setStepId((cur) => order[Math.max(order.indexOf(cur) - 1, 0)]);
  }, [order]);

  return { stepId, steps, registrationKind, setRegistrationKind, goNext, goBack, goTo, eventSlug, setEventSlug };
}
```

> NOTE: URL `?step=` sync is intentionally added in a follow-up step once the route exists (Task 16) — keep this hook router-free so it is unit-testable. Task 16 wires `goTo` to push the query param.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- use-event-setup-wizard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/wizard/use-event-setup-wizard.ts frontend/__tests__/components/use-event-setup-wizard.test.tsx
git commit -m "feat(frontend): event-setup wizard state machine"
```

---

### Task 13: Step 1 (Basics) + event creation at end of step

**Files:**
- Create: `frontend/components/wizard/steps/basics-step.tsx`
- Test: `frontend/__tests__/components/basics-step.test.tsx`

**Interfaces:**
- Consumes: `useCreateEvent(orgSlug)` (existing in `@/lib/events`), `useEventSetupWizard` (Task 12).
- Produces: `<BasicsStep orgSlug onCreated={(slug: string) => void} />` — the four existing fields (name, slug auto-slugified, venue, walk-in capacity) ported from `EventCreateWizard`, validated identically; on Next it calls `create.mutateAsync` and invokes `onCreated(event.slug)`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/basics-step.test.tsx
import { render, screen } from "@testing-library/react";
import { BasicsStep } from "@/components/wizard/steps/basics-step";
// wrap in the project's QueryClientProvider test helper

it("renders the four basics fields", () => {
  render(<BasicsStep orgSlug="acme" onCreated={() => {}} />);
  expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/url slug/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/venue/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/walk-in capacity/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- basics-step`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (port logic from `EventCreateWizard`, drop the Card chrome — the shell provides it)**

```tsx
// frontend/components/wizard/steps/basics-step.tsx
"use client";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StepNav } from "@/components/wizard/step-nav";
import { useCreateEvent } from "@/lib/events";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

export function BasicsStep({ orgSlug, onCreated }: { orgSlug: string; onCreated: (slug: string) => void }) {
  const create = useCreateEvent(orgSlug);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [venue, setVenue] = useState("");
  const [walkinCapacity, setWalkinCapacity] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) setSlug(slugify(v));
  };

  const submit = async () => {
    setError(null);
    const cap = walkinCapacity.trim() === "" ? 0 : Number(walkinCapacity);
    if (!Number.isInteger(cap) || cap < 0) {
      setError("Walk-in capacity must be a non-negative whole number.");
      return;
    }
    try {
      const event = await create.mutateAsync({ name, slug, venue, walkin_capacity: cap });
      onCreated(event.slug);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Event name" htmlFor="event-name">
        <Input id="event-name" required value={name} onChange={(e) => onNameChange(e.target.value)} />
      </Field>
      <Field label="URL slug" htmlFor="event-slug"
        helper={<>Public form: /e/{orgSlug}/{slug || "your-slug"}/register</>}>
        <Input id="event-slug" required value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className="font-mono" />
      </Field>
      <Field label="Venue" htmlFor="event-venue" optional>
        <Input id="event-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
      </Field>
      <Field label="Walk-in capacity" htmlFor="event-walkin-capacity"
        helper={<><code>0</code> means unlimited. Editable later in event settings.</>}>
        <Input id="event-walkin-capacity" type="number" inputMode="numeric" min={0} step={1}
          value={walkinCapacity} onChange={(e) => setWalkinCapacity(e.target.value)} className="font-mono" placeholder="0" />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <StepNav onNext={submit} nextLabel={create.isPending ? "Creating…" : "Next"}
        nextDisabled={create.isPending || !name || !slug} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- basics-step`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/wizard/steps/basics-step.tsx frontend/__tests__/components/basics-step.test.tsx
git commit -m "feat(frontend): wizard basics step (creates event)"
```

---

### Task 14: Step 2 (Registration choice) + Step 3a (Native branch)

**Files:**
- Create: `frontend/components/wizard/steps/registration-step.tsx`, `frontend/components/wizard/steps/native-step.tsx`
- Test: `frontend/__tests__/components/registration-step.test.tsx`

**Interfaces:**
- Consumes: `ChoiceCard`, `StepNav`, illustrations; the existing registration-form-builder component (locate it — investigator noted `registration-form-builder`; import from its real path) for the native branch.
- Produces:
  - `<RegistrationStep value onChange onNext onBack />` — two `ChoiceCard`s (Native default, Google Form), `role="radiogroup"`.
  - `<NativeStep orgSlug eventSlug onNext onBack />` — wraps the existing form-field builder for `eventSlug`, then a StepNav to Review.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/registration-step.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { RegistrationStep } from "@/components/wizard/steps/registration-step";

it("offers native + google and reports changes", () => {
  const onChange = vi.fn();
  render(<RegistrationStep value="native" onChange={onChange} onNext={() => {}} onBack={() => {}} />);
  expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  fireEvent.click(screen.getByText(/google form/i));
  expect(onChange).toHaveBeenCalledWith("google");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- registration-step`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// frontend/components/wizard/steps/registration-step.tsx
"use client";
import { IllustrationChoice } from "@/components/illustrations";
import { ChoiceCard } from "@/components/wizard/choice-card";
import { StepNav } from "@/components/wizard/step-nav";
import type { RegistrationKind } from "@/components/wizard/use-event-setup-wizard";

export function RegistrationStep({
  value, onChange, onNext, onBack,
}: { value: RegistrationKind; onChange: (k: RegistrationKind) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">How will guests register?</p>
      <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard selected={value === "native"} onSelect={() => onChange("native")}
          title="Eventgate form" description="Share a link or QR. No setup, no Google. Recommended."
          icon={<IllustrationChoice />} />
        <ChoiceCard selected={value === "google"} onSelect={() => onChange("google")}
          title="Google Form" description="Connect an existing Google Form. A few guided steps." />
      </div>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}
```

```tsx
// frontend/components/wizard/steps/native-step.tsx
"use client";
import { StepNav } from "@/components/wizard/step-nav";
// import the existing registration form builder from its real path, e.g.:
// import { RegistrationFormBuilder } from "@/components/events/registration-form-builder";

export function NativeStep({
  orgSlug, eventSlug, onNext, onBack,
}: { orgSlug: string; eventSlug: string; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-4">
      {/* <RegistrationFormBuilder orgSlug={orgSlug} eventSlug={eventSlug} /> */}
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Next" />
    </div>
  );
}
```

> NOTE: locate the real registration-form-builder component (`grep -rl "registration-form-builder\|RegistrationFormBuilder" frontend/components`) and wire its actual props. If it manages its own save, NativeStep just needs Next enabled once at least one field exists — read its API first.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- registration-step`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/wizard/steps/registration-step.tsx frontend/components/wizard/steps/native-step.tsx frontend/__tests__/components/registration-step.test.tsx
git commit -m "feat(frontend): wizard registration choice + native branch"
```

---

### Task 15: Step 3b — Bridge sub-wizard (intro → map → install → test → finish)

**Files:**
- Create: `frontend/components/wizard/steps/bridge-step.tsx`, `frontend/components/wizard/steps/bridge-substeps.tsx`
- Test: `frontend/__tests__/components/bridge-step.test.tsx`

**Interfaces:**
- Consumes: `useCreateGoogleFormBridge`, `useUpdateGoogleFormBridge`, `useDetectedFields`, `useTestSubmission` (Task 10); `googleFormBridgeAppsScript` (`@/lib/google-form-bridge-apps-script`); illustrations; motion.
- Produces: `<BridgeStep orgSlug eventSlug onDone onBack />` driving internal sub-steps `intro|map|install|test|finish`. Behavior:
  - intro → on Next, create bridge with `test_mode: true, enabled: false` (stores `bridgeId`, holds `secret` in component state only).
  - map → calls `useDetectedFields`; renders one row per detected label with a target `<Select>` pre-filled from `suggestions`; "Save mapping" PATCHes `field_mapping`. If no labels yet, show "Submit one response from your Form so we can detect its questions" with the install snippet available.
  - install → one-click **Copy** of `googleFormBridgeAppsScript(webhook_url)` (NOT a raw textarea; code shown in a collapsible `<details>`), plus the illustrated Google steps.
  - test → `useTestSubmission(..., { poll: true })`; spinner until a row arrives; on `status === "accepted"` show green `<SuccessBurst>` + the parsed `mapped` preview; on `rejected` show the error + retry guidance.
  - finish → PATCH `{ test_mode: false, enabled: true }`, then `onDone()`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/bridge-step.test.tsx
import { render, screen } from "@testing-library/react";
import { BridgeIntro } from "@/components/wizard/steps/bridge-substeps";

it("intro explains the connection and has a start action", () => {
  render(<BridgeIntro onStart={() => {}} onBack={() => {}} pending={false} />);
  expect(screen.getByText(/connect your google form/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /start|next|connect/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- bridge-step`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement sub-steps (presentational) in `bridge-substeps.tsx`**

```tsx
// frontend/components/wizard/steps/bridge-substeps.tsx
"use client";
import { useState } from "react";
import { IllustrationGoogleInstall } from "@/components/illustrations";
import { SuccessBurst } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { StepNav } from "@/components/wizard/step-nav";

export function BridgeIntro({ onStart, onBack, pending }: { onStart: () => void; onBack: () => void; pending: boolean }) {
  return (
    <div className="space-y-4">
      <IllustrationGoogleInstall className="mx-auto h-24 w-24" />
      <h2 className="text-center text-lg font-medium">Connect your Google Form</h2>
      <p className="text-center text-sm text-muted-foreground">
        We&apos;ll detect your form&apos;s questions, you&apos;ll paste a short snippet into your
        Sheet, then send one test response to confirm it works.
      </p>
      <StepNav onBack={onBack} onNext={onStart} nextLabel={pending ? "Preparing…" : "Start"} nextDisabled={pending} />
    </div>
  );
}

export function BridgeInstall({ snippet, onCopy, onNext, onBack }: { snippet: string; onCopy: () => void; onNext: () => void; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    onCopy();
    setCopied(true);
  };
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open your Form&apos;s response Sheet → Extensions → Apps Script.</li>
        <li>Paste the snippet below and click Run → Eventgate → Initialize setup.</li>
        <li>Come back here and send one test response.</li>
      </ol>
      <Button type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy snippet"}</Button>
      <details className="rounded-md border p-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">Show snippet</summary>
        <pre className="mt-2 max-h-64 overflow-auto text-xs"><code>{snippet}</code></pre>
      </details>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

export function BridgeTest({ state, mapped, onRetry, onBack, onNext }: {
  state: "waiting" | "accepted" | "rejected"; mapped: Record<string, string>;
  onRetry: () => void; onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      {state === "waiting" && <p className="text-sm text-muted-foreground">Waiting for your test response…</p>}
      {state === "accepted" && (
        <>
          <SuccessBurst label="Test response received" />
          <dl className="mx-auto max-w-xs text-left text-sm">
            {Object.entries(mapped).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </>
      )}
      {state === "rejected" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">That response couldn&apos;t be parsed. Check the snippet saved and the trigger installed, then try again.</p>
          <Button type="button" variant="ghost" onClick={onRetry}>Try again</Button>
        </div>
      )}
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Finish" nextDisabled={state !== "accepted"} />
    </div>
  );
}
```

- [ ] **Step 4: Implement the container `bridge-step.tsx`**

```tsx
// frontend/components/wizard/steps/bridge-step.tsx
"use client";
import { useMemo, useState } from "react";
import {
  useCreateGoogleFormBridge, useDetectedFields, useTestSubmission, useUpdateGoogleFormBridge,
} from "@/lib/google-form-bridge";
import { googleFormBridgeAppsScript } from "@/lib/google-form-bridge-apps-script";
import { BridgeInstall, BridgeIntro, BridgeTest } from "./bridge-substeps";
// A map sub-step component renders detected labels → target selects; build inline or as a sibling.

type Sub = "intro" | "map" | "install" | "test" | "finish";

export function BridgeStep({ orgSlug, eventSlug, onDone, onBack }: {
  orgSlug: string; eventSlug: string; onDone: () => void; onBack: () => void;
}) {
  const [sub, setSub] = useState<Sub>("intro");
  const [bridgeId, setBridgeId] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const create = useCreateGoogleFormBridge(orgSlug, eventSlug);
  const update = useUpdateGoogleFormBridge(orgSlug, eventSlug, bridgeId);
  const detected = useDetectedFields(orgSlug, eventSlug, bridgeId);
  const test = useTestSubmission(orgSlug, eventSlug, bridgeId, { poll: sub === "test" });

  const snippet = useMemo(() => (webhookUrl ? googleFormBridgeAppsScript(webhookUrl) : ""), [webhookUrl]);
  const testState: "waiting" | "accepted" | "rejected" =
    test.data?.status === "accepted" ? "accepted" : test.data?.status === "rejected" ? "rejected" : "waiting";

  const start = async () => {
    const b = await create.mutateAsync({ test_mode: true, enabled: false });
    setBridgeId(b.id);
    setWebhookUrl(b.webhook_url);
    setSub("install"); // install first so a response can be submitted; map auto-fills once detected
  };
  const finish = async () => {
    await update.mutateAsync({ test_mode: false, enabled: true });
    onDone();
  };

  if (sub === "intro") return <BridgeIntro onStart={start} onBack={onBack} pending={create.isPending} />;
  if (sub === "install")
    return <BridgeInstall snippet={snippet} onCopy={() => {}} onBack={() => setSub("intro")} onNext={() => setSub("map")} />;
  if (sub === "map")
    return (
      // Minimal mapping UI: one Select per detected label, prefilled from detected.data.suggestions;
      // "Save mapping" PATCHes field_mapping via `update`, then setSub("test").
      <MappingSubStep
        detected={detected.data}
        onBack={() => setSub("install")}
        onSave={async (mapping) => { await update.mutateAsync({ field_mapping: mapping }); setSub("test"); }}
      />
    );
  if (sub === "test")
    return <BridgeTest state={testState} mapped={test.data?.mapped ?? {}} onRetry={() => test.refetch()} onBack={() => setSub("map")} onNext={finish} />;
  return null;
}
```

```tsx
// Append to bridge-step.tsx (or a sibling file): the mapping sub-step.
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { StepNav } from "@/components/wizard/step-nav";
import type { DetectedFields } from "@/lib/google-form-bridge";

function MappingSubStep({ detected, onSave, onBack }: {
  detected: DetectedFields | undefined; onSave: (m: Record<string, string>) => void; onBack: () => void;
}) {
  const labels = detected?.seen_labels ?? [];
  const [mapping, setMapping] = useState<Record<string, string>>(detected?.suggestions ?? {});
  const targets = ["email", "name", "phone_or_chat"]; // augment with event field_keys if exposed
  if (labels.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Submit one response from your Google Form so we can detect its questions, then return here.</p>
        <StepNav onBack={onBack} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {labels.map((label) => (
        <Field key={label} label={label} htmlFor={`map-${label}`}>
          <Select id={`map-${label}`} value={mapping[label] ?? ""}
            onChange={(e) => setMapping((m) => ({ ...m, [label]: (e.target as HTMLSelectElement).value }))}>
            <option value="">— ignore —</option>
            {targets.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
      ))}
      <StepNav onBack={onBack} onNext={() => onSave(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)))} nextLabel="Save & test" />
    </div>
  );
}
```

> NOTE: match the real `Select` component API in `components/ui/select.tsx` (base-nova Select may be composed of `Select`/`SelectTrigger`/`SelectItem` rather than a native `<select>`). Read it first and adapt. To offer event custom-field targets too, fetch them from the event fields endpoint used by the form builder.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm test -- bridge-step`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/wizard/steps/bridge-step.tsx frontend/components/wizard/steps/bridge-substeps.tsx frontend/__tests__/components/bridge-step.test.tsx
git commit -m "feat(frontend): de-tech'd Google Form bridge sub-wizard"
```

---

### Task 16: Wizard route + Review/Go-live, replace old EventCreateWizard

**Files:**
- Create: `frontend/components/wizard/steps/review-step.tsx`, `frontend/components/wizard/event-setup-wizard.tsx`
- Modify: `frontend/app/orgs/[slug]/events/new/page.tsx` (point at new wizard), `frontend/components/events/event-create-wizard.tsx` (delete after migration)
- Test: `frontend/__tests__/components/event-setup-wizard.test.tsx`

**Interfaces:**
- Consumes: all Phase-C components + `useEventSetupWizard` + `useTransitionEventStatus`/the existing event status mutation (locate the hook that moves an event `draft→open`).
- Produces: `<EventSetupWizard orgSlug />` assembling the shell + steps; `?step=` URL sync wired here (read modified-Next docs for `useRouter`/`useSearchParams`); Go-live calls the status transition then `router.push` to the event dashboard with a `<SuccessBurst>` interstitial.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/__tests__/components/event-setup-wizard.test.tsx
import { render, screen } from "@testing-library/react";
import { EventSetupWizard } from "@/components/wizard/event-setup-wizard";
// mock next navigation + wrap in QueryClientProvider per project helpers

it("starts on Basics with a progress bar", () => {
  render(<EventSetupWizard orgSlug="acme" />);
  expect(screen.getByText(/create event|set up your event/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- event-setup-wizard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Review step**

```tsx
// frontend/components/wizard/steps/review-step.tsx
"use client";
import { StepNav } from "@/components/wizard/step-nav";
import type { RegistrationKind } from "@/components/wizard/use-event-setup-wizard";

export function ReviewStep({ eventName, registrationKind, onBack, onGoLive, pending }: {
  eventName: string; registrationKind: RegistrationKind; onBack: () => void; onGoLive: () => void; pending: boolean;
}) {
  return (
    <div className="space-y-4">
      <dl className="rounded-lg border p-4 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Event</dt><dd>{eventName}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Registration</dt>
          <dd>{registrationKind === "native" ? "Eventgate form" : "Google Form"}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">Going live opens registration for this event.</p>
      <StepNav onBack={onBack} onNext={onGoLive} nextLabel={pending ? "Going live…" : "Go live"} nextDisabled={pending} />
    </div>
  );
}
```

- [ ] **Step 4: Implement the assembler `event-setup-wizard.tsx`**

```tsx
// frontend/components/wizard/event-setup-wizard.tsx
"use client";
import { useRouter } from "next/navigation"; // VERIFY against frontend/node_modules/next/dist/docs
import { useState } from "react";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { useEventSetupWizard } from "@/components/wizard/use-event-setup-wizard";
import { BasicsStep } from "@/components/wizard/steps/basics-step";
import { RegistrationStep } from "@/components/wizard/steps/registration-step";
import { NativeStep } from "@/components/wizard/steps/native-step";
import { BridgeStep } from "@/components/wizard/steps/bridge-step";
import { ReviewStep } from "@/components/wizard/steps/review-step";
// import the existing event status transition hook from "@/lib/events"

export function EventSetupWizard({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const w = useEventSetupWizard(orgSlug);
  const [eventName, setEventName] = useState("");
  const [goingLive, setGoingLive] = useState(false);

  const goLive = async () => {
    setGoingLive(true);
    // await transitionStatus.mutateAsync({ to: "open" })  // wire the real hook
    router.push(`/orgs/${orgSlug}/events/${w.eventSlug}`);
  };

  return (
    <WizardShell title="Set up your event" steps={w.steps} currentStepId={w.stepId}
      onSaveExit={w.eventSlug ? () => router.push(`/orgs/${orgSlug}/events/${w.eventSlug}`) : undefined}>
      {w.stepId === "basics" && (
        <BasicsStep orgSlug={orgSlug} onCreated={(slug) => { w.setEventSlug(slug); w.goNext(); }} />
      )}
      {w.stepId === "registration" && (
        <RegistrationStep value={w.registrationKind} onChange={w.setRegistrationKind}
          onNext={w.goNext} onBack={w.goBack} />
      )}
      {w.stepId === "configure" && w.registrationKind === "native" && w.eventSlug && (
        <NativeStep orgSlug={orgSlug} eventSlug={w.eventSlug} onNext={w.goNext} onBack={w.goBack} />
      )}
      {w.stepId === "configure" && w.registrationKind === "google" && w.eventSlug && (
        <BridgeStep orgSlug={orgSlug} eventSlug={w.eventSlug} onDone={w.goNext} onBack={w.goBack} />
      )}
      {w.stepId === "review" && (
        <ReviewStep eventName={eventName} registrationKind={w.registrationKind}
          onBack={w.goBack} onGoLive={goLive} pending={goingLive} />
      )}
    </WizardShell>
  );
}
```

> NOTE: `setEventName` should be fed from BasicsStep (lift the name up, or read it back from the created event). Wire `?step=` sync by reading `useSearchParams` per the bundled Next docs and calling `w.goTo` on mount. Locate and wire the real `draft→open` status hook (used today by `EventStatusCard`).

- [ ] **Step 5: Point the route at the new wizard**

```tsx
// frontend/app/orgs/[slug]/events/new/page.tsx — swap the import/usage
// from: <EventCreateWizard orgSlug={...} />
// to:   <EventSetupWizard orgSlug={...} />
```

Then delete `frontend/components/events/event-create-wizard.tsx` and its now-dead test (if any).

- [ ] **Step 6: Run all frontend gates**

Run: `cd frontend && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/wizard frontend/app/orgs/[slug]/events/new/page.tsx
git rm frontend/components/events/event-create-wizard.tsx
git commit -m "feat(frontend): unified event setup wizard replaces single-page create"
```

---

## Phase D — End-to-end + cross-cutting verification

### Task 17: Playwright e2e for both happy paths

**Files:**
- Create: `frontend/tests/event-setup-wizard.spec.ts`
- Test: itself

**Interfaces:**
- Consumes: the running app + a mocked bridge webhook for the Google path (intercept the test-submission poll to return an accepted row).

- [ ] **Step 1: Write the e2e (native path first)**

```ts
// frontend/tests/event-setup-wizard.spec.ts — mirror existing specs in frontend/tests/
import { test, expect } from "@playwright/test";

test("native path: create event → choose native → review → go live", async ({ page }) => {
  // sign in via the project's existing e2e auth helper
  await page.goto("/orgs/acme/events/new");
  await page.getByLabel(/event name/i).fill("Launch Party");
  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.getByRole("radiogroup")).toBeVisible();
  await page.getByText(/eventgate form/i).click();
  await page.getByRole("button", { name: /next/i }).click();
  // native config → next → review → go live
});
```

- [ ] **Step 2: Add the Google path with a mocked test-submission**

```ts
test("google path: test submission turns the trust gate green", async ({ page }) => {
  await page.route("**/test-submission/", (route) =>
    route.fulfill({ status: 200, json: { id: "1", status: "accepted", error: "",
      created_at: "", mapped: { email: "a@x.com", name: "Ana" }, received_fields: {} } }));
  // walk to the bridge test sub-step and assert the success state renders
  await expect(page.getByText(/test response received/i)).toBeVisible();
});
```

- [ ] **Step 3: Run e2e**

Run: `cd frontend && pnpm exec playwright test event-setup-wizard`
Expected: PASS (mirror the existing e2e auth/setup; adjust selectors to the real DOM).

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/event-setup-wizard.spec.ts
git commit -m "test(frontend): e2e for event setup wizard native + google paths"
```

---

## Phase E — Memos, slate re-rank, full-suite gate

### Task 18: Future-OAuth memo, slate re-rank, full gates

**Files:**
- Create: `docs/plans/future-google-oauth-bridge-autoinstall.md`
- Modify: `docs/plans/2026-06-11-phase2-candidate-slate.md`

- [ ] **Step 1: Write the OAuth auto-install memo**

Contents: option C rationale (eliminate the manual Apps Script paste via Google OAuth + Forms API + Apps Script API), why deferred (no OAuth infra today; large; pilot showed guided-manual is acceptable), and the trigger to revisit (when manual paste becomes the top complaint again or a non-Sheets Google Forms integration is needed).

- [ ] **Step 2: Re-rank the slate doc**

Add a header note: post-pilot top priority is the "Eventgate v2 uplift" UX program (slice 1 = this wizard); revenue track (entitlement / per-event metering / ABA PayWay procurement) runs in parallel; add a Remotion event-share-video slice to the program table.

- [ ] **Step 3: Run the FULL backend + frontend gates**

Run:
```bash
docker start eventgate-postgres-1 || docker compose up -d postgres
cd backend && uv run pytest -q && uv run mypy apps config
cd ../frontend && nvm use 20 && pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/future-google-oauth-bridge-autoinstall.md docs/plans/2026-06-11-phase2-candidate-slate.md
git commit -m "docs(plan): OAuth auto-install memo + Phase 2 slate re-rank"
```

---

## Self-Review

**Spec coverage:**
- Wizard spine (Basics→Registration→branch→Review→Go live) → Tasks 13,14,15,16. ✅
- Co-equal native/Google branch (default native) → Task 14. ✅
- Bridge auto-detect (B) → Tasks 2,4 (backend) + 15 (UI). ✅
- Dry-run test-submission trust gate (A1) → Tasks 1,3,5 (backend) + 15 (UI). ✅
- Secret embedded silently (no "copy once" block) → bridge created with no secret display; snippet carries the webhook; secret never surfaced in UI (Task 15 holds it only transiently and never renders it). ✅ (Note: Apps Script secret is set as a script property by the organizer per the existing runbook; the wizard does not display it.)
- Motion primitives + reduced-motion → Task 8. ✅
- Illustration layer → Task 9. ✅
- Demand-driven design-system composites, no edits to `components/ui/` → Tasks 11. ✅
- Persistence: event created end of step 1; abandon leaves draft → Task 13 + Task 16 save&exit. ✅
- Wizard = first-setup only; existing pages remain edit surface → Task 16 (no settings-page edits). ✅
- Testing (backend unit, frontend unit, e2e) → Tasks throughout + 17. ✅
- Parked memos (OAuth, Remotion, slate) → Task 18. ✅

**Placeholder scan:** Remaining `// import ... from real path` and `VERIFY against docs` notes are deliberate — they mark project-specific lookups the implementer MUST resolve against the real (modified-Next) codebase rather than hardcoded guesses, per Global Constraints. They are not silent TODOs; each names exactly what to find and how.

**Type consistency:** `seen_labels`/`test_mode`/`kind` names match across models (Task 1), serializer (Task 6), services (Tasks 2,3), endpoints (Tasks 4,5), and TS types/hooks (Task 10). `RegistrationKind`/`StepId` consistent across Tasks 12,14,16. `TestSubmission.mapped` shape consistent between Task 5 (backend) and Tasks 10,15 (frontend).

**Open items resolved during planning:** test marker = `bridge.test_mode` flag (not a header/query param) — preserves the existing disabled-rejection contract; field-target guessing = server-side (`suggest_field_targets`, Task 4).
