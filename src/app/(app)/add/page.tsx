import type { Metadata } from "next";
import { AddFlow } from "./add-flow";
import { ActiveHouseholdBadge } from "../_header/active-household-badge";

export const metadata: Metadata = { title: "Hinzufügen" };

export default function AddPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      {/*
       * For multi-household users: a passive indicator of which household
       * this new item will land in. Rendered above the title so it's the
       * first thing a user with 2+ households sees before committing to
       * the form.
       */}
      <div className="mb-3">
        <ActiveHouseholdBadge />
      </div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Hinzufügen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Barcode scannen, MHD erfassen, fertig.
        </p>
      </header>

      <AddFlow />
    </div>
  );
}
