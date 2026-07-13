FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends \
    openssl python3 make g++ fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
    libcairo2 libcups2 libdbus-1-3 libgbm1 libglib2.0-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@11.9.0

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile=false

FROM deps AS builder
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
RUN useradd --user-group --create-home --shell /bin/false appuser
COPY docker/web-entrypoint.sh /usr/local/bin/slide-agent-web-entrypoint
COPY docker/prepare-database.mjs /usr/local/bin/slide-agent-prepare-database.mjs
RUN chmod 755 /usr/local/bin/slide-agent-web-entrypoint /usr/local/bin/slide-agent-prepare-database.mjs
COPY --from=builder --chown=appuser:appuser /app /app
RUN mkdir -p /app/storage && chown -R appuser:appuser /app/storage
USER appuser
ENTRYPOINT ["/usr/local/bin/slide-agent-web-entrypoint"]
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
