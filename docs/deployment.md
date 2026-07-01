# Deployment

Production Compose is provided in `compose.prod.yaml`. It expects secrets through environment variables or mounted files and assumes HTTPS termination by an external reverse proxy such as Traefik or a platform such as Coolify.

## Coolify

Use Docker Compose as the build pack with these repository settings:

- Base Directory: `/`
- Docker Compose Location: `/compose.yaml`

Coolify accepts a single compose file path in that field, not a full `docker compose -f ... -f ...` command. The root `compose.yaml` intentionally uses `expose: "3000"` for the web service and does not publish host ports, so Coolify's Traefik proxy can route to the web container without colliding with an existing host process on port `3000`.

Set the public domain on the `web` service and target container port `3000` in Coolify. Internal services such as PostgreSQL, Redis, MinIO, and Mailpit are reachable only on the compose network unless you explicitly add port mappings in an override.

The root compose file includes deployable defaults for the app, database, Redis, object storage, SMTP, and worker settings so Coolify can resolve the stack without relying on `.env.example`. Override at least these values in Coolify for production:

- `APP_URL`
- `AUTH_SECRET`
- `CREDENTIAL_ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- SMTP settings if outbound email should be sent through a real mail provider
