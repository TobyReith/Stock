# Contributing

## Arbeitsweise

- Wir arbeiten in **Phasen** laut [`README.md`](./README.md#roadmap). Eine Phase endet mit einer Zusammenfassung und einer bewussten Go/No-Go-Entscheidung, bevor die nächste startet.
- **Kleine PRs**, auch bei Solo-Arbeit — so bekommt jedes Stück einen Vercel-Preview-Deploy.
- **Conventional Commits** für alle Commit-Messages (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`). Scope in Klammern, wenn hilfreich: `feat(auth): …`.
- Jeder Commit soll reversibel und sinnvoll für sich stehen.

## Branches

- `main` ist geschützt, PR-only.
- Feature-Branches: `feat/<kurzname>`, `fix/<kurzname>`, `chore/<kurzname>`.

## Qualitäts-Checks vor jedem PR

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Alle drei müssen grün sein. Für UI-Änderungen: lokal im Browser getestet (Chrome + Safari/iOS-Simulator wenn greifbar).

## Supabase

- DB-Änderungen ausschließlich über `supabase/migrations/<timestamp>_<name>.sql`.
- Nach Schema-Änderung: `pnpm supabase:types` ausführen, Änderung committen.
- RLS-Policies sind Pflicht. Neue Tabellen starten deny-all, Policies werden explizit dokumentiert.

## UX-Prinzipien

- Mobile first, einhändig bedienbar, wichtige Aktionen in der unteren Bildschirmhälfte.
- Deutsch als Default-Sprache.
- Add-Flow bleibt das schärfste UX-Ziel: 3–5 Sekunden für einen Artikel mit Barcode.

## Secrets

Niemals in den Code pushen. `.env.local` ist gitignored — nutze `.env.example` als Vorlage.
