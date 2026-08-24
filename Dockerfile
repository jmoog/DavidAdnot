# syntax=docker/dockerfile:1.7
# ────────────────────────────────────────────────────────────────────────
# Astro 6 + adapter Node (standalone) — Dockerfile multi-stage
# adnot-couvreur.fr — déployé via Coolify
# ────────────────────────────────────────────────────────────────────────

# ── Stage 1 : build ─────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Cache layer optimisé : package*.json d'abord
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Variables Turnstile passées par Coolify en "build variable" (--build-arg).
ARG TURNSTILE_SITE_KEY
ENV TURNSTILE_SITE_KEY=$TURNSTILE_SITE_KEY

COPY . .
RUN npm run build

# ── Stage 2 : runtime ───────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# /contact/ (prerender=false) et /api/devis lisent process.env au runtime :
# on refige les clés Turnstile dans l'env du conteneur.
ARG TURNSTILE_SITE_KEY
ARG TURNSTILE_SECRET_KEY
ENV TURNSTILE_SITE_KEY=$TURNSTILE_SITE_KEY
ENV TURNSTILE_SECRET_KEY=$TURNSTILE_SECRET_KEY

# Dépendances de production uniquement
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

# Utilisateur non-root
RUN addgroup -S astro && adduser -S astro -G astro && \
    chown -R astro:astro /app
USER astro

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
