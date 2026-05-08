# Stock Design System

Version 1.0 · Stand: Mai 2026

> **Für Claude Code:** Dieses Dokument gilt für jede UI-Aufgabe ohne Ausnahme.
> Führe keine Farben, Schriften, Abstände oder Komponentenmuster ein, die hier nicht definiert sind.
> Bei Unklarheiten: lieber nachfragen als abweichen.

---

## Prinzipien

Stock ist **zweckorientiert, minimalistisch, intuitiv**. Das bedeutet konkret:

- Jedes Element hat einen Grund zu sein. Kein dekoratives Rauschen.
- Farbe transportiert Bedeutung, nicht Stimmung. Sage-Grün = Primäraktion oder positiver Status. Rot = Problem. Alles andere ist Neutral.
- Typografie ist Hierarchie, nicht Dekoration. Serif nur für Überschriften.
- Abstände kommen aus dem Grid. Nie Pixelwerte außerhalb der Skala.

---

## Setup

### Schriften – Google Fonts Import (in `globals.css`)

```css
@import url("https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap");
```

### Tailwind v4 Tokens (in `globals.css`, innerhalb `@theme {}`)

```css
@theme {
  /* ── Schriften ──────────────────────────────────────────── */
  --font-serif: 'Lora', Georgia, serif;
  --font-sans:  'DM Sans', system-ui, sans-serif;
  --font-mono:  'DM Mono', monospace;

  /* ── Sage-Palette ───────────────────────────────────────── */
  --color-sage-50:  #EEF7F3;
  --color-sage-100: #D4EDE5;
  --color-sage-200: #A8D7C8;
  --color-sage-300: #7BBFAA;
  --color-sage-400: #569F8A;
  --color-sage-500: #3F8171;
  --color-sage-600: #30655A;
  --color-sage-700: #224A42;
  --color-sage-800: #15302B;
  --color-sage-900: #0A1916;

  /* ── Neutral-Palette ────────────────────────────────────── */
  --color-neutral-0:   #FFFFFF;
  --color-neutral-50:  #F7F8F9;
  --color-neutral-100: #EFF0F2;
  --color-neutral-200: #E1E4E8;
  --color-neutral-300: #C8CDD5;
  --color-neutral-400: #A2AABB;
  --color-neutral-500: #717D8F;
  --color-neutral-600: #4D5869;
  --color-neutral-700: #313C4B;
  --color-neutral-800: #1E252F;
  --color-neutral-850: #161C24;
  --color-neutral-900: #111318;

  /* ── Semantische Tokens (Light-Mode-Defaults) ───────────── */
  --color-background:        #F7F8F9;
  --color-surface:           #FFFFFF;
  --color-surface-raised:    #EFF0F2;
  --color-border:            #E1E4E8;
  --color-border-strong:     #C8CDD5;
  --color-foreground:        #1E252F;
  --color-muted:             #717D8F;
  --color-primary:           #7BBFAA;
  --color-primary-fg:        #15302B;
  --color-primary-subtle:    #EEF7F3;
  --color-primary-text:      #3F8171;
  --color-danger:            #C0392B;
  --color-danger-subtle:     #FFE8E5;
  --color-warning:           #9A5E00;
  --color-warning-subtle:    #FFF3DC;
}

/* ── Dark Mode ──────────────────────────────────────────────── */
.dark {
  --color-background:        #111318;
  --color-surface:           #161C24;
  --color-surface-raised:    #1E252F;
  --color-border:            #313C4B;
  --color-border-strong:     #4D5869;
  --color-foreground:        #EFF0F2;
  --color-muted:             #A2AABB;
  --color-primary:           #7BBFAA;
  --color-primary-fg:        #15302B;
  --color-primary-subtle:    #0D201A;
  --color-primary-text:      #7BBFAA;
  --color-danger:            #F08080;
  --color-danger-subtle:     #3D1A18;
  --color-warning:           #F0B429;
  --color-warning-subtle:    #3A2A0A;
}
```

---

## Farben

### Semantische Tokens – immer diese verwenden, nie Rohwerte aus der Palette

| Token                    | Light              | Dark               | Verwendung                          |
|--------------------------|--------------------|--------------------|-------------------------------------|
| `background`             | neutral-50         | neutral-900        | Seitenuntergrund                    |
| `surface`                | neutral-0          | neutral-850        | Karten, Modals, Popovers            |
| `surface-raised`         | neutral-100        | neutral-800        | Hover-States, erhöhte Flächen       |
| `border`                 | neutral-200        | neutral-700        | Trennlinien, Input-Rahmen           |
| `border-strong`          | neutral-300        | neutral-600        | Aktive Rahmen, Fokus-Ringe          |
| `foreground`             | neutral-800        | neutral-100        | Primärtext                          |
| `muted`                  | neutral-500        | neutral-400        | Sekundärtext, Placeholder, Icons    |
| `primary`                | sage-300           | sage-300           | Primär-Button-Hintergrund           |
| `primary-fg`             | sage-800           | sage-800           | Text auf Primary-Hintergrund        |
| `primary-subtle`         | sage-50            | #0D201A            | Tag-/Badge-Hintergrund (positiv)    |
| `primary-text`           | sage-500           | sage-300           | Text auf primary-subtle             |
| `danger`                 | #C0392B            | #F08080            | Fehlermeldungen, ablaufend          |
| `danger-subtle`          | #FFE8E5            | #3D1A18            | Danger-Badge-Hintergrund            |
| `warning`                | #9A5E00            | #F0B429            | Warnhinweise, bald ablaufend        |
| `warning-subtle`         | #FFF3DC            | #3A2A0A            | Warning-Badge-Hintergrund           |

### Sage-Palette (Rohwerte – nur für spezifische Übergangs-States)

| Stufe | Hex       | Verwendung                                  |
|-------|-----------|---------------------------------------------|
| 50    | #EEF7F3   | primary-subtle (Light)                      |
| 100   | #D4EDE5   | —                                           |
| 200   | #A8D7C8   | —                                           |
| **300** | **#7BBFAA** | **Primary (Button, Akzent) – Hauptwert** |
| 400   | #569F8A   | Hover-State von Primary                     |
| 500   | #3F8171   | primary-text (Light), Icons auf hellem Grund |
| 800   | #15302B   | primary-fg (Text auf sage-300-Fläche)       |

### Regeln

- Verwende immer semantische Tokens (`text-foreground`, `bg-surface`), nicht Rohpalettenwerte.
- Sage-Farben außerhalb des Primary-Bereichs (z.B. sage-200 als Trennlinie) sind **nicht erlaubt**.
- Kein `text-white` oder `text-black` – immer `text-foreground` oder `text-primary-fg`.

---

## Typografie

### Schriften

| Schrift    | Einsatz                                        | Tailwind-Klasse |
|------------|------------------------------------------------|-----------------|
| **Lora**   | Display, H1, H2 – ausschließlich               | `font-serif`    |
| **DM Sans**| H3, H4, Body, Label, Caption, UI-Elemente      | `font-sans`     |
| **DM Mono**| Mengen, Daten, EAN, Codes, technische Werte    | `font-mono`     |

**Lora niemals unter 22px verwenden.** Unterhalb dieser Größe immer DM Sans.

### Typografische Skala

| Stufe   | Schrift  | Größe | Weight | Line Height | Klassen                                    |
|---------|----------|-------|--------|-------------|--------------------------------------------|
| Display | Lora     | 48px  | 400    | 1.1         | `font-serif text-5xl font-normal leading-tight` |
| H1      | Lora     | 34px  | 400    | 1.15        | `font-serif text-[34px] font-normal`       |
| H2      | Lora     | 26px  | 500    | 1.25        | `font-serif text-[26px] font-medium`       |
| H3      | DM Sans  | 20px  | 600    | 1.3         | `text-xl font-semibold`                    |
| H4      | DM Sans  | 16px  | 600    | 1.4         | `text-base font-semibold`                  |
| Body L  | DM Sans  | 17px  | 400    | 1.6         | `text-[17px] leading-relaxed`              |
| Body    | DM Sans  | 15px  | 400    | 1.6         | `text-[15px] leading-relaxed`              |
| Label   | DM Sans  | 13px  | 500    | 1.4         | `text-[13px] font-medium`                  |
| Caption | DM Sans  | 12px  | 400    | 1.4         | `text-xs`                                  |
| Mono    | DM Mono  | 13px  | 400    | 1.5         | `font-mono text-[13px]`                    |

### Letter Spacing

- Überschriften (Lora): `tracking-tight` (−0.02em)
- UI-Labels in Uppercase (z.B. Sektions-Header): `tracking-widest` + `uppercase` + `text-xs font-semibold`
- Alles andere: kein explizites Tracking

---

## Abstände

### 4px-Grid

Alle Abstände sind Vielfache von 4px. Tailwind v4 verwendet standardmäßig rem, 1 unit = 4px.

| Token    | px  | Tailwind  | Verwendung                                      |
|----------|-----|-----------|-------------------------------------------------|
| space-1  | 4   | `p-1`     | Innen-Padding kleiner Icons, Chips              |
| space-2  | 8   | `p-2`     | Kompakte Elemente, Gap zwischen Icons und Text  |
| space-3  | 12  | `p-3`     | Chip-Padding, enge Listen                       |
| space-4  | 16  | `p-4`     | Standard-Padding für Karten und Inputs          |
| space-5  | 20  | `p-5`     | —                                               |
| space-6  | 24  | `p-6`     | Section-Padding, großzügige Karten              |
| space-8  | 32  | `p-8`     | Seitenränder auf Mobile                         |
| space-10 | 40  | `p-10`    | —                                               |
| space-12 | 48  | `p-12`    | Vertikale Sections                              |
| space-16 | 64  | `p-16`    | Hero-Abstände                                   |
| space-20 | 80  | `p-20`    | Sehr großzügige vertikale Abstände              |

Kein `p-[14px]`, `mt-[22px]` oder ähnliche Willkürwerte. Immer den nächsten Grid-Wert nehmen.

### Border Radius

| Name | Wert    | Tailwind       | Verwendung                         |
|------|---------|----------------|------------------------------------|
| sm   | 4px     | `rounded`      | Tags, kleine Badges                |
| md   | 8px     | `rounded-lg`   | Buttons, Inputs                    |
| lg   | 12px    | `rounded-xl`   | Karten, Modals                     |
| xl   | 16px    | `rounded-2xl`  | große Karten, Bottom-Sheets        |
| 2xl  | 24px    | `rounded-3xl`  | Sparsam, z.B. prominente Cards     |
| full | 9999px  | `rounded-full` | Chips, Avatare, Pill-Buttons       |

---

## Komponenten

### Button

```tsx
// Primary
<button className="bg-primary text-primary-fg rounded-lg px-4 py-2 text-[14px] font-medium
  hover:bg-sage-400 transition-colors">
  Hinzufügen
</button>

// Secondary
<button className="bg-surface-raised text-foreground border border-border rounded-lg px-4 py-2
  text-[14px] font-medium hover:bg-border transition-colors">
  Abbrechen
</button>

// Ghost
<button className="text-muted rounded-lg px-4 py-2 text-[14px] font-medium
  hover:bg-surface-raised transition-colors">
  Mehr anzeigen
</button>

// Destructive
<button className="bg-danger-subtle text-danger rounded-lg px-4 py-2 text-[14px] font-medium
  hover:opacity-90 transition-opacity">
  Löschen
</button>
```

### Input

```tsx
<div className="flex flex-col gap-1.5">
  <label className="text-[13px] font-medium text-foreground">
    Produktname
  </label>
  <input
    className="bg-surface border border-border rounded-lg px-3 py-2 text-[15px]
      text-foreground placeholder:text-muted
      focus:outline-none focus:border-border-strong
      transition-colors"
    placeholder="z.B. Bio-Vollmilch"
  />
</div>
```

### MHD-Badge (Chip)

```tsx
// Frisch (>7 Tage)
<span className="bg-primary-subtle text-primary-text text-[12px] font-medium
  px-3 py-1 rounded-full">
  Frisch · 14 Tage
</span>

// Bald ablaufend (1–7 Tage)
<span className="bg-warning-subtle text-warning text-[12px] font-medium
  px-3 py-1 rounded-full">
  Bald ablaufend · 3 Tage
</span>

// Abgelaufen
<span className="bg-danger-subtle text-danger text-[12px] font-medium
  px-3 py-1 rounded-full">
  Abgelaufen
</span>

// Kein MHD
<span className="bg-surface-raised text-muted text-[12px] font-medium
  px-3 py-1 rounded-full">
  Kein MHD
</span>
```

### Karte (Vorrats-Item)

```tsx
<div className="bg-surface border border-border rounded-xl overflow-hidden">
  {/* Hauptbereich */}
  <div className="flex items-center gap-3 p-4">
    {/* Icon */}
    <div className="w-11 h-11 bg-surface-raised rounded-[10px] flex items-center
      justify-content-center text-[22px] shrink-0">
      🥛
    </div>
    {/* Info */}
    <div className="flex-1 min-w-0">
      <div className="text-[15px] font-medium text-foreground leading-snug">
        Bio-Vollmilch
      </div>
      <div className="text-[13px] text-muted mt-0.5">
        Berchtesgadener Land · 1 L
      </div>
    </div>
    {/* Status */}
    <div className="shrink-0 text-right">
      <MhdBadge daysLeft={2} />
      <div className="text-[12px] text-muted mt-1.5">× 2 Stück</div>
    </div>
  </div>
  {/* Footer */}
  <div className="border-t border-border px-4 py-2 flex justify-between items-center">
    <span className="text-[12px] text-muted">📦 Kühlschrank</span>
    <span className="text-[12px] text-muted font-mono">MHD 09.05.2026</span>
  </div>
</div>
```

### Kategorie-Tag

```tsx
<span className="bg-surface-raised text-muted text-[12px] font-medium
  px-3 py-1 rounded-full">
  🥛 Milch & Käse
</span>
```

### Sektions-Header (Label über Gruppen)

```tsx
<div className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">
  Heute ablaufend
</div>
```

---

## Ikonografie

- Icon-Bibliothek: `lucide-react` (bereits im Stack)
- Standardgröße: `size={18}` für Inline-Icons, `size={20}` für Button-Icons
- Farbe: immer `text-muted` oder `text-foreground`, nie Sage oder Semantic-Farben für rein dekorative Icons
- Keine gefüllten Icons neben Outline-Icons mischen

---

## Dark Mode

Next.js + Tailwind v4: Dark Mode via `.dark`-Klasse auf `<html>`. Die semantischen Tokens (siehe Setup) schalten automatisch um. **Nie `dark:text-white` oder `dark:bg-gray-900`** – immer die semantischen Token-Klassen, die bereits dark-aware sind.

```tsx
// ✅ Richtig – dark-aware durch semantische Tokens
<div className="bg-background text-foreground" />

// ❌ Falsch – hardcodierte Farben
<div className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white" />
```

---

## Verbotene Patterns

Diese Dinge dürfen nicht eingeführt werden:

| Verboten                                      | Stattdessen                          |
|-----------------------------------------------|--------------------------------------|
| Tailwind-Standardfarben (`gray-*`, `green-*`) | Semantische Tokens (`foreground`, `primary`) |
| Inline-Styles mit Farbwerten                  | Tailwind-Klassen mit Token-Referenzen |
| `font-bold` für Fließtext                     | Maximal `font-semibold`, nur für H3/H4 |
| Lora unter 22px                               | DM Sans für alles unter 22px         |
| Abstände außerhalb der Skala (z.B. `mt-[14px]`) | Nächstgelegener Grid-Wert (`mt-3` oder `mt-4`) |
| `rounded-none` (außer bei explizitem Flush-Kontext) | `rounded` (4px) als Minimum       |
| Neue Farben für neue Zustände erfinden        | Bestehende Semantic-Tokens kombinieren |
| `shadow-*` für Tiefe/Elevation               | `border` + `bg-surface-raised` für Elevation |

---

## Versionierung

Änderungen an diesem Dokument erfordern eine bewusste Entscheidung. Kein Commit sollte Farben, Schriften oder Abstände außerhalb dieser Spec einführen, ohne die Spec gleichzeitig zu aktualisieren.
