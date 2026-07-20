import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://thumbgate.app/",
      lastModified: new Date("2026-07-20T00:00:00.000Z"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
