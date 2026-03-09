// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://speedarr.io",
  output: "static",
  integrations: [
    starlight({
      title: "Speedarr documentation",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://speedarr.io",
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
