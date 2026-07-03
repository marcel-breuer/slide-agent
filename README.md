# Slide Agent

Slide Agent is a production-oriented, open-source web application for creating, editing, importing, managing, and exporting Microsoft PowerPoint presentations. The browser editor renders presentations from a structured schema and exports editable `.pptx` files from the same source document.

## Current Implementation

This repository contains the MVP foundation:

- TypeScript monorepo with Next.js, worker, and domain packages.
- Docker Compose environment for web, worker, PostgreSQL, Redis, local file storage, and Mailpit.
- Versioned presentation schema with Zod validation.
- Browser slide renderer and interactive editor shell.
- Provider abstraction, deterministic model router, and provider adapters.
- Credential encryption helpers and budget estimation logic.
- Prisma schema covering users, projects, presentations, credentials, jobs, usage, imports, exports, and admin settings.
- PPTX importer for uploaded text-first editable decks and native-oriented PPTX exporter package.
- English/German i18n helper package.

## Local Development

Create a local environment file:

```bash
cp .env.example .env
```

Start the complete development environment:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Open:

- Web app: <http://localhost:3000>
- Mailpit: <http://localhost:8025>

## Checks

Run checks in Docker:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-bookworm-slim sh -lc "corepack enable && pnpm install && pnpm test && pnpm typecheck && pnpm build"
```

## Database

Generate Prisma client:

```bash
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm db:generate
```

Run migrations:

```bash
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm db:migrate
```

Seed local data:

```bash
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm db:seed
```

## Known Limitations

This is a functional foundation, not the complete production MVP. Advanced authentication persistence, full provider API calls, full-fidelity OOXML import conversion, full template-preserving export, visual regression tests, provider-backed generation, and deployment release automation still need completion before a first stable release.

## License

MIT
