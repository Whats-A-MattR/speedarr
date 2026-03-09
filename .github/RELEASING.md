# Releasing

## How to tag a release

1. **Bump version** (optional): Update `app/package.json` `version` to match the release (e.g. `1.0.0`).
2. **Create and push a tag** in the form `v<version>`:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. The [Build and Release](.github/workflows/build-release.yml) workflow runs on push of any `v*` tag. It:
   - Runs tests
   - Builds the app and the Docker image
   - Sets **APP_VERSION** from the tag (e.g. `v1.0.0` → `1.0.0`) and passes it into the image at build time
   - Pushes the image to GitHub Container Registry: `ghcr.io/<owner>/speedarr:<version>` and `ghcr.io/<owner>/speedarr:latest`

4. **In the app**, the version is available as:
   - **`GET /api/health`** — response includes `version: "1.0.0"` (from `APP_VERSION` in the container).
   - **Local/dev** — without a tag build, `APP_VERSION` is unset so the app reports `0.0.0` (or set `APP_VERSION` in the environment to override).

## Summary

| You do              | Result                                      |
|---------------------|---------------------------------------------|
| `git tag v1.2.3 && git push origin v1.2.3` | Image built with `APP_VERSION=1.2.3`, health returns that version. |

Use [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) to add release notes to the same tag if you want a changelog on the repo.
