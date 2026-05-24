## Purpose of this document
This document is to keep track of the improvement and findings of the project. This document is also to keep track of the features that are not working, not implemented, and the features that are working but need improvement. This document is also to keep track of the bugs and issues that are found during the development and testing phase. This document is also to keep track of the feedback and suggestions from the users and stakeholders.

Important note: Everything in this docuument should not be autonomously implemented without the approval of the project manager and the team lead.

## What is not working
- Invite member is not works

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
