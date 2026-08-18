import type { MetadataRoute } from "next";

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
