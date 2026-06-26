# Dockerized Full Dev Stack (Model B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the whole local dev stack (Postgres, Redis, Django, Next.js) in
Docker with bind-mounted source + live reload, so no host toolchain is needed
and multiple projects coexist on offset ports.

**Architecture:** Add a `dev` build target to `backend/Dockerfile` and a new
`frontend/Dockerfile`; define `backend` + `frontend` services in the base
`docker-compose.yml`; add an auto-loaded `docker-compose.override.yml` with dev
bind-mounts, reload commands, and dependency-masking volumes. Services talk over
the compose network by name; only the two web ports are published (env-driven).
Spec: `docs/superpowers/specs/2026-06-26-docker-dev-stack-design.md`.

**Tech Stack:** Docker Compose, `python:3.12-slim` + uv (backend),
`node:20-slim` + pnpm (frontend), Django runserver autoreload, Next.js `next dev`.

## Global Constraints

- **Commit style:** single-line Conventional Commits, **NO `Co-Authored-By`** trailer.
- **This is infra config**, not application TDD: each task's "test" is a build
  or a run-the-stack acceptance check with an exact command + expected output
  (plus one in-container `pytest` acceptance). There is no red/green unit cycle.
- **Free host ports for any `docker compose up`:** other projects may hold
  5432/6379/8000/3000. Before bringing the stack up, create a git-ignored
  repo-root `.env` with offset ports, e.g.:
  `POSTGRES_PORT=5442`, `REDIS_PORT=6389`, `BACKEND_PORT=8001`, `FRONTEND_PORT=3001`.
  The app reaches infra by **service name** regardless of these (they only set
  the host-published ports).
- **Frontend→backend wiring:** the frontend container's
  `NEXT_PUBLIC_API_BASE_URL` MUST be `http://backend:8000` (service name). The
  Next.js `/api` rewrite (`next.config.ts`) and SSR fetches read it and run
  server-side **inside** the frontend container, where `localhost` is the
  frontend itself. Do NOT edit `next.config.ts` — it already reads this var.
- **Don't break Model A (host-run):** keep infra host ports published and keep
  `backend/.env`'s `localhost` URLs. Compose env overrides them only inside
  containers.
- **Backend dev image installs dev deps** (`uv sync --frozen`, NOT `--no-dev`) —
  pytest/ruff/mypy must be present for in-container tests.

---

## Task 1: Add a `dev` target to `backend/Dockerfile`

**Files:**
- Modify: `backend/Dockerfile` (append a `dev` stage; leave `builder`/`runtime` untouched)

**Interfaces:**
- Produces: a build target `dev` that contains all deps (incl. dev) and runs as
  the venv Python; source is supplied at runtime via bind mount; the run command
  is set by compose (Task 4).

- [ ] **Step 1: Append the `dev` stage**

Add to the END of `backend/Dockerfile` (after the existing `runtime` stage):

```dockerfile

# --- Local development image -------------------------------------------------
# All dependencies INCLUDING dev (pytest/ruff/mypy) so the stack can run tests
# in-container. Source is bind-mounted at runtime (see docker-compose.override.yml),
# and the run command (wait-for-db -> migrate -> runserver) is set in compose.
FROM base AS dev
COPY --from=ghcr.io/astral-sh/uv:0.4 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen
ENV PATH="/app/.venv/bin:${PATH}"
ENV DJANGO_SETTINGS_MODULE=config.settings.dev
EXPOSE 8000
```

- [ ] **Step 2: Build the dev target**

Run: `docker build --target dev -t eventgate-backend-dev ./backend`
Expected: build succeeds (ends `naming to …eventgate-backend-dev`).

- [ ] **Step 3: Verify dev deps are present**

Run: `docker run --rm eventgate-backend-dev python -m pytest --version`
Expected: prints a `pytest 8.x` version line (proves dev deps installed, not just prod).

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile
git commit -m "build(backend): add dev image target with dev dependencies"
```

---

## Task 2: Create `frontend/Dockerfile` (dev target)

**Files:**
- Create: `frontend/Dockerfile`

**Interfaces:**
- Produces: a build target `dev` with pnpm + installed `node_modules`; source is
  bind-mounted at runtime; the run command (`pnpm dev`) is set by compose.

- [ ] **Step 1: Create the file**

```dockerfile
# syntax=docker/dockerfile:1.7
# Local development image for the Next.js frontend. node_modules is installed
# into the image; at runtime the source is bind-mounted and node_modules is
# preserved via an anonymous volume (see docker-compose.override.yml). The run
# command (`pnpm dev`) is set in compose.
FROM node:20-slim AS dev
WORKDIR /app
# Pin pnpm 9 to match CI (.github/workflows/frontend.yml uses
# pnpm/action-setup version: 9) and the lockfile (lockfileVersion 9.0). Do NOT
# use `corepack enable` alone — on node:20 it resolves pnpm@latest (11.x), which
# requires Node >= 22.13 and fails the install.
RUN npm install -g pnpm@9
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
EXPOSE 3000
```

> If `frontend/Dockerfile` already exists on disk from a prior attempt,
> overwrite it with exactly this content.

- [ ] **Step 2: Build the dev target**

Run: `docker build --target dev -t eventgate-frontend-dev ./frontend`
Expected: build succeeds; pnpm install completes without lockfile errors.

- [ ] **Step 3: Verify pnpm + deps**

Run: `docker run --rm eventgate-frontend-dev sh -c "pnpm --version && test -d node_modules && echo node_modules-present"`
Expected: prints a pnpm version then `node_modules-present`.

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile
git commit -m "build(frontend): add dev image (node 20 + pnpm)"
```

---

## Task 3: Add `backend` + `frontend` services to base `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml` (add two services; infra services unchanged)

**Interfaces:**
- Consumes: Task 1 `dev` target, Task 2 `frontend/Dockerfile` dev target.
- Produces: `backend` (published `${BACKEND_PORT:-8000}:8000`, healthcheck on
  `/api/health/live/`) and `frontend` (published `${FRONTEND_PORT:-3000}:3000`)
  services reachable on the compose network by name.

- [ ] **Step 1: Add the services**

Insert these two services into `docker-compose.yml` under `services:` (after
`redis:`, before the top-level `volumes:` key):

```yaml
  backend:
    build:
      context: ./backend
      target: dev
    env_file:
      - ./backend/.env
    environment:
      DJANGO_SETTINGS_MODULE: config.settings.dev
      # Override backend/.env's localhost URLs with compose service names.
      DATABASE_URL: postgres://eventgate:eventgate@postgres:5432/eventgate
      POSTGRES_HOST: postgres
      POSTGRES_PORT: "5432"
      REDIS_URL: redis://redis:6379/0
      CELERY_BROKER_URL: redis://redis:6379/1
      CELERY_RESULT_BACKEND: redis://redis:6379/2
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/api/health/live/"]
      interval: 5s
      timeout: 3s
      retries: 12

  frontend:
    build:
      context: ./frontend
      target: dev
    environment:
      # Service name, NOT localhost: the Next rewrite + SSR run inside this
      # container. The browser reaches the backend through this frontend's
      # /api rewrite, so backend need not be published for the app to work.
      NEXT_PUBLIC_API_BASE_URL: http://backend:8000
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    depends_on:
      - backend
```

- [ ] **Step 2: Validate compose parses (base only, ignore the override for now)**

Run: `docker compose -f docker-compose.yml config >/dev/null && echo OK`
Expected: prints `OK` (no YAML / schema errors).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(dev): add backend + frontend services to compose"
```

---

## Task 4: Add `docker-compose.override.yml` (dev bind-mounts + reload)

**Files:**
- Create: `docker-compose.override.yml`

**Interfaces:**
- Consumes: the `backend`/`frontend` services from Task 3 (override merges by
  service name).
- Produces: live source bind-mounts, dependency-masking volumes, and dev run
  commands so host edits hot-reload in the containers.

- [ ] **Step 1: Create the override file**

```yaml
# Auto-loaded by `docker compose` on top of docker-compose.yml. Holds the dev-only
# wiring: bind-mount source for live reload, mask installed deps with anonymous
# volumes, and set the reload run commands.
services:
  backend:
    volumes:
      - ./backend:/app
      - /app/.venv          # keep the image's venv; don't let the bind mount hide it
    command:
      - sh
      - -c
      - |
        until python -c "import socket; socket.create_connection(('postgres', 5432), 2)" 2>/dev/null; do
          echo "waiting for postgres..."; sleep 1;
        done
        python manage.py migrate --noinput
        python manage.py runserver 0.0.0.0:8000

  frontend:
    volumes:
      - ./frontend:/app
      - /app/node_modules   # keep the image's node_modules; don't let the bind mount hide it
    environment:
      # Reliable file-watching over macOS bind mounts.
      CHOKIDAR_USEPOLLING: "true"
      WATCHPACK_POLLING: "true"
    command: ["pnpm", "dev"]
```

- [ ] **Step 2: Validate the merged config**

Run: `docker compose config >/dev/null && echo OK`
Expected: prints `OK` (base + override merge cleanly; `docker compose` auto-loads the override).

- [ ] **Step 3: Confirm the merge applied the dev command + mounts**

Run: `docker compose config | grep -E "runserver|pnpm dev|/app/.venv|/app/node_modules"`
Expected: shows the runserver command, `pnpm dev`, and both anonymous-volume mounts.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.override.yml
git commit -m "feat(dev): bind-mount + reload override for backend/frontend"
```

---

## Task 5: Env examples — add `BACKEND_PORT` / `FRONTEND_PORT` + document overrides

**Files:**
- Modify: `.env.example` (repo root)
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: documented `BACKEND_PORT`/`FRONTEND_PORT` knobs and a note that
  compose overrides `backend/.env`'s localhost URLs inside containers.

- [ ] **Step 1: Extend the repo-root `.env.example`**

Replace the port block in `.env.example` so it reads:

```dotenv
COMPOSE_PROJECT_NAME=eventgate
POSTGRES_PORT=5432
REDIS_PORT=6379
# Published web ports (browser-facing). Offset per project to run several at once.
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

- [ ] **Step 2: Add a note to `backend/.env.example`**

Insert this comment block at the top of `backend/.env.example` (after the first
`# Copy to .env for local dev` line):

```dotenv
# NOTE: under the Dockerized dev stack (docker compose up), the backend container
# OVERRIDES the DATABASE_URL / REDIS_URL / CELERY_* values below with compose
# service names (postgres:5432, redis:6379). The localhost values here are used
# only when you run the backend directly on the host (uv run runserver).
```

- [ ] **Step 3: Verify the example is still valid dotenv (no parse surprises)**

Run: `grep -E "^(BACKEND_PORT|FRONTEND_PORT)=" .env.example`
Expected: both lines present.

- [ ] **Step 4: Commit**

```bash
git add .env.example backend/.env.example
git commit -m "docs(dev): document BACKEND_PORT/FRONTEND_PORT + compose env overrides"
```

---

## Task 6: README quick start + full-stack acceptance

**Files:**
- Modify: `README.md` (rewrite the "Quick start (local dev)" section)

**Interfaces:**
- Produces: docs describing `docker compose up` as the default, with the
  host-run path kept as a fallback; plus a verified end-to-end stack run.

- [ ] **Step 1: Rewrite the "Quick start (local dev)" section**

Replace the existing quick-start block in `README.md` with:

````markdown
## Quick start (local dev)

The whole stack runs in Docker — no host Python/Node needed.

```bash
cp .env.example .env                 # set ports (offset if another project uses 5432/6379/8000/3000)
cp backend/.env.example backend/.env
docker compose up --build            # postgres + redis + backend + frontend
```

Visit http://localhost:3000 — the home page shows "Backend: ok". Editing files
under `backend/` or `frontend/` hot-reloads the running containers (no rebuild).

Run tests in-container:

```bash
docker compose run --rm backend uv run pytest        # backend
docker compose run --rm frontend pnpm test           # frontend
```

Adding a dependency (pyproject.toml / package.json) needs a rebuild:
`docker compose build backend` (or `frontend`).

### Host-run fallback (no app containers)

Prefer running the app on the host? Start only infra and run natively:

```bash
docker compose up -d postgres redis
cd backend && uv sync && uv run manage.py migrate && uv run manage.py runserver
cd frontend && pnpm install && pnpm dev
```
````

- [ ] **Step 2: Acceptance — bring the full stack up (offset ports to avoid collisions)**

Run:
```bash
printf 'COMPOSE_PROJECT_NAME=eventgate\nPOSTGRES_PORT=5442\nREDIS_PORT=6389\nBACKEND_PORT=8001\nFRONTEND_PORT=3001\n' > .env
cp backend/.env.example backend/.env
docker compose up -d --build
```
Then wait for health and check the backend + frontend:
```bash
for i in $(seq 1 40); do curl -fsS http://localhost:8001/api/health/live/ && break; sleep 2; done
curl -fsS -o /dev/null -w "frontend %{http_code}\n" http://localhost:3001/
```
Expected: backend prints `{"status": "ok", "version": "0.1.0"}`; frontend prints `frontend 200`.

- [ ] **Step 3: Acceptance — live reload + in-container tests**

**Settings gotcha (pin pytest to test settings):** the backend container sets
`DJANGO_SETTINGS_MODULE=config.settings.dev`, and pytest-django lets that env var
override the pytest-ini test settings — so in-container `pytest` would run under
DEV (non-eager Celery, real Redis) and `test_celery_ping_task` would fail. Fix by
pinning test settings in `backend/pyproject.toml` `[tool.pytest.ini_options]`
(the `--ds` flag outranks the env var; host + CI unaffected — same settings as before):
```toml
addopts = "-ra --strict-markers --strict-config --ds=config.settings.test"
```

Run:
```bash
docker compose logs --since=1m backend | grep -i "watching for file changes" && echo reload-on
docker compose run --rm backend uv run pytest tests/test_healthcheck.py -q
```
Expected: `reload-on` printed (Django autoreload active); pytest shows `4 passed`
(eager Celery via the pinned test settings; connects to the `postgres` service).

- [ ] **Step 4: Tear down**

Run: `docker compose down`
Expected: all four containers + the network removed.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(dev): document Dockerized dev stack + host-run fallback"
```

---

## Self-Review

**Spec coverage:**
- Backend dev image (spec §Services/backend) → Task 1.
- Frontend dev image (spec §Services/frontend) → Task 2.
- Base compose services + service-name networking + published web ports
  (spec §Architecture) → Task 3.
- Override bind-mounts/reload/dep-masking/poll (spec §override + footguns) → Task 4.
- Env knobs + override documentation (spec §Env) → Task 5.
- README rewrite + acceptance incl. in-container tests + wait-for-db/migrate
  (spec §Tests, §startup, §acceptance) → Task 6.
- `NEXT_PUBLIC_API_BASE_URL=http://backend:8000` correction (spec §Services/frontend) → Task 3 Step 1.
- Host-run fallback preserved (infra ports published, backend/.env localhost) →
  Tasks 3/5/6.

**Placeholder scan:** none — every file step shows full content; acceptance uses
exact commands + expected output.

**Type/name consistency:** `dev` build target used identically in Dockerfile
(Task 1), frontend Dockerfile (Task 2), and both compose `build.target` blocks
(Task 3). Env var names (`BACKEND_PORT`, `FRONTEND_PORT`, `NEXT_PUBLIC_API_BASE_URL`,
`POSTGRES_HOST`) consistent across Tasks 3–6. Service names (`postgres`, `redis`,
`backend`, `frontend`) consistent.

## Out of scope
Cross-project template, prod-frontend containerization, CI changes, removing
infra host-port publishing (all per spec §Out of scope).
