FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3-pip zip \
    && python3 -m pip install --break-system-packages --no-cache-dir awscli pillow requests google-genai \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /workspace/worldkit
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @whitebox-world/playground exec vite build \
    --base http://127.0.0.1:5297/

ARG WORLDKIT_SOURCE_REVISION=unknown
ENV WORLDKIT_SOURCE_REVISION=$WORLDKIT_SOURCE_REVISION

ENTRYPOINT ["node", "scripts/cloud/run-worldkit-cloud-scene-worker.mjs"]
