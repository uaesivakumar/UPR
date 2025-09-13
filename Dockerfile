FROM node:20-alpine AS build
WORKDIR /app

# server deps
COPY package*.json ./
RUN npm ci

# copy all sources
COPY . .

# build frontend
WORKDIR /app/dashboard
RUN npm ci && npm run build

# ----- runtime -----
FROM node:20-alpine
WORKDIR /app

# copy everything that the server needs, including built dist
COPY --from=build /app /app

ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server/index.js"]

# Healthcheck (optional but recommended)
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://localhost:${PORT:-10000}/health || exit 1

# Start: run seeder (no-op if table already has rows), then boot the server
CMD ["sh", "-c", "node scripts/ensure-seed.js && node server.js"]

# Assuming you already copy package.json and then the app
COPY scripts/ scripts/
COPY db/ db/
COPY server.js server.js
COPY dashboard/ dashboard/

