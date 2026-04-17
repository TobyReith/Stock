# Architecture Decision Records

Kurze, datierte Notizen zu wichtigen Entscheidungen. Neueste oben.

---

## ADR-0006 — Dark Mode via `next-themes`, System-Default

- **Datum:** 2026-04-16
- **Status:** Accepted

`next-themes` liefert SSR-sicheres System-Preference-Tracking + später einfachen User-Toggle. Alternative wäre `prefers-color-scheme`-CSS-only — funktioniert, aber lässt sich nicht override-n. shadcn-Theming ist ohnehin class-basiert (`.dark`-Klasse), passt also direkt.

---

## ADR-0005 — PWA: Next.js-native statt `next-pwa`

- **Datum:** 2026-04-16
- **Status:** Accepted

`next-pwa` ist seit 2023 nicht mehr aktiv gepflegt (verletzt Briefing: „keine verwaisten Packages"). Next.js App Router unterstützt Manifest (`app/manifest.ts`) + Service Worker nativ. Fallback auf `@serwist/next` möglich, falls Caching-Strategien komplex werden.

Phase 0: Minimal-SW mit Navigation-Fallback auf Root. Laufzeit-Caching (items) in Phase 1.

---

## ADR-0004 — shadcn-Preset `base-nova` (Base UI) statt Radix

- **Datum:** 2026-04-16
- **Status:** Accepted

shadcn-CLI (v4) defaultet auf `--preset=base-nova` → `@base-ui/react`, nicht Radix. Unterschiede:
- **Composition** per `render` prop statt `asChild`. Für Link-als-Button nutzen wir direkt `buttonVariants()` am `<Link>`.
- **Form**-Komponente (RHF-Wrapper) ist im Base-UI-Preset (noch) nicht enthalten — wir nutzen `react-hook-form` direkt mit `<Input>`/`<Label>`.

Wenn Radix-Ökosystem-Komponenten später benötigt werden (z. B. komplexe Select-Menüs), kann parallel migriert werden.

---

## ADR-0003 — Next.js 16 statt 15

- **Datum:** 2026-04-16
- **Status:** Accepted (Abweichung vom Briefing)

`create-next-app@latest` resolved seit 16.0 auf Next.js 16. Rollback auf 15 würde aktive Unterstützung kosten. Breaking Changes, die uns betreffen:

- **`middleware` → `proxy`**: Datei heißt jetzt `proxy.ts`, Funktion `proxy()`.
- **App-Router React-Canary**: schon vorher so; unverändert.

Docs sind lokal unter `node_modules/next/dist/docs/` — erste Anlaufstelle für API-Fragen.

---

## ADR-0002 — RLS-Architektur mit `security definer`-Helpern

- **Datum:** 2026-04-16
- **Status:** Accepted

`is_household_member(uuid)` und `is_household_owner(uuid)` als `security definer stable` mit fixem `search_path = public`. Grund: Policies auf `items` prüfen Mitgliedschaft → Query gegen `household_members` → das hätte ohne security-definer wiederum RLS ausgelöst und rekursiert. Execute-Rechte explizit auf `authenticated` revoked/granted.

Initial-Bootstrap des Haushalts: Policy erlaubt dem `created_by`-User, sich selbst als `owner` einzutragen. Weitere Member (Invite-Flow, Phase 2) werden per Server Action mit service_role gesetzt, damit RLS nicht ausgetrickst werden muss.

`products` ist global lesbar für `authenticated`; Schreiben ausschließlich via service_role (Server Action) — der Cache-Charakter macht die Öffnung unkritisch.

---

## ADR-0001 — Vision-Provider-Abstraktion mit Anthropic als Default

- **Datum:** 2026-04-16
- **Status:** Accepted

`src/lib/vision/extract-date.ts` kapselt die LLM-Wahl hinter einer schmalen Schnittstelle (`ExtractedDate`). Default-Provider Anthropic Claude Sonnet (laut Briefing). Provider-Swap später über eine Env-Var, ohne Call-Sites zu ändern.

(Implementierung folgt in Phase 1.)
