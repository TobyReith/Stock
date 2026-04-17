import type { Metadata } from "next";
import { AddFlow } from "./add-flow";

export const metadata: Metadata = { title: "Hinzufügen" };

export default function AddPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
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
