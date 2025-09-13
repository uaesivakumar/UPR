# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build
WORKDIR /app

# Server deps first for better cache
COPY package*.json ./
RUN npm ci

# Server source
COPY server.js ./
COPY routes ./routes
COPY utils ./utils
COPY scripts ./scripts

# ---------- DASHBOARD BUILD ----------
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
# prefer ci; fall back if lock changed
RUN npm ci || npm install --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

# ---------- RUNTIME STAGE ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# Optional tools you had
RUN apk add --no-cache curl

# Server runtime files
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/routes ./routes
COPY --from=build /app/utils ./utils
COPY --from=build /app/scripts ./scripts

# Built dashboard
COPY --from=build /app/dashboard/dist ./dashboard/dist

EXPOSE 10000
CMD ["node", "server.js"]
