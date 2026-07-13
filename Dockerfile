FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8790
ENV PROJECT_OS_DATA_DIR=/data

RUN apk add --no-cache git \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY server ./server

EXPOSE 8790
VOLUME ["/data"]

WORKDIR /app/server
CMD ["node", "index.js"]

