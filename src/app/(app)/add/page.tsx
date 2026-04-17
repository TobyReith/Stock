import type { Metadata } from "next";
import { Camera } from "lucide-react";

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

      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
        <Camera className="size-12 text-muted-foreground" aria-hidden />
        <h2 className="mt-4 text-lg font-medium">Scanner folgt</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          In PR 1.4 wird hier der Barcode-Scanner eingebaut.
        </p>
      </div>
    </div>
  );
}
