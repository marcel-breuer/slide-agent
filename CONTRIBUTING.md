# Contributing

Use Docker Compose for local development and keep changes focused. Commit messages must follow Conventional Commits.

## UI styling

Use Tailwind utility classes for new UI work. Avoid adding or expanding custom CSS in global stylesheets or component-specific CSS files. If a change requires custom CSS because Tailwind cannot reasonably express the behavior, document that exception in the pull request.

Before opening a pull request, run:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-bookworm-slim sh -lc "corepack enable && pnpm install && pnpm lint && pnpm test && pnpm typecheck && pnpm build"
```
