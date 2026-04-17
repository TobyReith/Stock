# Stock

Vorratskammer-PWA für deutschsprachige Haushalte: Barcode scannen, MHD im Blick behalten, weniger Lebensmittel wegwerfen.

> Status: **Phase 2** — nach dem Abschluss der Basisfunktionen (Scannen, Listen, Stats) folgt jetzt der Push-Reminder-Loop und Multi-Haushalt. Plan: [`docs/PHASE2.md`](./docs/PHASE2.md).

## Tech-Stack

- **Frontend:** Next.js (App Router, TypeScript strict, Turbopack) · React 19 · Tailwind CSS v4 · shadcn/ui (Base UI variant, neutral theme) · `next-themes`
- **Backend:** Supabase (Postgres + RLS, Auth, Storage, Edge Functions) · Region `eu-central-1` (Frankfurt)
- **Hosting:** Vercel (Preview je PR, Prod auf `main`)
- **Scanner:** `@zxing/browser` (+ native `BarcodeDetector` fallback — Phase 1)
- **Produktdaten:** Open Food Facts API v2
- **MHD-OCR:** Multimodales LLM via Server Action, Abstraktion in `src/lib/vision/` (Default-Provider: Anthropic Claude)
- **Validation:** Zod · **Forms:** React Hook Form · **Toasts:** Sonner

## Setup

Voraussetzungen: Node 20+, pnpm 10+, Supabase-Account, Vercel-Account.

```bash
git clone git@github.com:TobyReith/Stock.git
cd Stock
pnpm install
cp .env.example .env.local   # und Werte füllen
pnpm dev
```

Öffne [http://localhost:3000](http://localhost:3000).

### Env-Vars

Siehe [`.env.example`](./.env.example). Der Supabase-**Service-Role-Key** und der **Anthropic-API-Key** müssen manuell aus den jeweiligen Dashboards geholt werden; alle anderen sind entweder public oder werden per Script generiert.

## Scripts

| Script | Zweck |
| --- | --- |
| `pnpm dev` | Dev-Server (Turbopack) |
| `pnpm build` | Produktions-Build |
| `pnpm start` | Produktions-Server lokal |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm supabase:types` | Supabase-Typen regenerieren |

## Projektstruktur

```
src/
  app/            Next.js App Router (routes, layouts, route handlers)
  components/     UI-Komponenten (shadcn/ui in components/ui, eigenes daneben)
  lib/
    supabase/     Supabase-Clients (browser, server, session-refresh-helper)
    vision/       MHD-OCR-Provider-Abstraktion (Phase 1)
    constants/    Smart Defaults, Konfig
supabase/
  migrations/     versionierte SQL-Migrations
public/
  icons/          PWA-Icons
  sw.js           Minimal Service Worker
```

## Entscheidungen

Siehe [`ADR.md`](./ADR.md) für Architecture Decision Records.

## Contributing

Siehe [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Roadmap

- **Phase 0** ✓ Repo, Auth-Grundgerüst, DB-Schema mit RLS, PWA-Basis, CI/Deploy
- **Phase 1** ✓ Add-Flow (Barcode, MHD-Foto, Fallbacks), Hauptliste, Item-Detail, Basis-Stats
- **Phase 2** Web Push, Multi-Haushalt & Einladungen, Einkaufsliste, Qualitäts-Polish — siehe [`docs/PHASE2.md`](./docs/PHASE2.md)
- **Phase 3** Rezept-Vorschläge, Kassenbon-OCR, Voice-Input, CSV-Export
