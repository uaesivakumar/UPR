# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install server deps
COPY package*.json ./
RUN npm ci

# Copy server + scripts first
COPY server.js ./server.js
COPY scripts/ ./scripts

# Copy frontend package.json + lockfile separately (to leverage Docker cache)
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci

# Now copy the rest of the dashboard src
COPY dashboard/ ./ 

# Build frontend
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl

# Copy server essentials
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

CMD ["sh", "-c", "node scripts/ensure-seed.js && node server.js"]

# Build frontend (verbose logging to pinpoint issues)
RUN npm ci && npm run build -- --logLevel debug
