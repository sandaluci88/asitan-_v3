# Build stage
FROM node:20-slim AS builder

# Install build dependencies for canvas
RUN apt-get update && apt-get install -y \
    python3 build-essential pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Add network robustness for npm and use npm ci for deterministic builds
RUN npm config set fetch-retries 10 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm ci

COPY . .
RUN npm run build

# Prune development dependencies to keep production image light
RUN npm prune --production

# Production stage
FROM node:20-slim

WORKDIR /app

# Install curl for healthcheck and runtime libraries for canvas
RUN apt-get update && apt-get install -y \
    curl \
    python3 build-essential pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy built app and production node_modules from builder
# We only COPY once which is safer than fetching twice over network
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src/assets ./dist/assets
COPY --from=builder /app/docs ./docs

# Ensure data directory exists and set permissions
RUN mkdir -p data && chown -R node:node /app

USER node

ENV NODE_ENV=production

# Health check for Coolify
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
