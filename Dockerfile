# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install server deps (root)
COPY package*.json ./
RUN npm ci

# Copy source (server + scripts + dashboard)
COPY server.js ./server.js
COPY scripts/ ./scripts
COPY dashboard/ ./dashboard

# Build frontend
WORKDIR /app/dashboard
RUN npm ci && npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# For healthcheck (use curl; alpine doesn't include it by default)
RUN apk add --no-cache curl

# Copy only what's needed at runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/dashboard/dist ./dashboard/dist

ENV NODE_ENV=production
EXPOSE 10000

# Healthcheck (calls your /health endpoint)
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD curl -fsS "http://localhost:${PORT:-10000}/health" || exit 1

# Start: run seeder (no-op if table already has rows), then boot the server
CMD ["sh", "-c", "node scripts/ensure-seed.js && node server.js"]
