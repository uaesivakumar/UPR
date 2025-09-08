# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app

# Install root deps (server)
COPY package*.json ./
RUN npm ci

# Copy the rest of the repo
COPY . .

# Build the dashboard (Vite)
WORKDIR /app/dashboard
RUN npm ci && npm run build

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app

# Copy only what we need for runtime
COPY --from=base /app /app

ENV NODE_ENV=production
EXPOSE 10000

# Render will pass PORT; server.js uses process.env.PORT || 10000
CMD ["node", "server.js"]
