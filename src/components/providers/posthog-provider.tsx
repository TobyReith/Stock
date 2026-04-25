"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog, posthog } from "@/lib/posthog/client";
import { useAuthUser } from "@/lib/hooks/use-auth-user";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthUser();
  const identified = useRef(false);

  useEffect(() => {
    initPostHog();
  }, []);

  // Identify on login
  useEffect(() => {
    if (!user || identified.current) return;
    posthog.identify(user.id, {
      created_at: user.created_at,
    });
    identified.current = true;
  }, [user]);

  // Reset on logout
  useEffect(() => {
    if (!user && identified.current) {
      posthog.reset();
      identified.current = false;
    }
  }, [user]);

  // Pageview tracking
  useEffect(() => {
    const url = pathname + (searchParams.toString() ? `?${searchParams}` : "");
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
