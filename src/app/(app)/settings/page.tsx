import Link from "next/link";
import { ArrowLeft, ChevronRight, Tag, Users, MapPin } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { PushToggle } from "./push-toggle";
import { ThemeToggle } from "./theme-toggle";
import { LogoutButton } from "./logout-button";
import { DeleteAccountButton } from "./delete-account-button";
import { ProfileForm } from "./profile-form";
import { RecipeSettingsForm } from "./recipe-settings-form";
import { FeedbackButton } from "./feedback-button";

export const metadata = { title: "Einstellungen" };

/**
 * Settings page — hub for everything that isn't the main list.
 *
 * Each feature lives in its own section so additions stay clean,
 * reviewable diffs. Deeper flows like household management have their
 * own sub-page.
 *
 * The VAPID public key is read here (server-side) and passed to the
 * client toggle as a prop. `NEXT_PUBLIC_*` env vars are also visible on
 * the client, but threading it as a prop makes the dependency explicit
 * and surfaces a "key fehlt" error state before the user taps anything.
 */
export default async function SettingsPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!user) return null;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  const { data: recipeSettingsRow } = await supabase
    .from("user_settings")
    .select("expiry_threshold_days, dietary_preferences, disliked_ingredients")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-6 flex items-center gap-2">
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label="Zurück"
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      </header>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="profile-heading" className="flex flex-col gap-3">
          <h2
            id="profile-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Profil
          </h2>
          <ProfileForm
            initialName={readFullName(user.user_metadata)}
            email={user.email ?? ""}
          />
        </section>

        <section aria-labelledby="appearance-heading" className="flex flex-col gap-3">
          <h2
            id="appearance-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Darstellung
          </h2>
          <ThemeToggle />
        </section>

        <section aria-labelledby="notifications-heading" className="flex flex-col gap-3">
          <h2
            id="notifications-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Benachrichtigungen
          </h2>
          <PushToggle vapidPublicKey={vapidPublicKey} />
        </section>

        <section aria-labelledby="household-heading" className="flex flex-col gap-3">
          <h2
            id="household-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Haushalt
          </h2>
          <Link
            href="/settings/haushalt"
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Users aria-hidden className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Haushalt verwalten</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Mitglieder einladen und Codes erzeugen.
                </p>
              </div>
            </div>
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </Link>
        </section>

        <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
          <h2
            id="categories-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Kategorien
          </h2>
          <Link
            href="/settings/kategorien"
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Tag aria-hidden className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Kategorien verwalten</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Anlegen, umbenennen, Reihenfolge und Farben anpassen.
                </p>
              </div>
            </div>
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </Link>
        </section>

        <section aria-labelledby="locations-heading" className="flex flex-col gap-3">
          <h2
            id="locations-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Lagerorte
          </h2>
          <Link
            href="/settings/lagerorte"
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <MapPin aria-hidden className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Lagerorte verwalten</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Anlegen, umbenennen, Reihenfolge anpassen.
                </p>
              </div>
            </div>
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </Link>
        </section>

        <section aria-labelledby="recipes-heading" className="flex flex-col gap-3">
          <h2 id="recipes-heading" className="text-sm font-medium text-muted-foreground">
            Rezeptvorschläge
          </h2>
          <RecipeSettingsForm
            initial={{
              expiryThresholdDays: recipeSettingsRow?.expiry_threshold_days ?? 5,
              dietaryPreferences: recipeSettingsRow?.dietary_preferences ?? [],
              dislikedIngredients: recipeSettingsRow?.disliked_ingredients ?? [],
            }}
          />
        </section>

        <section aria-labelledby="feedback-heading" className="flex flex-col gap-3">
          <h2 id="feedback-heading" className="text-sm font-medium text-muted-foreground">
            Feedback
          </h2>
          <FeedbackButton />
        </section>

        <section aria-labelledby="account-heading" className="flex flex-col gap-3">
          <h2
            id="account-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            Konto
          </h2>
          <div className="flex flex-col gap-2">
            <LogoutButton />
            <DeleteAccountButton />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Safely pull `full_name` out of the user-metadata blob. Supabase types
 * it as `{ [key: string]: unknown }`, so we do the runtime shape check
 * ourselves rather than lie to TypeScript.
 */
function readFullName(meta: Record<string, unknown> | null | undefined): string {
  const raw = meta?.full_name;
  return typeof raw === "string" ? raw : "";
}
