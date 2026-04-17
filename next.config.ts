import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos get base64-encoded before being sent to the `extractBestBefore`
      // server action. Base64 adds ~33% overhead to the raw bytes, and our
      // vision pipeline caps decoded size at 5 MiB (see
      // `src/lib/vision/extract-date.ts`). Budget: 5 MiB × 1.34 ≈ 6.7 MiB,
      // plus small serialization overhead → 8 MiB ceiling. Below this, the
      // 1 MB default silently rejects most desktop / phone photos with a
      // generic Server Components render error.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
