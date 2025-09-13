# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install server (root) deps — production deps only for smaller runtime
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev --no-audit --no-fund

# Copy server sources (now modular)
COPY server.js ./server.js
COPY routes ./routes
COPY utils ./utils
COPY scripts ./scripts

# ---- Frontend deps & build ----
WORKDIR /app/dashboard
# Copy dashboard manifests first for cache efficiency
COPY dashboard/package*.json ./
RUN npm ci || npm install --no-audit --no-fund

# Copy the rest of the dashboard source and build
COPY dashboard/ ./
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# For healthcheck
RUN apk add --no-cache curl

# Copy server runtime bits (node_modules from build includes pg + deps)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/routes ./routes
COPY --from=build /app/utils ./utils
COPY --from=build /app/scripts ./scripts

# Copy built frontend only
COPY --from=build /app/dashboard/dist ./dashboard/dist

ENV NODE_ENV=production
EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD curl -fsS "http://localhost:${PORT:-10000}/health" || exit 1

# Start: run seed script if present, but NEVER fail the container if seeding is a no-op
CMD ["sh", "-lc", "node scripts/ensure-seed.js || true; node server.js"]
