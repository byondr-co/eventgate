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
