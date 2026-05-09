import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

/**
 * `LoginForm` reads `useSearchParams()` to capture the `?next=` redirect
 * target that the invite flow carries. Next 16's prerender bails out on
 * `useSearchParams()` unless the consumer is inside a Suspense boundary
 * — wrapping here lets the shell stay static while the form defers to
 * client-side hydration for the param read.
 */
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="font-serif text-[26px] font-medium tracking-tight">Anmelden</h1>
          <p className="text-sm text-muted">
            Melde dich mit deiner E-Mail und deinem Passwort an.
          </p>
        </div>
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

/**
 * Skeleton shown during the client-hydration read of `useSearchParams`.
 * Matches the form's layout so there's no layout shift when the real
 * inputs mount.
 */
function LoginFormFallback() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="space-y-2">
        <div className="h-4 w-20 rounded bg-surface-raised" />
        <div className="h-8 w-full rounded-lg bg-surface-raised" />
      </div>
      <div className="h-8 w-full rounded-lg bg-surface-raised" />
    </div>
  );
}
