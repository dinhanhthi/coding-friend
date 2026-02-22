import type { MetadataRoute } from "next";
import { getAllDocSlugs } from "@/lib/docs";

const BASE_URL = "https://cf.dinhanhthi.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const docSlugs = getAllDocSlugs();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/changelog/`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  const docPages: MetadataRoute.Sitemap = docSlugs.map((slug) => ({
    url: `${BASE_URL}/docs/${slug}/`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...docPages];
}
