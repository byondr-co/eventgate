# Eventgate

SaaS for fast, paperless event entrance — Southeast Asia first.

Monorepo:
- `backend/` — Django 5 + DRF API
- `frontend/` — Next.js 14 dashboard + PWA scanner

## Quick start (local dev)

```bash
docker compose up -d              # Postgres + Redis
cd backend && uv sync && uv run manage.py migrate && uv run manage.py runserver
cd frontend && pnpm install && pnpm dev
```

Visit http://localhost:3000 — you should see "Backend: ok" on the home page.

## Repos & deploy

- Backend: Fly.io (Singapore region)
- Frontend: Vercel
- Postgres: Neon (Singapore)
- Redis: Upstash (Singapore)
- Errors: Sentry

## Plans

Active implementation plans live in `/Users/vinei/Projects/Paperless-Pre-check-in/docs/superpowers/plans/`.
