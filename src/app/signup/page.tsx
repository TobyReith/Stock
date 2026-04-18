import { Suspense } from "react";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Konto erstellen" };

/**
 * Shell for the sign-up form. The form reads `useSearchParams()` to
 * carry the invite `?next=` through registration, so it lives inside a
 * Suspense boundary per Next 16's prerender rules.
 */
export default function SignupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Konto erstellen</h1>
          <p className="text-sm text-muted-foreground">
            Lege ein Konto mit Name, E-Mail und Passwort an.
          </p>
        </div>
        <Suspense fallback={<SignupFormFallback />}>
          <SignupForm />
        </Suspense>
      </div>
    </main>
  );
}

function SignupFormFallback() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="space-y-2">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-8 w-full rounded-lg bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 rounded bg-muted" />
        <div className="h-8 w-full rounded-lg bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-8 w-full rounded-lg bg-muted" />
      </div>
      <div className="h-8 w-full rounded-lg bg-muted" />
    </div>
  );
}
