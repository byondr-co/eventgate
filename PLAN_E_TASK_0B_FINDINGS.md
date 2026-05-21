# Plan E Task 0b — Vercel Auto-Deploy Findings

**Investigated:** 2026-05-21

## Diagnosis

The Vercel GitHub integration is **not broken**. Every push to `main` during Plan D *did* trigger an automatic production deployment — the Vercel REST API shows one `source=git` deployment per `main` commit (`56e2044`, `8b78068`, `fbb67e4`, `f20b594`, `fa24abb`, `226fa80`). However, **every single git-triggered build failed** with the same error, so no production URL ever updated until the developer manually ran `pnpm dlx vercel@latest --prod --yes` from inside `frontend/`, which produced a successful `source=cli` deployment.

Concretely, the latest git build (commit `226fa80`) failed with:

```
errorCode:    NEXT_NO_VERSION
errorMessage: No Next.js version detected. Make sure your package.json has "next"
              in either "dependencies" or "devDependencies". Also check your Root
              Directory setting matches the directory of your package.json file.
```

## Root Cause

The Vercel project `frontend` (`prj_8G6ZKLwXRmuG2mNhyVmHp4GWZ5U9`, scope `vineidev-4891s-projects` / `team_Hwu3uHA3hnwhK5mYgR4pmALG`) had **`rootDirectory: null`** (i.e. repo root) in its project settings. But the Next.js app actually lives in the `frontend/` subdirectory of the monorepo — the repo root holds only `backend/`, `frontend/`, `docs/`, `docker-compose.yml`, and `README.md`. There is no top-level `package.json`. Git-triggered builds therefore ran `next build` against the repo root, couldn't find `next` in any dependency manifest, and aborted at the build step.

The manual `vercel --prod --yes` workaround masked the problem because the developer ran it from inside `frontend/`, where `.vercel/project.json` already exists and Vercel's CLI uploads that directory as the deployment context — bypassing the project's `rootDirectory` setting entirely.

The git integration itself (GitHub App install, `productionBranch: main`, `gitProviderOptions.createDeployments: enabled`, credential `cred_bca1d0c1365b8cd1450ca38f65d1395f445610da`) is healthy.

## Fix Steps

**Already applied during this investigation** via the Vercel REST API:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rootDirectory":"frontend"}' \
  "https://api.vercel.com/v9/projects/prj_8G6ZKLwXRmuG2mNhyVmHp4GWZ5U9?teamId=team_Hwu3uHA3hnwhK5mYgR4pmALG"
```

Confirmed post-patch: `rootDirectory: frontend`, `framework: nextjs`, `link.productionBranch: main`.

Equivalent dashboard path (for reference / if the CLI fix is ever reverted): **Vercel → frontend project → Settings → General → Root Directory → set to `frontend` → Save**.

No `vercel.json` or repo change is needed. Build/install commands remain on auto-detect; Vercel will now pick up `frontend/pnpm-lock.yaml` and `frontend/package.json` correctly.

## Verification Plan

1. Push an empty commit on a follow-up branch (not from this worktree):
   ```bash
   git commit --allow-empty -m "chore: trigger vercel auto-deploy verify"
   git push origin main
   ```
2. Within ~30 seconds, a new deployment should appear with `source=git`, `target=production`, `meta.githubCommitRef=main`. Check via:
   ```bash
   pnpm dlx vercel@latest list frontend --scope vineidev-4891s-projects | head
   ```
   or
   ```bash
   curl -sS -H "Authorization: Bearer $TOKEN" \
     "https://api.vercel.com/v6/deployments?projectId=prj_8G6ZKLwXRmuG2mNhyVmHp4GWZ5U9&teamId=team_Hwu3uHA3hnwhK5mYgR4pmALG&limit=3"
   ```
3. The deployment should reach `state=READY` (not `ERROR`), and its URL should serve the latest frontend build.
4. If it fails again, fetch the new `errorCode`/`errorMessage` from the v13 deployments endpoint — this time it will be a real build error, not `NEXT_NO_VERSION`.
