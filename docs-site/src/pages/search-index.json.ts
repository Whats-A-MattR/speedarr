import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const prerender = true;

export const GET: APIRoute = async () => {
  const base = import.meta.env.BASE_URL || "/";
  const docs = await getCollection("docs");
  const basePath = base.replace(/\/$/, "") || "";
  const index = docs.map((entry) => ({
    title: entry.data.title,
    description: entry.data.description ?? "",
    slug: entry.slug,
    url: entry.slug === "index" ? (basePath || "/") : `${basePath}/${entry.slug}`,
  }));
  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
};
