#!/usr/bin/env bash
#
# Provision (or re-sync) the self-hosted Redis for one environment and cut the
# backend over to it. Codifies the validated runbook (docs/runbook-redis-migration.md).
#
#   Usage: scripts/provision-redis.sh <staging|prod>
#
# Idempotent — safe to re-run:
#   - app + volume are created only if missing (so re-runs never duplicate them).
#   - the Redis password is REGENERATED every run and applied to BOTH the Redis app
#     and the backend in the same invocation. Fly secrets are write-only (you can't
#     read REDIS_PASSWORD back), so rotating on every run is how we keep the two
#     sides guaranteed in sync. A re-run therefore briefly reconnects clients with
#     the new password — fine at pilot scale.
#
# PREREQUISITE for a fresh env: the app name reuses the old Upstash resource name,
# so destroy that first to free the name:  make upstash-destroy ENV=<env>
# (or: fly redis destroy eventgate-redis-<env>). Never touch quizbanktest.
set -euo pipefail

ENV="${1:-}"
case "$ENV" in
  staging|prod) ;;
  *) echo "usage: $(basename "$0") <staging|prod>" >&2; exit 2 ;;
esac

REGION="sin"
REDIS_APP="eventgate-redis-${ENV}"
BACKEND_APP="eventgate-backend-${ENV}"
CONFIG="fly.redis-${ENV}.toml"
HOST="${REDIS_APP}.internal"

cd "$(dirname "$0")/.."   # run from backend/ regardless of caller's cwd

require() { command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 1; }; }
require fly
require openssl
[ -f "$CONFIG" ] || { echo "config not found: $CONFIG (run from the branch worktree)" >&2; exit 1; }

echo "==> Provisioning $REDIS_APP and cutting over $BACKEND_APP"

# 1. App (create only if it doesn't exist yet)
if fly status --app "$REDIS_APP" >/dev/null 2>&1; then
  echo "  ✓ app $REDIS_APP already exists"
else
  echo "  → creating app $REDIS_APP"
  fly apps create "$REDIS_APP" --org personal
fi

# 2. Volume (fly volumes create is NOT idempotent — guard against duplicates)
if fly volumes list --app "$REDIS_APP" 2>/dev/null | grep -qw redis_data; then
  echo "  ✓ volume redis_data already exists"
else
  echo "  → creating volume redis_data in $REGION"
  fly volumes create redis_data --app "$REDIS_APP" --region "$REGION" --size 1 --yes
fi

# 3. Password — generate fresh and set on the Redis app BEFORE deploy, so the
#    machine boots with --requirepass populated (an empty value crash-loops Redis).
REDIS_PW="$(openssl rand -hex 32)"
echo "  → setting REDIS_PASSWORD on $REDIS_APP"
fly secrets set --app "$REDIS_APP" REDIS_PASSWORD="$REDIS_PW" >/dev/null

# 4. Deploy Redis
echo "  → deploying $REDIS_APP"
fly deploy --config "$CONFIG" --app "$REDIS_APP"

# 5. Cut the backend over (logical DBs: /0 cache, /1 broker, /2 result backend)
echo "  → pointing $BACKEND_APP at $HOST"
fly secrets set --app "$BACKEND_APP" \
  REDIS_URL="redis://default:${REDIS_PW}@${HOST}:6379/0" \
  CELERY_BROKER_URL="redis://default:${REDIS_PW}@${HOST}:6379/1" \
  CELERY_RESULT_BACKEND="redis://default:${REDIS_PW}@${HOST}:6379/2" >/dev/null

echo "==> Done. Verify the worker connected to the new broker:"
echo "    fly logs --app $BACKEND_APP | grep -i 'celery@\\|Connected to redis\\|ready'"
