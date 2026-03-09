// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// GitHub Pages: if repo is github.com/user/speedarr, set base to '/speedarr/'
// For user.github.io/speedarr use base: '/speedarr/'. For custom domain use base: '/'
const base = process.env.ASTRO_BASE_PATH || "/speedarr/";

export default defineConfig({
  site: "https://your-username.github.io",
  base,
  output: "static",
  integrations: [
    starlight({
      title: "Speedarr documentation",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/Whats-A-MattR/speedarr",
        },
      ],
      sidebar: [
        {
          label: "Overview",
          items: ["index"],
        },
        {
          label: "Guide",
          items: ["deployment", "configuration", "development"],
        },
        {
          label: "Reference",
          items: ["api"],
        },
      ],
    }),
  ],
});
