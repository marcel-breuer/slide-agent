# Visual regression checks

Visual baselines use the versioned presentation schema and a fixed `1600x900` viewport. The renderer baseline serializer includes only visual inputs: theme, slide background, element geometry, visibility, stacking, and type-specific visual properties. Presentation timestamps, owners, speaker notes, and source metadata are intentionally excluded.

Run the deterministic checks in Docker:

```sh
docker compose -f compose.yaml -f compose.dev.yaml run --rm web pnpm --filter @slide-agent/presentation-renderer test
```

The core fixture covers text, shapes, and the representative presentation document. A deliberate background change must fail the comparison and emit a compact diff artifact containing both fingerprints and the changed-line count.

When a renderer change is intentional, update the fixture or expected baseline in the same commit, inspect the diff artifact, and document the reason in the pull request. Keep viewport dimensions, fonts, asset URLs, timestamps, and animation state deterministic; do not accept a baseline update solely because a screenshot changed.
