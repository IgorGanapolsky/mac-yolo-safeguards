import type { MetadataRoute } from "next";
import { sortedPosts } from "@/lib/blog-posts";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://thumbgate.app/",
      lastModified: new Date("2026-07-22T00:00:00.000Z"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://thumbgate.app/expertise",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://thumbgate.app/blog",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...sortedPosts().map((post) => ({
      url: `https://thumbgate.app/blog/${post.slug}`,
      lastModified: new Date(`${post.publishedAt}T00:00:00.000Z`),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: "https://thumbgate.app/security",
      lastModified: new Date("2026-08-20T00:00:00.000Z"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: "https://thumbgate.app/privacy",
      lastModified: new Date("2026-08-17T00:00:00.000Z"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://thumbgate.app/terms",
      lastModified: new Date("2026-08-17T00:00:00.000Z"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
