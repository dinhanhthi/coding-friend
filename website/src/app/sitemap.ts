import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE_URL = "https://cf.dinh.work";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
