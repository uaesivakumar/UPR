# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install server deps (root)
COPY package*.json ./
RUN npm ci

# Copy server + scripts
COPY server.js ./server.js
COPY scripts/ ./scripts

# ---- Frontend deps & build ----
WORKDIR /app/dashboard
# copy only dashboard manifests first (for layer caching)
COPY dashboard/package*.json ./

# Use npm ci when lockfile is good, otherwise fall back to npm install
RUN npm ci || npm install --no-audit --no-fund

# now copy the rest of the dashboard source
COPY dashboard/ ./
# build with more logs if needed (uncomment next line if you want debug logs)
# RUN npm run build -- --logLevel debug
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# healthcheck tool
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

# healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD curl -fsS "http://localhost:${PORT:-10000}/health" || exit 1

# start: auto-seed (no-op if table has rows), then boot server
CMD ["sh", "-c", "node scripts/ensure-seed.js && node server.js"]
