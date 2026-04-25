import { PostHog } from "posthog-node";

export function createServerPostHog(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  return new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
