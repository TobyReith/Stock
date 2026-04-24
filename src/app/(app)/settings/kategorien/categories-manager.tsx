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
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type CategoryDisplay,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@/lib/schemas/categories";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  countItemsByCategory,
} from "@/lib/actions/categories";

type Props = { initialCategories: CategoryDisplay[] };

export function CategoriesManager({ initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [editTarget, setEditTarget] = useState<CategoryDisplay | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryDisplay | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();

  function move(index: number, direction: -1 | 1) {
    const next = [...categories];
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    setCategories(next);
    startTransition(async () => {
      const res = await reorderCategories(next.map((c) => c.id));
      if (!res.ok) toast.error(res.error);
    });
  }

  function handleCreated(cat: CategoryDisplay) {
    setCategories((prev) => [...prev, cat]);
    setShowCreate(false);
  }

  function handleUpdated(updated: CategoryDisplay) {
    setCategories((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
    setEditTarget(null);
  }

  function handleDeleted(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
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
        <Plus aria-hidden /> Neue Kategorie
      </Button>

      <ul className="flex flex-col gap-2">
        {categories.map((cat, index) => (
          <li
            key={cat.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
          >
            {/* Color dot + icon */}
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-base"
              style={{ backgroundColor: cat.color + "22", border: `2px solid ${cat.color}` }}
            >
              {cat.icon}
            </span>

            {/* Name */}
            <span className="flex-1 truncate text-sm font-medium">
              {cat.name}
              {cat.isSystem && (
                <Lock
                  className="ml-1.5 inline size-3 text-muted-foreground"
                  aria-label="System-Kategorie"
                />
              )}
            </span>

            {/* Reorder */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0 || isPending}
                aria-label="Nach oben"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === categories.length - 1 || isPending}
                aria-label="Nach unten"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </div>

            {/* Edit */}
            <button
              type="button"
              onClick={() => setEditTarget(cat)}
              aria-label="Bearbeiten"
              className="rounded p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-4" aria-hidden />
            </button>

            {/* Delete — custom only */}
            {!cat.isSystem && (
              <button
                type="button"
                onClick={() => setDeleteTarget(cat)}
                aria-label="Löschen"
                className="rounded p-1.5 text-destructive/70 hover:text-destructive"
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
            <DialogTitle>Neue Kategorie</DialogTitle>
          </DialogHeader>
          <CategoryForm
            onSuccess={handleCreated}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kategorie bearbeiten</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <CategoryForm
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
          category={deleteTarget}
          otherCategories={categories.filter(
            (c) => c.id !== deleteTarget.id,
          )}
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

// ─── Category create/edit form ───────────────────────────────────────────────

type FormProps =
  | { existing?: undefined; onSuccess: (created: CategoryDisplay) => void; onCancel: () => void }
  | { existing: CategoryDisplay; onSuccess: (updated: CategoryDisplay) => void; onCancel: () => void };

function CategoryForm({ existing, onSuccess, onCancel }: FormProps) {
  const [name, setName] = useState(existing?.name ?? "");
  const [icon, setIcon] = useState<string>(existing?.icon ?? "📦");
  const [color, setColor] = useState(existing?.color ?? "#6b7280");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      if (existing) {
        const input: UpdateCategoryInput = {
          id: existing.id,
          name: name.trim(),
          icon,
          color,
        };
        const res = await updateCategory(input);
        if (!res.ok) { setError(res.error); return; }
        onSuccess({ ...existing, name: name.trim(), icon, color });
        toast.success("Gespeichert");
      } else {
        const input: CreateCategoryInput = { name: name.trim(), icon, color };
        const res = await createCategory(input);
        if (!res.ok) { setError(res.error); return; }
        onSuccess({
          id: res.data.id,
          slug: "custom_pending", // will be refreshed on next navigation
          name: name.trim(),
          icon,
          color,
          sortOrder: 999,
          isSystem: false,
        });
        toast.success("Kategorie angelegt");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cat-name">Name</Label>
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Haushaltsreiniger"
          maxLength={60}
          required
          autoFocus
        />
      </div>

      {/* Icon picker */}
      <div className="flex flex-col gap-1.5">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setIcon(emoji)}
              aria-pressed={icon === emoji}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg border text-lg transition-colors",
                icon === emoji
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-muted",
              )}
            >
              {emoji}
            </button>
          ))}
          <input
            type="text"
            value={CATEGORY_ICONS.includes(icon) ? "" : icon}
            onChange={(e) => {
              const first = firstGrapheme(e.target.value);
              if (first) setIcon(first);
            }}
            placeholder="+"
            aria-label="Eigenes Emoji"
            className={cn(
              "size-9 rounded-lg border text-center text-lg outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
              !CATEGORY_ICONS.includes(icon)
                ? "border-primary bg-primary/10"
                : "border-dashed border-border hover:bg-muted",
            )}
          />
        </div>
      </div>

      {/* Color picker */}
      <div className="flex flex-col gap-1.5">
        <Label>Farbe</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setColor(value)}
              aria-label={label}
              aria-pressed={color === value}
              title={label}
              className="relative flex size-8 items-center justify-center rounded-full transition-transform hover:scale-110"
              style={{ backgroundColor: value }}
            >
              {color === value && (
                <Check className="size-4 text-white drop-shadow" aria-hidden />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2 rounded-lg border p-3">
        <span
          className="flex size-8 items-center justify-center rounded-full text-base"
          style={{ backgroundColor: color + "22", border: `2px solid ${color}` }}
        >
          {icon}
        </span>
        <span className="text-sm font-medium">{name || "Vorschau"}</span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
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
  category,
  otherCategories,
  onDeleted,
  onCancel,
}: {
  category: CategoryDisplay;
  otherCategories: CategoryDisplay[];
  onDeleted: (id: string) => void;
  onCancel: () => void;
}) {
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [reassignSlug, setReassignSlug] = useState("other");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const res = await countItemsByCategory(category.slug);
      if (res.ok) setItemCount(res.data);
    })();
  }, [category.slug]);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCategory(category.id, reassignSlug);
      if (!res.ok) { setError(res.error); return; }
      toast.success("Kategorie gelöscht");
      onDeleted(category.id);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kategorie löschen?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {category.icon} {category.name}
            </span>{" "}
            wird dauerhaft gelöscht.
          </p>

          {itemCount === null && (
            <p className="text-xs text-muted-foreground">Prüfe betroffene Artikel…</p>
          )}

          {itemCount !== null && itemCount > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/50 p-3">
              <p className="text-sm">
                {itemCount} {itemCount === 1 ? "Artikel wird" : "Artikel werden"} neu
                zugeordnet:
              </p>
              <select
                value={reassignSlug}
                onChange={(e) => setReassignSlug(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
              >
                <option value="other">📦 Sonstiges</option>
                {otherCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {itemCount !== null && itemCount === 0 && (
            <p className="text-xs text-muted-foreground">
              Keine Artikel mit dieser Kategorie — Löschen hat keinen weiteren Effekt.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
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
