# Visual regression checks

Visual baselines use the versioned presentation schema and a fixed `1600x900` viewport. The renderer baseline serializer includes only visual inputs: theme, slide background, element geometry, visibility, stacking, and type-specific visual properties. Presentation timestamps, owners, speaker notes, and source metadata are intentionally excluded.

Run the deterministic domain checks in Docker:

```sh
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm --filter @slide-agent/presentation-renderer test
```

The browser baselines use Playwright against a public test-only fixture route. Start the development web server and Playwright in the same disposable Docker container so Chromium, fonts, viewport, locale, and timezone are fixed:

```sh
docker compose -f compose.yaml -f compose.dev.yaml run --rm web sh -lc 'pnpm --filter web dev > /tmp/slide-agent-web.log 2>&1 & until node -e "fetch(\"http://127.0.0.1:3000/visual-fixtures?mode=editor\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do sleep 1; done; pnpm exec playwright install chromium; VISUAL_BASE_URL=http://127.0.0.1:3000 pnpm visual:test'
```

The test covers the editor canvas, read-only presentation preview, and the export-oriented slide projection at `1600x900`. Baseline PNGs live in `tests/visual/snapshots/`. To intentionally update them after reviewing the diff:

```sh
docker compose -f compose.yaml -f compose.dev.yaml run --rm web sh -lc 'pnpm --filter web dev > /tmp/slide-agent-web.log 2>&1 & until node -e "fetch(\"http://127.0.0.1:3000/visual-fixtures?mode=editor\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do sleep 1; done; pnpm exec playwright install chromium; VISUAL_BASE_URL=http://127.0.0.1:3000 pnpm visual:update'
```

The core fixture covers text, shapes, and the representative presentation document. A deliberate background change must fail the comparison and emit a compact diff artifact containing both fingerprints and the changed-line count. The Playwright suite separately fails when a rendered pixel differs from its checked-in baseline; failed PNGs and the HTML report are written under `test-results/visual/` and `playwright-report/`.

When a renderer change is intentional, update the fixture or expected baseline in the same commit, inspect the diff artifact, and document the reason in the pull request. Keep viewport dimensions, fonts, asset URLs, timestamps, and animation state deterministic; do not accept a baseline update solely because a screenshot changed.
