# Deployment

Production Compose is provided in `compose.prod.yaml`. It expects secrets through environment variables or mounted files and assumes HTTPS termination by an external reverse proxy such as Traefik or a platform such as Coolify.
