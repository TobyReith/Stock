import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Stock</h1>
          <p className="text-muted-foreground">
            Deine Vorratskammer im Blick. Barcode scannen, MHD erfassen, weniger
            wegwerfen.
          </p>
        </div>
        {user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Angemeldet als <span className="font-medium">{user.email}</span>
            </p>
            <Link
              href="/items"
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Zu meinem Vorrat
            </Link>
          </div>
        ) : (
          <Link
            href="/login"
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            Anmelden
          </Link>
        )}
      </div>
    </main>
  );
}
