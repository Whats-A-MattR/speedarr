# Speedarr documentation site

Static docs site built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build/): prerendered content collections with built-in navigation, dark mode, and full‑text search powered by Pagefind.

## Local development

```bash
cd docs-site
npm install
npm run dev
```

Open http://localhost:4321 (or the URL Astro prints). With default base `/speedarr/`, the site is at http://localhost:4321/speedarr/.

## Build

```bash
npm run build
```

Output is in `dist/`. To preview:

```bash
npm run preview
```

## GitHub Pages

The site is configured for **GitHub project pages**: repository `user/repo` → URL `https://user.github.io/repo/`.

- **Base path:** Set in `astro.config.mjs` via `ASTRO_BASE_PATH` (default `/speedarr/`). For a user/org site (`user.github.io`) use base `/`.
- **Publish:** Use the workflow in `.github/workflows/docs.yml`: push to `main` (or the branch you use for Pages) and the workflow builds and deploys the docs site. In the repo **Settings → Pages**, set source to **GitHub Actions**.

## Content

- **Location:** `src/content/docs/` — one `.mdx` file per doc.
- **Schema:** Each file has frontmatter `title` and optional `description` (used for search).
- **Links:** Use absolute paths with the base, e.g. `[Deployment](/speedarr/deployment)`, or relative paths from the current doc.

## Search

Search is provided by **Starlight + Pagefind**. No extra configuration is needed: Starlight indexes the docs at build time and renders the search UI automatically.
