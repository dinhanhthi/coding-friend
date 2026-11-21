import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE_URL = "https://cf.coprimal.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/docs/`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/privacy/`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
