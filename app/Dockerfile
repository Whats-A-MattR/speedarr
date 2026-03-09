# syntax=docker/dockerfile:1
# Speedarr: speed test node + dashboard
# Build with: docker buildx bake (or docker build -t speedarr .)
ARG NODE_VERSION=22
ARG APP_VERSION=0.0.0

# --- Install Speedtest CLI (Ookla) on Debian ---
FROM debian:bookworm-slim AS speedtest
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg2 \
    && curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash \
    && apt-get install -y --no-install-recommends speedtest \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# --- App build ---
FROM node:${NODE_VERSION}-bookworm-slim AS builder
# Install Python + build tools + liblzma so native deps (lzma-native via speedtest-net) can compile
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ python-is-python3 liblzma-dev bzip2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

# --- Production image ---
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production
ENV PORT=3000

# speedtest-net spawns `ps` to manage the speedtest subprocess; Ookla CLI uses curl to fetch config
RUN apt-get update && apt-get install -y --no-install-recommends procps curl ca-certificates \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Speedtest CLI from speedtest stage
COPY --from=speedtest /usr/bin/speedtest /usr/bin/speedtest

# Copy built app, migrations, and entrypoint
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/migrations ./migrations
COPY scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

# Default config path (bind mount or volume)
ENV SPEEDARR_DATA_DIR=/config
RUN mkdir -p /config/db

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "./dist/server/entry.mjs"]
