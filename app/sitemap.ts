// /app/sitemap.ts

import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://sample-collection-web.vercel.app",
      lastModified: new Date(),
    },
    {
      url: "https://sample-collection-web.vercel.app/login",
      lastModified: new Date(),
    },
    {
      url: "https://sample-collection-web.vercel.app/daily-entry",
      lastModified: new Date(),
    },
    {
      url: "https://sample-collection-web.vercel.app/dashboard",
      lastModified: new Date(),
    },
    {
      url: "https://sample-collection-web.vercel.app/weekly-rules",
      lastModified: new Date(),
    },
  ];
}