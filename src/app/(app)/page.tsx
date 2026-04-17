import { Package } from "lucide-react";

export default function ListPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vorrat</h1>
      </header>

      <EmptyState />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <Package className="size-12 text-muted-foreground" aria-hidden />
      <h2 className="mt-4 text-lg font-medium">Noch nichts im Vorrat</h2>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Tippe unten auf <span className="font-medium">Hinzufügen</span>, um
        deinen ersten Artikel zu scannen.
      </p>
    </div>
  );
}
