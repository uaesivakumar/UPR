# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build
WORKDIR /app

# Root (server) install — use install (not ci) because we just rewrote lock cleanly
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy server + scripts
COPY server.js ./server.js
COPY scripts/ ./scripts

# ---- Frontend deps & build ----
WORKDIR /app/dashboard
# Copy dashboard manifests first for cache efficiency
COPY dashboard/package*.json ./

# Try ci (fast/reproducible); fall back to install if lock mismatch happens
RUN npm ci || npm install --no-audit --no-fund

# Copy the rest of the dashboard source and build
COPY dashboard/ ./
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# For healthcheck
RUN apk add --no-cache curl

# Copy server runtime bits
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/scripts ./scripts

# Copy built frontend only
COPY --from=build /app/dashboard/dist ./dashboard/dist

ENV NODE_ENV=production
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD curl -fsS "http://localhost:${PORT:-10000}/health" || exit 1

# Start: auto-seed (no-op if table already has rows), then boot server
CMD ["sh", "-c", "node scripts/ensure-seed.js && node server.js"]
