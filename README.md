# Speedarr

Internet speed monitoring dashboard and tooling. Runs speed tests on a schedule, stores results in SQLite, and exposes a dashboard (complete mode) or API-only node (node mode) for remote dashboards.

**Documentation:** Source lives in [docs-site/](docs-site/) (Astro, MDX, search). See [docs-site/README.md](docs-site/README.md) to run or publish to [GitHub Pages](https://docs.github.com/en/pages).

## Quick start

```bash
docker build -t speedarr ./app
docker run -d -p 3000:3000 -v speedarr-config:/config -e SPEEDARR_PASSWORD=your-password speedarr
```

Open http://localhost:3000. For main + nodes, Gluetun, and options, run the docs site from `docs-site/` (see Deployment, Configuration, and more there) or use the published GitHub Pages site once deployed.

## License

GPL-3.0 (see LICENSE).
