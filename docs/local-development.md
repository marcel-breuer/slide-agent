# Local Development

Start the full development stack with:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

This starts web, worker, Postgres, Redis, a persistent local storage volume, and Mailpit.
