# Speedarr

Internet speed monitoring dashboard and tooling. Runs speed tests on a schedule, stores results in SQLite, and exposes a dashboard (complete mode) or API-only node (node mode) for remote dashboards.

**Documentation:** Source lives in [docs-site/](docs-site/) (Astro, MDX, search). See [docs-site/README.md](docs-site/README.md) to run or publish to [GitHub Pages](https://docs.github.com/en/pages).

## Quick start

**Pre-built image** (GitHub Container Registry):

```bash
docker pull ghcr.io/whats-a-mattr/speedarr:latest
docker run -d -p 3000:3000 -v speedarr-config:/config -e SPEEDARR_PASSWORD=your-password ghcr.io/whats-a-mattr/speedarr:latest
```

Or use an example compose file from **`examples/`** (dashboard only, dashboard + nodes, or node-only):

```bash
docker compose -f examples/complete.yml up -d
```

**From source:** `docker build -t speedarr ./app` then run as above with `speedarr` as the image name.

Open http://localhost:3000. For main + nodes, Gluetun, and options, see the [docs](docs-site/) (Deployment, Configuration) or the published GitHub Pages site.

## License

GPL-3.0 (see LICENSE).
