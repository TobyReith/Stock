"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Lock,
  Pencil,
  Trash2,
  Plus,
  ChevronUp,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  STORAGE_LOCATION_ICONS,
  TEMPERATURE_HINT_LABELS,
  type StorageLocationDisplay,
  type CreateStorageLocationInput,
  type UpdateStorageLocationInput,
  type TemperatureHint,
} from "@/lib/schemas/storage-locations";
import {
  createStorageLocation,
  updateStorageLocation,
  deleteStorageLocation,
  reorderStorageLocations,
  countItemsByStorageLocation,
} from "@/lib/actions/storage-locations";

type Props = { initialLocations: StorageLocationDisplay[] };

export function StorageLocationsManager({ initialLocations }: Props) {
  const [locations, setLocations] = useState(initialLocations);
  const [editTarget, setEditTarget] = useState<StorageLocationDisplay | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageLocationDisplay | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();

  function move(index: number, direction: -1 | 1) {
    const next = [...locations];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setLocations(next);
    startTransition(async () => {
      const res = await reorderStorageLocations(next.map((l) => l.id));
      if (!res.ok) toast.error(res.error);
    });
  }

  function handleCreated(loc: StorageLocationDisplay) {
    setLocations((prev) => [...prev, loc]);
    setShowCreate(false);
  }

  function handleUpdated(updated: StorageLocationDisplay) {
    setLocations((prev) =>
      prev.map((l) => (l.id === updated.id ? updated : l)),
    );
    setEditTarget(null);
  }

  function handleDeleted(id: string) {
    setLocations((prev) => prev.filter((l) => l.id !== id));
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setShowCreate(true)}
      >
        <Plus aria-hidden /> Neuer Lagerort
      </Button>

      <ul className="flex flex-col gap-2">
        {locations.map((loc, index) => (
          <li
            key={loc.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
          >
            {/* Icon */}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-base">
              {loc.icon}
            </span>

            {/* Name + temperature hint */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{loc.name}</span>
                {loc.isSystem && (
                  <Lock
                    className="shrink-0 size-3 text-muted"
                    aria-label="System-Lagerort"
                  />
                )}
              </div>
              <p className="text-xs text-muted">
                {TEMPERATURE_HINT_LABELS[loc.temperatureHint]}
              </p>
            </div>

            {/* Reorder */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0 || isPending}
                aria-label="Nach oben"
                className="rounded p-0.5 text-muted hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === locations.length - 1 || isPending}
                aria-label="Nach unten"
                className="rounded p-0.5 text-muted hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </div>

            {/* Edit */}
            <button
              type="button"
              onClick={() => setEditTarget(loc)}
              aria-label="Bearbeiten"
              className="rounded p-1.5 text-muted hover:text-foreground"
            >
              <Pencil className="size-4" aria-hidden />
            </button>

            {/* Delete — custom only */}
            {!loc.isSystem && (
              <button
                type="button"
                onClick={() => setDeleteTarget(loc)}
                aria-label="Löschen"
                className="rounded p-1.5 text-danger/70 hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuer Lagerort</DialogTitle>
          </DialogHeader>
          <LocationForm
            onSuccess={handleCreated}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lagerort bearbeiten</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <LocationForm
              existing={editTarget}
              onSuccess={handleUpdated}
              onCancel={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteDialog
          location={deleteTarget}
          otherLocations={locations.filter((l) => l.id !== deleteTarget.id)}
          onDeleted={handleDeleted}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function firstGrapheme(str: string): string {
  if (!str) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const [first] = new Intl.Segmenter().segment(str);
    return first?.segment ?? "";
  }
  return [...str][0] ?? "";
}

// ─── Create/edit form ─────────────────────────────────────────────────────────

type FormProps =
  | { existing?: undefined; onSuccess: (created: StorageLocationDisplay) => void; onCancel: () => void }
  | { existing: StorageLocationDisplay; onSuccess: (updated: StorageLocationDisplay) => void; onCancel: () => void };

function LocationForm({ existing, onSuccess, onCancel }: FormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState<string>(existing?.icon ?? "📦");
  const [temperatureHint, setTemperatureHint] = useState<TemperatureHint>(
    existing?.temperatureHint ?? "ambient",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (existing) {
        const input: UpdateStorageLocationInput = {
          id: existing.id,
          name: name.trim(),
          icon,
          temperatureHint,
        };
        const res = await updateStorageLocation(input);
        if (!res.ok) { setError(res.error); return; }
        onSuccess({ ...existing, name: name.trim(), icon, temperatureHint });
        toast.success("Gespeichert");
      } else {
        const input: CreateStorageLocationInput = { name: name.trim(), icon, temperatureHint };
        const res = await createStorageLocation(input);
        if (!res.ok) { setError(res.error); return; }
        onSuccess({
          id: res.data.id,
          slug: "loc_pending",
          name: name.trim(),
          icon,
          sortOrder: 999,
          isSystem: false,
          temperatureHint,
        });
        toast.success("Lagerort angelegt");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="loc-name">Name</Label>
        <Input
          id="loc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Keller"
          maxLength={60}
          required
          autoFocus
        />
      </div>

      {/* Icon picker */}
      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-1.5">
          {STORAGE_LOCATION_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setIcon(emoji)}
              aria-pressed={icon === emoji}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg border text-lg transition-colors",
                icon === emoji
                  ? "border-primary bg-primary-subtle"
                  : "border-border hover:bg-surface-raised",
              )}
            >
              {emoji}
            </button>
          ))}
          <input
            type="text"
            value={(STORAGE_LOCATION_ICONS as unknown as string[]).includes(icon) ? "" : icon}
            onChange={(e) => {
              const first = firstGrapheme(e.target.value);
              if (first) setIcon(first);
            }}
            placeholder="+"
            aria-label="Eigenes Emoji"
            className={cn(
              "size-9 rounded-lg border text-center text-lg outline-none transition-colors focus:border-border-strong",
              !(STORAGE_LOCATION_ICONS as unknown as string[]).includes(icon)
                ? "border-primary bg-primary-subtle"
                : "border-dashed border-border hover:bg-surface-raised",
            )}
          />
        </div>
      </div>

      {/* Temperature hint */}
      <div className="flex flex-col gap-1.5">
        <Label>Temperatur</Label>
        <div className="flex flex-col gap-1.5">
          {(["cold", "frozen", "ambient"] as const).map((hint) => (
            <label key={hint} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="temperature"
                value={hint}
                checked={temperatureHint === hint}
                onChange={() => setTemperatureHint(hint)}
                className="accent-primary"
              />
              <span className="text-sm">{TEMPERATURE_HINT_LABELS[hint]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2 rounded-lg border border-border p-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-surface-raised text-base">
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium">{name || "Vorschau"}</p>
          <p className="text-xs text-muted">{TEMPERATURE_HINT_LABELS[temperatureHint]}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={isPending || !name.trim()}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {existing ? "Speichern" : "Anlegen"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

function DeleteDialog({
  location,
  otherLocations,
  onDeleted,
  onCancel,
}: {
  location: StorageLocationDisplay;
  otherLocations: StorageLocationDisplay[];
  onDeleted: (id: string) => void;
  onCancel: () => void;
}) {
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [reassignSlug, setReassignSlug] = useState("other");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const res = await countItemsByStorageLocation(location.slug);
      if (res.ok) setItemCount(res.data);
    })();
  }, [location.slug]);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteStorageLocation(location.id, reassignSlug);
      if (!res.ok) { setError(res.error); return; }
      toast.success("Lagerort gelöscht");
      onDeleted(location.id);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lagerort löschen?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">
              {location.icon} {location.name}
            </span>{" "}
            wird dauerhaft gelöscht.
          </p>

          {itemCount === null && (
            <p className="text-xs text-muted">Prüfe betroffene Artikel…</p>
          )}

          {itemCount !== null && itemCount > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3">
              <p className="text-sm">
                {itemCount} {itemCount === 1 ? "Artikel wird" : "Artikel werden"} neu
                zugeordnet:
              </p>
              <select
                value={reassignSlug}
                onChange={(e) => setReassignSlug(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground outline-none focus:border-border-strong"
              >
                <option value="other">📋 Sonstiges</option>
                {otherLocations.map((l) => (
                  <option key={l.slug} value={l.slug}>
                    {l.icon} {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {itemCount !== null && itemCount === 0 && (
            <p className="text-xs text-muted">
              Keine Artikel an diesem Lagerort — Löschen hat keinen weiteren Effekt.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={isPending || itemCount === null}
            >
              {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Löschen
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={isPending}>
              Abbrechen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
