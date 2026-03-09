// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  // Allow POST form submissions when Origin/Host differ (e.g. Docker, proxy, IP access)
  security: {
    checkOrigin: false,
  },
  server: {
    host: true,
    port: 4444,
  },
  vite: {
    ssr: {
      external: ["better-sqlite3", "speedtest-net"],
    },
  },
});
