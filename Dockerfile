FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @soundspace/shared && npm run build -w @soundspace/api
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0

CMD ["npm", "run", "start", "-w", "@soundspace/api"]
