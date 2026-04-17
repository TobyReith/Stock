import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
          <p className="text-sm text-muted-foreground">
            Wir schicken dir einen Magic Link per E-Mail.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
