# Build stage
FROM node:20-slim AS builder

# Install build dependencies for canvas
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install curl for healthcheck and required dependencies for canvas
RUN apt-get update && apt-get install -y \
    curl \
    python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
COPY package*.json ./
RUN npm install --omit=dev && chown -R node:node /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs

# Ensure data directory exists and set permissions
RUN mkdir -p data && chown -R node:node /app/data

USER node

ENV NODE_ENV=production

# Health check for Coolify
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "dist/index.js"]
