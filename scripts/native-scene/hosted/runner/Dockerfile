FROM node:24.13.1-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2 AS dependencies

WORKDIR /runner
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY packages ./packages
COPY scripts/native-scene/hosted/runner-entry.ts ./runner-entry.ts
COPY scripts/native-scene/hosted/hostile-fixtures ./hostile-fixtures
COPY assets/registry ./assets/registry
COPY assets/subjects/source-fbx/vehicles/catalog.json ./assets/subjects/source-fbx/vehicles/catalog.json
COPY assets/subjects/source-fbx/contributors/xier120/catalog.json ./assets/subjects/source-fbx/contributors/xier120/catalog.json
COPY apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb ./assets/g-bot.glb
RUN corepack enable \
  && pnpm install --frozen-lockfile --ignore-scripts

FROM node:24.13.1-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2

RUN groupadd --gid 10001 worldkit \
  && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent worldkit
WORKDIR /runner
COPY --from=dependencies --chown=10001:10001 /runner /runner

ENV NODE_ENV=production
USER 10001:10001
ENTRYPOINT ["node", "--import", "tsx", "/runner/runner-entry.ts"]
