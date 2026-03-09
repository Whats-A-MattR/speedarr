# Contributing to Speedarr

Thanks for your interest in contributing.

## How to contribute

- **Bug reports and feature requests:** Open an [issue](https://github.com/your-username/speedarr/issues).
- **Code changes:** Open a pull request against `main` (or `master`). Keep PRs focused and reference any related issues.

## Development setup

- **App:** See [Development](https://github.com/your-username/speedarr/blob/main/docs-site/src/content/docs/development.mdx) in the docs. In short: `cd app`, `npm install`, `npm run dev` (and optionally `npm run dev:node` for a second instance).
- **Tests:** From `app/`, run `npm run test`.
- **Docs site:** From `docs-site/`, run `npm install` and `npm run dev` to preview the documentation.

## Code and commits

- Use the existing style (formatting, naming). The app uses TypeScript and Astro.
- Prefer small, logical commits and clear PR descriptions.

## Releasing

Maintainers: see [RELEASING.md](RELEASING.md) for how to tag releases so the app version is reflected in the image and `/api/health`.

## Security

If you believe you’ve found a security vulnerability, do **not** open a public issue. See [SECURITY.md](SECURITY.md) for how to report it.
