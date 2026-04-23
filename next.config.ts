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

    /**
     * Client-side Router Cache TTLs (experimental, see Next.js docs
     * `staleTimes`). In Next 15+ the default for dynamic routes is
     * 0 seconds — every tab-switch refetches the RSC payload from the
     * server. Our bottom-nav tabs are all dynamic (auth-gated + Supabase-
     * backed), so tapping back to a recently-viewed tab felt like a
     * cold load.
     *
     * - `dynamic: 30`  — re-use a dynamic route's payload for 30 s after
     *   navigation. Combined with `loading.tsx` boundaries, this makes
     *   the "Vorrat ↔ Einkauf ↔ Statistik" loop feel instant while still
     *   reflecting data changes (new items land on the next refresh).
     * - `static: 180`  — stock Next.js default kept explicit so future
     *   upgrades don't silently regress.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
