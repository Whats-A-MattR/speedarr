// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

// GitHub Pages: if repo is github.com/user/speedarr, set base to '/speedarr/'
// For user.github.io/speedarr use base: '/speedarr/'. For custom domain use base: '/'
const base = process.env.ASTRO_BASE_PATH || "/speedarr/";

export default defineConfig({
  site: "https://your-username.github.io",
  base,
  output: "static",
  integrations: [mdx()],
});
