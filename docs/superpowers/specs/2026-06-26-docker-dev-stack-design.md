# Dockerized Full Dev Stack (Model B) — Design

**Goal:** Run the entire local dev stack — Postgres, Redis, Django backend, and
the Next.js frontend — in Docker, so a project needs **no host toolchain**
(Python/Node/uv/pnpm) and several projects can run side by side without
host-port or version collisions. Source is bind-mounted with live reload, so
editing files on the host updates the running containers without rebuilds.

## Motivation

The user runs multiple projects simultaneously. Today eventgate is "Model A":
only Postgres + Redis are containerized; Django, Celery, pytest, and the
frontend run on the **host** (`uv run …`, `pnpm dev`), connecting to
`localhost:5432/6379`. That forces per-project Python/Node version management on
the host and makes host ports load-bearing. Model B containerizes the app too:
each project is `docker compose up`, the host stays clean, and the only
published host ports are the web UIs (offset per project).

PR #86 already made the infra **host ports env-driven** and made
`config/settings/test.py` read `POSTGRES_HOST`/`POSTGRES_PORT`. This design
builds directly on that.

## Decisions locked during brainstorming

1. **Scope:** full stack — backend **and** frontend containerized (plus the
   existing postgres/redis). eventgate only (not a cross-project template).
2. **Compose layout:** base `docker-compose.yml` (all 4 services) +
   auto-loaded `docker-compose.override.yml` (dev bind-mounts, reload, dev
   commands, published web ports). `docker compose up` = full dev stack.
3. **Backend dev image:** add a **`dev` target** to the existing multi-stage
   `backend/Dockerfile` (DRY, shares the `base` stage) — not a separate
   `Dockerfile.dev`.
4. **Migrations:** the backend dev container **auto-runs `migrate`** on startup
   (after waiting for Postgres), then starts the reload server.
5. **Host-run stays possible:** infra host ports remain published (env-driven),
   so `uv run runserver` / `pnpm dev` on the host still work as a fallback.

## Architecture

Four services on the compose default network; they reach each other by
**service name** (`postgres:5432`, `redis:6379`, `backend:8000`). Only the two
web ports are published to the host for the browser.

```
host browser ──▶ localhost:${FRONTEND_PORT:-3000}  → frontend container (next dev)
host browser ──▶ localhost:${BACKEND_PORT:-8000}    → backend container (runserver)
frontend (SSR) ─▶ backend:8000        (server-side, by service name)
backend ───────▶ postgres:5432, redis:6379  (by service name)
postgres/redis host ports still published (env-driven) — host-run fallback only
```

### `docker-compose.yml` (base) — adds two services
- **backend:** `build: { context: ./backend, target: dev }`, `env_file:
  ./backend/.env`, environment overrides:
  - `DJANGO_SETTINGS_MODULE=config.settings.dev`
  - `POSTGRES_HOST=postgres`, `POSTGRES_PORT=5432`
  - `DATABASE_URL=postgres://eventgate:eventgate@postgres:5432/eventgate`
  - `REDIS_URL=redis://redis:6379/0`,
    `CELERY_BROKER_URL=redis://redis:6379/1`,
    `CELERY_RESULT_BACKEND=redis://redis:6379/2`
  - `ports: ["${BACKEND_PORT:-8000}:8000"]`
  - `depends_on: { postgres: { condition: service_healthy }, redis: {
    condition: service_healthy } }`
- **frontend:** `build: { context: ./frontend, target: dev }`,
  - `environment: NEXT_PUBLIC_API_BASE_URL=http://backend:8000` — **service
    name, not localhost.** The Next.js `/api` rewrite (`next.config.ts`) and SSR
    fetches both read this var and run **server-side inside the frontend
    container**, where `localhost` is the frontend itself. The browser only ever
    talks to the frontend (`localhost:${FRONTEND_PORT}`) and reaches the backend
    through that rewrite, so the backend host port need not be published for the
    app to work (it stays published only for direct curl/admin/docs).
  - `ports: ["${FRONTEND_PORT:-3000}:3000"]`
  - `depends_on: [backend]`

These env overrides take precedence over `backend/.env` (which keeps its
`localhost` values for the host-run fallback).

### `docker-compose.override.yml` (auto-loaded, dev wiring)
- **backend:** bind-mount `./backend:/app`; anonymous volume `/app/.venv` (so
  the host dir never shadows the container's installed venv); command =
  wait-for-postgres → `python manage.py migrate` → `python manage.py runserver
  0.0.0.0:8000` (Django autoreload).
- **frontend:** bind-mount `./frontend:/app`; anonymous volume
  `/app/node_modules`; `environment: CHOKIDAR_USEPOLLING=true` +
  `WATCHPACK_POLLING=true` (reliable file-watch over macOS bind mounts);
  command = `pnpm dev`.

### `backend/Dockerfile` — new `dev` target
A `dev` stage off `base` that installs **all** dependencies (dev included):
```dockerfile
FROM base AS dev
COPY --from=ghcr.io/astral-sh/uv:0.4 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen            # NOT --no-dev: dev deps (pytest/ruff/mypy) needed
ENV PATH="/app/.venv/bin:${PATH}"
# Source arrives via bind mount at runtime; entrypoint waits for DB, migrates,
# then runs the reload server (command set in compose).
```
The existing `builder`/`runtime` (prod) stages are unchanged.

### `frontend/Dockerfile` (new) — `dev` target
```dockerfile
FROM node:20-slim AS dev
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# source via bind mount at runtime; command `pnpm dev` set in compose
EXPOSE 3000
```
(A prod target can be added later if we ever containerize the prod frontend;
out of scope here — prod frontend is on Vercel.)

### Wait-for-DB + migrate
`depends_on: condition: service_healthy` orders startup against the existing
healthchecks; the backend command additionally runs `migrate` before
`runserver`, so `docker compose up` yields a migrated, ready stack. A tiny
inline shell loop (`until pg_isready -h postgres …; do sleep 1; done`) guards
the brief window between "container healthy" and "accepting connections".

## Tests in-container

- Backend: `docker compose run --rm backend uv run pytest` — runs against the
  `postgres` service (`POSTGRES_HOST=postgres`, already honored by `test.py`
  from #86). Eager Celery + LocMem cache mean Redis isn't needed for tests.
- Frontend: `docker compose run --rm frontend pnpm test` (Vitest) and
  `… pnpm exec playwright test` for e2e (Playwright browsers must be present in
  the frontend dev image — add the Playwright install to the dev target if e2e
  is run in-container; otherwise keep e2e on CI).
- **CI is unchanged** — it uses its own service containers and a host runner.

## Env / .env

- Root `.env.example` gains `BACKEND_PORT=8000` and `FRONTEND_PORT=3000`
  alongside `POSTGRES_PORT`/`REDIS_PORT`. Offset all four per project.
- `backend/.env` keeps `localhost` URLs (host-run fallback); compose env
  overrides them with service-name URLs inside containers. Documented in
  `backend/.env.example`.
- `README.md` "Quick start" is rewritten: `docker compose up` (Model B default),
  with the host-run path kept as a documented fallback.

## Footguns explicitly handled

- **Dependency masking:** anonymous volumes for `/app/.venv` (backend) and
  `/app/node_modules` (frontend) so the bind mount doesn't hide installed deps.
- **File-watch on macOS bind mounts:** polling env vars for the frontend; Django
  autoreload is stat-based and works, but document `runserver --nopin`/polling
  if reload misses events.
- **Browser vs server API base:** browser calls use the published
  `localhost:${BACKEND_PORT}`; any SSR/server-side calls use `backend:8000`.
- **New dependency added:** still requires a rebuild (`docker compose build
  backend|frontend`) or an in-container install — bind mount only live-syncs
  source, not installed packages. Documented in the README.

## Testing the change (acceptance)

1. `cp .env.example .env` (+ `backend/.env`), `docker compose up` → all four
   services healthy.
2. `localhost:8000/api/health/live/` → 200; `localhost:3000` → home shows
   "Backend: ok".
3. Edit a backend `.py` → server autoreloads; edit a frontend file → HMR
   updates the browser. No rebuild.
4. `docker compose run --rm backend uv run pytest` → suite green.
5. Bring a second project up with offset ports → both stacks run; no collision.

## Out of scope

- A reusable cross-project template/generator (the user's longer-term idea) —
  this spec is eventgate-specific; the pattern is copyable by hand.
- Containerizing the **prod** frontend (stays on Vercel).
- Changing CI.
- Removing the infra host-port publishing (kept as host-run fallback).
