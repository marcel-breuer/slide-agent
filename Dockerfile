FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

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
COPY --from=builder --chown=appuser:appuser /app /app
USER appuser
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
