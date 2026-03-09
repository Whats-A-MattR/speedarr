# Speedarr documentation site

Static docs site built with [Astro](https://astro.build): prerendered, [MDX](https://mdxjs.com/) content via [content collections](https://docs.astro.build/en/guides/content-collections/), and client-side search.

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

Search is client-side: the build generates `search-index.json` (title, description, url per doc). The nav search box fetches that file and filters by typed words. No backend or third-party service required.
