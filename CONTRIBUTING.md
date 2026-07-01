# Contributing

Use Docker Compose for local development and keep changes focused. Commit messages must follow Conventional Commits.

Before opening a pull request, run:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-bookworm-slim sh -lc "corepack enable && pnpm install && pnpm lint && pnpm test && pnpm typecheck && pnpm build"
```
