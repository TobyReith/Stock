import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Passwort vergessen" };

/**
 * "Passwort vergessen" entry — sends a recovery mail to the given
 * address. The form reads `useSearchParams()` to pass `?next=` through,
 * so it lives inside a Suspense boundary.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Passwort vergessen</h1>
          <p className="text-sm text-muted-foreground">
            Wir schicken dir einen Link zum Zurücksetzen.
          </p>
        </div>
        <Suspense fallback={<FormFallback />}>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}

function FormFallback() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="space-y-2">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-8 w-full rounded-lg bg-muted" />
      </div>
      <div className="h-8 w-full rounded-lg bg-muted" />
    </div>
  );
}
