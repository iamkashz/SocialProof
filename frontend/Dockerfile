# Cloud Run runtime for the TanStack Start SSR frontend.
#
# Multi-stage: builder installs full deps + runs `vite build`, then a
# lean runtime stage carries only production node_modules + the built
# assets + the tiny Node adapter (server-node.mjs) that wraps
# TanStack's fetch handler into an HTTP server Cloud Run can talk to.

FROM node:22-slim AS builder
WORKDIR /app

# Manifests first so the install layer caches when only source changes.
# `npm ci` is strictly faster than `npm install` and enforces lockfile.
COPY package.json package-lock.json* ./

RUN npm ci --no-audit --no-fund

COPY . .

# Vite build → dist/{client,server}. The full dist/ directory is what
# the runtime stage needs.
RUN npm run build


FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Production-only deps for the runtime. Skips devDependencies (Vite,
# eslint, etc.) so the image stays small.
COPY package.json package-lock.json* ./

RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY server-node.mjs ./

# Cloud Run injects PORT; the adapter reads it. ADK_API_URL is set at
# deploy time via --update-env-vars=ADK_API_URL=<backend Cloud Run URL>.
EXPOSE 8080

CMD ["node", "server-node.mjs"]
