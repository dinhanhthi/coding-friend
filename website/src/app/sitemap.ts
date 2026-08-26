import type { MetadataRoute } from "next";

const BASE_URL = "https://cf.dinhanhthi.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
