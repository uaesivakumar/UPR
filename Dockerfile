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
CMD ["node", "server.js"]
