#!/bin/sh
set -eu

if [ "${RUN_DATABASE_MIGRATIONS:-true}" = "true" ]; then
  if node /usr/local/bin/slide-agent-prepare-database.mjs; then
    pnpm --filter @slide-agent/database exec prisma migrate diff \
      --from-config-datasource \
      --to-schema /app/packages/database/prisma/schema.prisma \
      --exit-code >/dev/null
    pnpm --filter @slide-agent/database exec prisma migrate resolve \
      --applied 20260713160000_initial_schema
  fi
  pnpm --filter @slide-agent/database exec prisma migrate deploy
fi

exec "$@"
