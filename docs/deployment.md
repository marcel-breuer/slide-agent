# Deployment

Production Compose is provided in `compose.prod.yaml`. It expects secrets through environment variables or mounted files and assumes HTTPS termination by an external reverse proxy such as Traefik or a platform such as Coolify.

## Coolify

Use Docker Compose as the build pack with these repository settings:

- Base Directory: `/`
- Docker Compose Location: `/compose.yaml`

Coolify accepts a single compose file path in that field, not a full `docker compose -f ... -f ...` command. The root `compose.yaml` intentionally uses `expose: "3000"` for the web service and does not publish host ports, so Coolify's Traefik proxy can route to the web container without colliding with an existing host process on port `3000`.

Set the public domain on the `web` service and target container port `3000` in Coolify. Internal services such as PostgreSQL, Redis, and Mailpit are reachable only on the compose network unless you explicitly add port mappings in an override.

The root compose file includes deployable defaults for the app, database, Redis, local file storage, SMTP, and worker settings so Coolify can resolve the stack without relying on `.env.example`. Override at least these values in Coolify for production:

- `APP_URL`
- `AUTH_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `DATABASE_URL` or the matching `POSTGRES_*` values
- `REDIS_URL`
- `STORAGE_ROOT`
- `DEMO_LOGIN_EMAIL`
- `DEMO_LOGIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `WORKER_CONCURRENCY`
- SMTP settings if outbound email should be sent through a real mail provider

Uploaded files, generated assets, and exports are stored in the `app-storage` Docker volume mounted at `/app/storage` in the web and worker containers.

## Operational checks

The web health endpoint at `/api/health` verifies Postgres, Redis reachability, local object storage read/write access, and the latest worker heartbeat. Postgres, Redis, and storage failures return HTTP `503`; a stale worker heartbeat is reported as degraded in the JSON payload so deployments can distinguish web liveness from background-worker health.

Administrators can inspect the same dependency data on `/admin/system` and through `/api/admin/system`. Worker heartbeat details are also exposed through `/api/admin/jobs`.

Run these smoke checks after every production deployment:

- Open `/api/health` and confirm `status` is `ok` or only `degraded` because of a known worker restart window.
- Open `/admin/system` and confirm Postgres, Redis, storage, and worker status cards reflect live checks.
- Create or open a presentation, generate a PPTX export, and download it.
- Confirm the worker container logs show structured JSON for job completion or failure events and no plaintext credentials, cookies, tokens, or provider secrets.

## Backups

Back up the Postgres volume and the `app-storage` volume together. The database stores presentation metadata and export records, while `app-storage` stores uploaded files, generated assets, exports, and operational heartbeat probes. Redis is used for queue state and should be treated as transient unless a deployment requires job recovery across restarts.
