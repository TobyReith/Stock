import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com",
    ui_host: "https://eu.posthog.com",
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    autocapture: false,
    persistence: "localStorage",
    sanitize_properties: (props) => {
      delete props.$ip;
      return props;
    },
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.debug();
    },
  });
}

export { posthog };
