import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Statistik" };

export default function StatsPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Statistik</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Was hast du verbraucht, was weggeworfen?
        </p>
      </header>

      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
        <BarChart3 className="size-12 text-muted-foreground" aria-hidden />
        <h2 className="mt-4 text-lg font-medium">Statistik folgt</h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Erste Zahlen ab PR 1.7 — sobald es Daten zu zählen gibt.
        </p>
      </div>
    </div>
  );
}
