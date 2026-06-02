# Eventgate infra ops — Fly self-hosted Redis (broker + result + cache).
#
# All targets take ENV (defaults to staging):
#   make redis-provision ENV=prod
#
# Full first-time setup for an env:
#   make upstash-destroy   ENV=<env>   # free the name (destructive; pre-pilot only)
#   make redis-provision   ENV=<env>   # create app+volume+secret, deploy, cut backend over
#   make redis-status      ENV=<env>   # confirm the machine is up
#
# See docs/runbook-redis-migration.md for the full narrative + rollback notes.

ENV ?= staging
REDIS_APP   = eventgate-redis-$(ENV)
BACKEND_APP = eventgate-backend-$(ENV)

.PHONY: help redis-provision redis-deploy redis-status redis-logs upstash-destroy

help: ## List available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

redis-provision: ## Provision/sync Redis for ENV and cut backend over (rotates password)
	./scripts/provision-redis.sh $(ENV)

redis-deploy: ## Redeploy Redis config only after editing fly.redis-$(ENV).toml (no password change)
	fly deploy --config fly.redis-$(ENV).toml --app $(REDIS_APP)

redis-status: ## Show the Redis app's machines/status
	fly status --app $(REDIS_APP)

redis-logs: ## Tail the Redis app's logs
	fly logs --app $(REDIS_APP)

upstash-destroy: ## Destroy the OLD Upstash instance for ENV to free its name (NEVER touches quizbank)
	@echo "Destroying Upstash resource '$(REDIS_APP)'. This does NOT touch quizbanktest-backend-redis."
	fly redis destroy $(REDIS_APP)
