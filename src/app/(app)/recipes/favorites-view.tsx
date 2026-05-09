"use client";

import { useState, useTransition, useDeferredValue } from "react";
import { Heart, Pencil, Search, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  removeFromFavorites,
  updateFavoriteTags,
  updateFavoriteNote,
  markFavoriteAsCooked,
} from "@/lib/actions/favorites";
import type { Recipe, RecipeFavorite } from "@/lib/recipes/types";
import { RecipeCard } from "./recipe-suggestions";
import { CookingModal } from "./cooking-modal";

const DIFFICULTY_OPTIONS: Recipe["difficulty"][] = ["einfach", "mittel", "anspruchsvoll"];
const TIME_OPTIONS = [
  { label: "Bis 15 Min.", value: 15 },
  { label: "Bis 30 Min.", value: 30 },
  { label: "Bis 60 Min.", value: 60 },
] as const;
const SORT_OPTIONS = [
  { label: "Zuletzt hinzugefügt", value: "recent" as const },
  { label: "Oft gekocht", value: "most_cooked" as const },
  { label: "A–Z", value: "alpha" as const },
];
const TAG_SUGGESTIONS = ["schnell", "vegetarisch", "Suppe", "Backen", "Kinder"];

type SortKey = "recent" | "most_cooked" | "alpha";

type Props = {
  initialFavorites: RecipeFavorite[];
  householdTags: string[];
};

export function FavoritesView({ initialFavorites, householdTags }: Props) {
  const [favorites, setFavorites] = useState<RecipeFavorite[]>(initialFavorites);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [filterDifficulty, setFilterDifficulty] = useState<Set<Recipe["difficulty"]>>(new Set());
  const [filterMaxMinutes, setFilterMaxMinutes] = useState<number | null>(null);
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [cookingEntry, setCookingEntry] = useState<RecipeFavorite | null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<RecipeFavorite | null>(null);
  const [editingNoteFor, setEditingNoteFor] = useState<RecipeFavorite | null>(null);

  const deferredSearch = useDeferredValue(search);

  // ─── Filtering & sorting ──────────────────────────────────────────────────

  const filtered = favorites
    .filter((fav) => {
      if (deferredSearch) {
        if (!fav.recipeTitle.toLowerCase().includes(deferredSearch.toLowerCase())) return false;
      }
      if (filterDifficulty.size > 0 && !filterDifficulty.has(fav.recipeData.difficulty)) return false;
      if (filterMaxMinutes && fav.recipeData.timeMinutes > filterMaxMinutes) return false;
      if (filterTags.size > 0 && ![...filterTags].every((t) => fav.tags.includes(t))) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "most_cooked") return b.cookedCount - a.cookedCount || b.createdAt.localeCompare(a.createdAt);
      if (sortBy === "alpha") return a.recipeTitle.localeCompare(b.recipeTitle, "de");
      return b.createdAt.localeCompare(a.createdAt);
    });

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleRemove(fav: RecipeFavorite) {
    setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
    const res = await removeFromFavorites(fav.id);
    if (!res.ok) {
      setFavorites((prev) => [fav, ...prev]);
      toast.error("Fehler", { description: res.reason });
    } else {
      toast.success("Aus Favoriten entfernt");
    }
  }

  function handleCookDone(fav: RecipeFavorite) {
    setFavorites((prev) =>
      prev.map((f) =>
        f.id === fav.id
          ? { ...f, cookedCount: f.cookedCount + 1, lastCookedAt: new Date().toISOString() }
          : f,
      ),
    );
    setCookingEntry(null);
  }

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Heart className="size-10 text-muted" aria-hidden />
        <p className="mt-3 font-medium">Noch keine Favoriten</p>
        <p className="mt-1 max-w-xs text-sm text-muted">
          Tippe das Herz auf einem Rezeptvorschlag, um es hier zu speichern.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Search + filter bar */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rezept suchen…"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-sm text-foreground placeholder:text-muted outline-none focus:border-border-strong"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 rounded p-0.5 text-muted hover:text-foreground"
              aria-label="Suche löschen"
            >
              <X className="size-4" />
            </button>
          )}
          <span className="absolute right-9 text-xs text-muted">
            {filtered.length}
          </span>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="h-7 shrink-0 rounded-full border border-border bg-surface px-2 text-xs outline-none focus:border-border-strong"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Difficulty */}
          {DIFFICULTY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() =>
                setFilterDifficulty((prev) => {
                  const next = new Set(prev);
                  if (next.has(d)) next.delete(d); else next.add(d);
                  return next;
                })
              }
              className={cn(
                "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                filterDifficulty.has(d)
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border text-muted hover:bg-surface-raised",
              )}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}

          {/* Time */}
          {TIME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setFilterMaxMinutes((prev) => (prev === o.value ? null : o.value))}
              className={cn(
                "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                filterMaxMinutes === o.value
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border text-muted hover:bg-surface-raised",
              )}
            >
              {o.label}
            </button>
          ))}

          {/* Household tags */}
          {householdTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                setFilterTags((prev) => {
                  const next = new Set(prev);
                  if (next.has(tag)) next.delete(tag); else next.add(tag);
                  return next;
                })
              }
              className={cn(
                "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                filterTags.has(tag)
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-border text-muted hover:bg-surface-raised",
              )}
            >
              # {tag}
            </button>
          ))}
        </div>
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">Kein Favorit passt zu den Filtern.</p>
      )}

      {/* Favorite cards */}
      <div className="flex flex-col gap-4">
        {filtered.map((fav) => (
          <div key={fav.id} className="group relative">
            <RecipeCard
              recipe={fav.recipeData}
              isFavorite={true}
              onToggleFavorite={() => void handleRemove(fav)}
              onCook={() => setCookingEntry(fav)}
              tags={fav.tags}
              notes={fav.notes}
              cookedCount={fav.cookedCount}
              lastCookedAt={fav.lastCookedAt}
            />
            {/* Edit actions (tag + note buttons below card) */}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingTagsFor(fav)}
                className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <Tag className="size-3" /> Tags bearbeiten
              </button>
              <button
                type="button"
                onClick={() => setEditingNoteFor(fav)}
                className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <Pencil className="size-3" /> Notiz
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Cooking modal */}
      {cookingEntry && (
        <CookingModal
          recipe={cookingEntry.recipeData}
          favoriteId={cookingEntry.id}
          onClose={() => setCookingEntry(null)}
          onCooked={() => handleCookDone(cookingEntry)}
        />
      )}

      {/* Tag editor */}
      {editingTagsFor && (
        <TagEditorSheet
          favorite={editingTagsFor}
          allTags={householdTags}
          onSave={(tags) => {
            setFavorites((prev) => prev.map((f) => f.id === editingTagsFor.id ? { ...f, tags } : f));
            setEditingTagsFor(null);
          }}
          onClose={() => setEditingTagsFor(null)}
        />
      )}

      {/* Note editor */}
      {editingNoteFor && (
        <NoteEditorSheet
          favorite={editingNoteFor}
          onSave={(notes) => {
            setFavorites((prev) => prev.map((f) => f.id === editingNoteFor.id ? { ...f, notes } : f));
            setEditingNoteFor(null);
          }}
          onClose={() => setEditingNoteFor(null)}
        />
      )}
    </>
  );
}

// ─── Tag editor bottom sheet ──────────────────────────────────────────────────

function TagEditorSheet({
  favorite,
  allTags,
  onSave,
  onClose,
}: {
  favorite: RecipeFavorite;
  allTags: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(favorite.tags));
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();

  const suggestions = input
    ? TAG_SUGGESTIONS.filter((t) => t.toLowerCase().includes(input.toLowerCase()) && !selected.has(t))
    : TAG_SUGGESTIONS.filter((t) => !selected.has(t));

  function addTag(name: string) {
    const clean = name.trim();
    if (clean) { setSelected((prev) => new Set(prev).add(clean)); setInput(""); }
  }

  function handleSave() {
    const tags = [...selected];
    startTransition(async () => {
      const res = await updateFavoriteTags(favorite.id, tags);
      if (!res.ok) { toast.error("Fehler", { description: res.reason }); return; }
      onSave(tags);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-base font-semibold">Tags bearbeiten</h2>

        <div className="mb-3 flex flex-wrap gap-2">
          {[...selected].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelected((prev) => { const n = new Set(prev); n.delete(tag); return n; })}
              className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-fg"
            >
              {tag} <X className="size-3" />
            </button>
          ))}
        </div>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTag(input); }}
          placeholder="Neuer Tag…"
          className="mb-2 h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-border-strong"
        />

        {suggestions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addTag(s)}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:bg-surface-raised"
              >
                + {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleSave} disabled={isPending}>
            {isPending ? "Speichern…" : "Speichern"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Abbrechen</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Note editor bottom sheet ─────────────────────────────────────────────────

function NoteEditorSheet({
  favorite,
  onSave,
  onClose,
}: {
  favorite: RecipeFavorite;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(favorite.notes ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const res = await updateFavoriteNote(favorite.id, note);
      if (!res.ok) { toast.error("Fehler", { description: res.reason }); return; }
      onSave(note);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-base font-semibold">Persönliche Notiz</h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="z.B. weniger Salz, Kinder mögen es mit Nudeln…"
          rows={4}
          className="mb-3 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-border-strong"
        />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleSave} disabled={isPending}>
            {isPending ? "Speichern…" : "Speichern"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Abbrechen</Button>
        </div>
      </div>
    </div>
  );
}
