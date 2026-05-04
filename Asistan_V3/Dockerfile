FROM node:20-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/bot/package.json packages/bot/
COPY packages/wiki/package.json packages/wiki/
COPY packages/kaizen/package.json packages/kaizen/

RUN npm install

COPY tsconfig.base.json ./
COPY packages/ packages/

RUN npm run build

FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/bot/package.json packages/bot/
COPY packages/wiki/package.json packages/wiki/
COPY packages/kaizen/package.json packages/kaizen/

RUN npm install --omit=dev

COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/bot/dist packages/bot/dist
COPY --from=builder /app/packages/wiki/dist packages/wiki/dist
COPY --from=builder /app/packages/kaizen/dist packages/kaizen/dist

RUN mkdir -p vault/wiki vault/raw vault/schema

EXPOSE 3000

CMD ["node", "packages/bot/dist/index.js"]
