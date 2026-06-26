# Eventgate

*Pronounced **EVENT-gate**. Khmer: **អ៊ីវ៉ិនហ្គេត**.*

SaaS for fast, paperless event entrance — Southeast Asia first.

Monorepo:
- `backend/` — Django 5 + DRF API
- `frontend/` — Next.js 14 dashboard + PWA scanner

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

## Repos & deploy

- Backend: Fly.io (Singapore region)
- Frontend: Vercel
- Postgres: Neon (Singapore)
- Redis: Upstash (Singapore)
- Errors: Sentry

## Docs

- `docs/brief.md` — SaaS direction brief (the strategic foundation for all plans)
- `docs/plans/` — sprint-by-sprint implementation plans (Plan A, B, …)
