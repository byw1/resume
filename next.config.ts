import type { NextConfig } from "next";

import { MANUAL_URL } from "./src/lib/links";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ["@prisma/client", "@modelcontextprotocol/sdk"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  /**
   * /docs was a page inside the app that listed every tool. It is now written
   * out at docs.hired.tools and generated from the same tools array, so the
   * in-app copy went rather than being kept in step with it. People have the
   * old address bookmarked, so send them to the replacement instead of a 404.
   *
   * Exact match only: /docs/skills/<name> and .zip are still served from here,
   * because they are this instance's own files and no static site can hand
   * somebody a zip built out of them.
   */
  async redirects() {
    return [
      { source: "/docs", destination: MANUAL_URL, permanent: true },
      /**
       * The knowledge base was called the brain and lived at /brain. It is
       * called Me now. People have the old address bookmarked and Claude has
       * been handing out /brain links since the first release, so keep them
       * working rather than 404ing somebody's own history.
       */
      { source: "/brain", destination: "/me", permanent: true },
      { source: "/brain/:path*", destination: "/me/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
