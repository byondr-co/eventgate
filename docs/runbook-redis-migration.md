# Runbook — migrate eventgate off Upstash to self-hosted Redis

**Date:** 2026-06-02

**Why:** Upstash bills per command. The always-on Celery worker + beat in both
environments generated tens of millions of idle polling commands/month under
per-command pricing. The Fly "Spend by Product" breakdown:

| Upstash instance | Monthly |
|---|---|
| `eventgate-redis-staging` | **$60.27** |
| `eventgate-redis-prod` | $19.69 |
| `quizbanktest-backend-redis` | $1.94 — **different project, DO NOT TOUCH** |

**Goal:** move the entire eventgate project (staging + prod) off Upstash onto
flat-cost self-hosted Redis Machines (~$2/mo each, regardless of command volume).

## Changes in this branch

- **Code:** task results no longer stored (`CELERY_TASK_IGNORE_RESULT=True` in
  `backend/config/settings/base.py`) — nothing reads `AsyncResult`, so they were
  pure waste.
- **Process configs:** both `fly.toml` (staging) and `fly.prod.toml` run
  app + worker + beat, with the worker quieted via
  `--without-gossip --without-mingle --without-heartbeat`. Staging mirrors prod.
- **New Redis apps:** `backend/fly.redis-staging.toml` and
  `backend/fly.redis-prod.toml` define private, password-protected Redis Machines.
  They **reuse the old Upstash names** (`eventgate-redis-staging`,
  `eventgate-redis-prod`), so the Upstash instances must be destroyed first to free
  those names (step 0 below). Acceptable because Redis is not yet in use (pre-pilot),
  so the brief no-broker window during provisioning is fine.

Real Redis supports multiple logical DBs, so the existing connection scheme works:
`/0` = Django cache, `/1` = Celery broker, `/2` = result backend (Upstash's
single-DB limit was also a latent risk — gone now).

---

## Do this once per environment

Run from `backend/`. Substitute `<env>` = `staging` or `prod`; the Redis app is
`eventgate-redis-<env>` and the backend app is `eventgate-backend-<env>`.

### TL;DR — the automated path

Steps 0–2 below are codified in `backend/scripts/provision-redis.sh` (wrapped by
the `backend/Makefile`). From `backend/`:

```bash
make upstash-destroy ENV=<env>    # step 0 — frees the name (destructive; pre-pilot only)
make redis-provision ENV=<env>    # steps 1-2 — create app+volume+secret, deploy, cut backend over
make redis-status    ENV=<env>    # confirm the machine is up
# then push the branch so CI deploys the backend process configs (step 3)
```

`redis-provision` generates a fresh password each run and applies it to both the
Redis app and the backend in the same invocation (Fly secrets are write-only, so
rotating keeps them in sync). The manual steps below are the same thing, broken
out for reference / debugging.

### 0. Destroy the Upstash instance to free the name

The new Fly app reuses the Upstash name, so the Upstash resource must go first.
This is safe pre-pilot — there is no live traffic, so the no-broker gap until
step 1 finishes is acceptable. **Do NOT touch `quizbanktest-backend-redis`** — it
belongs to another project.

```bash
flyctl redis destroy eventgate-redis-<env>
```

### 1. Provision the Redis Machine

```bash
flyctl apps create eventgate-redis-<env> --org personal
flyctl volumes create redis_data --app eventgate-redis-<env> --region sin --size 1

# Generate + set the password (alphanumeric so the unquoted shell expansion in the
# start command is safe). SAVE THE VALUE — needed for the backend secrets below.
REDIS_PW=$(openssl rand -hex 32)
echo "eventgate-redis-<env> REDIS_PASSWORD=$REDIS_PW"
flyctl secrets set --app eventgate-redis-<env> REDIS_PASSWORD="$REDIS_PW"

flyctl deploy --config fly.redis-<env>.toml --app eventgate-redis-<env>
flyctl status --app eventgate-redis-<env>
```

**Liveness** — run `redis-cli` on the Redis Machine itself (the redis image ships
it; the backend's Python image does NOT):

```bash
flyctl ssh console --app eventgate-redis-<env> -C "redis-cli -a $REDIS_PW PING"   # -> PONG
```

**Private-network reachability from the backend** — the backend has no
`redis-cli`, but it has `redis-py`. Open a shell and run a one-liner (interactive
avoids nested-quote issues):

```bash
flyctl ssh console --app eventgate-backend-<env>
# then, inside the machine (paste the real password):
python -c "import redis; print(redis.from_url('redis://default:<REDIS_PW>@eventgate-redis-<env>.internal:6379/0').ping())"   # -> True
```

### 2. Cut the backend over

```bash
flyctl secrets set --app eventgate-backend-<env> \
  REDIS_URL="redis://default:$REDIS_PW@eventgate-redis-<env>.internal:6379/0" \
  CELERY_BROKER_URL="redis://default:$REDIS_PW@eventgate-redis-<env>.internal:6379/1" \
  CELERY_RESULT_BACKEND="redis://default:$REDIS_PW@eventgate-redis-<env>.internal:6379/2"
```

Setting secrets triggers a rolling restart. Confirm the worker connected to the
new broker (not Upstash) and smoke-test an async path (magic-link or QR email):

```bash
flyctl logs --app eventgate-backend-<env> | grep -i "celery@\|Connected to redis\|ready"
```

### 3. Deploy the process-config changes

Push this branch to `main` (CI deploys both staging and prod). After deploy,
confirm staging now has worker + beat Machines again and both are on the new
broker.

Once both envs are healthy, verify the bill: the eventgate Upstash lines drop to
$0 next cycle (the instances were already destroyed in step 0); the new cost is
two `shared-cpu-1x` Machines (~$2/mo each).

---

## Notes

- **No Upstash rollback:** the Upstash instances are destroyed up front (step 0)
  to free the names, so there is no rolling back to Upstash. This is the
  deliberate tradeoff for reusing the bare names — chosen because Redis isn't live
  yet. If something goes wrong, re-run steps 1-2 (the self-hosted Redis is fully
  reproducible from `fly.redis-<env>.toml`).
- **Redis app changes** deploy manually (`flyctl deploy --config fly.redis-<env>.toml`);
  intentionally NOT in CI.
- **Capacity:** `noeviction` + 200mb cap means writes error if memory fills. Won't
  happen at pilot scale; if it grows, bump VM memory + `--maxmemory` in the
  `fly.redis-<env>.toml`.
- **Security:** Redis is private-only (Fly 6PN, no public service) and
  password-authenticated. Each env has its own password and its own instance —
  don't cross-wire staging and prod.
```
