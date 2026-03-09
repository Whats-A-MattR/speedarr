# Docker Compose examples

Pre-built images are published to [GitHub Container Registry](https://github.com/Whats-A-MattR/speedarr/pkgs/container/speedarr): `ghcr.io/whats-a-mattr/speedarr` (use `:latest` or a version tag like `:0.1.0`).

| File | Description |
|------|-------------|
| **complete.yml** | Dashboard only (one container, complete mode). |
| **complete-with-nodes.yml** | Dashboard + three nodes on the same host. |
| **node-only.yml** | Node(s) only — no UI; add this node in a remote dashboard. |

**Run from repo root:**

```bash
# Dashboard only
docker compose -f examples/complete.yml up -d

# Dashboard + 3 nodes
docker compose -f examples/complete-with-nodes.yml up -d

# Node only (report to another dashboard)
docker compose -f examples/node-only.yml up -d
```

See the [Deployment](https://github.com/Whats-A-MattR/speedarr#readme) section and the docs site (`docs-site/`) for environment variables, Gluetun, and node setup.
