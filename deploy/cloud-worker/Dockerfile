FROM mcr.microsoft.com/playwright:v1.62.1-noble

ARG WORLDKIT_SOURCE_REVISION=unknown

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    WORLDKIT_SOURCE_REVISION=$WORLDKIT_SOURCE_REVISION

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3-pip \
    && python3 -m pip install --break-system-packages --no-cache-dir awscli pillow requests \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /workspace/worldkit
COPY . .
RUN pnpm install --frozen-lockfile

ENTRYPOINT ["node", "scripts/cloud/run-worldkit-cloud-scene-worker.mjs"]
