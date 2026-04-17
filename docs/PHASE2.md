# Phase 2 — Plan

Phase 1 hat die App funktionsfähig gemacht (scannen, anlegen, listen, abhaken,
zählen). Phase 2 macht sie *nützlich im Alltag* und *mehrbenutzertauglich*.

Reihenfolge ist nach Wert × Unabhängigkeit sortiert, aber 2.1/2.2/2.3 sind
funktional entkoppelt — lassen sich theoretisch parallel bauen.

---

## 2.1 — Push-Benachrichtigungen für MHD  ⭐ Kern-Loop

**Warum zuerst:** Ohne dies ist die App eine Liste, die man vergisst. Damit
wird sie zu der App, die einen anstupst, bevor Essen schlecht wird. Höchster
Wert-pro-Aufwand von allem in Phase 2.

**Umfang:**
- Web-Push-Subscription per Service-Worker (`public/sw.js`) + VAPID-Keys
  in `.env`.
- Tabelle `push_subscriptions` existiert bereits aus Phase 0 — keine
  Migration nötig.
- Vercel Cron täglich 07:00 UTC (≈ 09:00 Berlin, je nach DST) ruft einen
  Next.js Route-Handler `/api/cron/mhd-check` auf, der alle offenen Items
  mit `best_before` ≤ heute + 3 Tage pro User gruppiert und eine
  zusammenfassende Push-Nachricht sendet.
- Tap auf die Push → öffnet `/` (Vorrat-Liste).
- Opt-in-Toggle auf neuer Seite `/settings`.

**Risiken:**
- iOS erfordert installierte PWA + iOS 16.4+ für Push. Fallback: klaren
  Hinweis zeigen statt stummer Fehler.
- Cron-Sekret: Vercel schickt `Authorization: Bearer $CRON_SECRET`,
  Route-Handler verweigert alles andere.
- Dead-Subscriptions: Endpoint antwortet mit `410 Gone` → aus der DB
  löschen, damit der Topf sauber bleibt.

**Größe:** ~1 Wochenende.

---

## 2.2 — Multi-Haushalt & Einladungen

**Warum:** Paare und Familien teilen sich einen Vorrat. Phase 1 hat
"ein Haushalt pro User" fest verdrahtet (siehe `ensureHousehold` Invariante);
das muss weg.

**Umfang:**
- Neue Tabelle `invites(code, household_id, created_by, expires_at)`.
  Code = 6-stelliges lesbares Zeichengemisch (keine O/0/I/l), 7 Tage gültig.
- Owner erstellt einen Code in den Haushalt-Settings, teilt verbal /
  WhatsApp / E-Mail.
- Einladung einlösen via Input-Feld oder Link `/invite/[code]`.
- Household-Switcher im Header, sobald der User ≥2 Haushalte hat.
- Member kann verlassen, Owner kann Mitglieder entfernen und befördern.
- `ensureHousehold` wird zu einem "pick active" Schritt: wenn der User
  bereits Mitglied ist, keinen neuen Haushalt anlegen.

**Risiken:**
- RLS für `invites` sauber: nur Owner schreibt, jeder authentifizierte User
  kann per Code lesen (nur wenn er ihn weiß).
- Rate-Limit auf Code-Einlösen gegen Brute-Force (z.B. max 5 Versuche / 10 Min
  per User) — wahrscheinlich reicht die Code-Entropie (6 Zeichen aus 32 = ~30
  Bit), aber lieber mit Gurt.
- Active-Household-State: Cookie oder DB-Spalte auf `auth.users.metadata`?
  Ich tendiere zu Cookie, weil es pro-Gerät sein sollte.

**Größe:** 1–2 Wochenenden.

---

## 2.3 — Einkaufsliste

**Warum:** Schließt den "verbraucht → nachkaufen → wieder im Vorrat"-Loop.
Ohne Einkaufsliste muss der User zwischen Stock und einer separaten
Notiz-App hin und her wechseln.

**Umfang:**
- Neue Tabelle `shopping_list_items(id, household_id, product_id?,
  custom_name, quantity, unit, note, added_by, added_at, bought_at)`.
- Bottom-Nav erweitert auf 4 Tabs: **Vorrat / Hinzufügen / Einkauf / Stats**.
  Daumenreichweite auf 360px-Handys ist noch ok.
- Im Item-Detail: "Auf Einkaufsliste" Button (pre-fills Produkt + letzte
  Menge).
- Einkaufsliste: Items anti-tippen beim Einkaufen, `bought_at` setzen,
  beim Heimkommen Tap "Gekauft → zum Vorrat" springt in den Add-Flow mit
  den Produkt-Defaults (MHD aus Kategorie).

**Größe:** ~1 Wochenende.

---

## 2.4 — Qualitäts-Polish

**Warum:** Nach 2.1–2.3 werden die Kanten sichtbar. Sammel-Package, das
in einem PR oder in 4 Mini-PRs landet, je nachdem was review-freundlicher ist.

**Umfang:**
- **Canvas-Downscale vor MHD-Upload** (spawned task aus PR 1.5, nicht
  gemerged) — 1600px lange Kante, Datei ~5× kleiner, 5MB-Limit wird
  irrelevant.
- **Delete-Action** im Item-Detail (nicht nur close) — für falsch
  angelegte Artikel.
- **Undo-Toast** auf Consume/Discard — "Artikel als verbraucht markiert ·
  Rückgängig" für 5s.
- **Produkt-Felder editieren** im Item-Detail — wenn Open Food Facts Mist
  geliefert hat (passiert oft mit deutschen Marken).
- **Settings-Seite vervollständigen** — Theme-Toggle, Logout, Account
  löschen (Push-Opt-in kommt schon aus 2.1).

**Größe:** ~1 Wochenende oder 4 Mini-PRs.

---

## Auf Phase 3 verschoben

- **Voice-Input:** War in der README, aber Web Speech API auf iOS
  unzuverlässig und Kassenbon-OCR gibt wahrscheinlich bessere UX für den
  Use-Case "schnell viel eingeben".
- **Rezept-Vorschläge** ("Was kann ich aus den bald-fälligen Items
  kochen?"): Cool, aber reines Nice-to-have. Nutzt dieselbe Vision-/LLM-
  Infrastruktur — gut für Phase 3.
- **Kassenbon-OCR** als Batch-Add: Hoher Wert, aber nicht-trivial
  (Tabellen-Layout-Erkennung, Artikel-Matching gegen Cache). Phase 3.
