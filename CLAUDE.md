@AGENTS.md
## Git Workflow
- Niemals direkt auf main committen
- Für jedes Feature/Fix einen neuen Branch erstellen: feat/<name> oder fix/<name>
- Nach Implementierung: pnpm typecheck + pnpm build muessen gruen sein
- Dann commit + push + gh pr create mit aussagekraeftiger Beschreibung
- /security-review als letzten Schritt vor dem PR ausfuehren
- PRs nicht als Draft öffnen

## Design System
All UI work must follow the design system defined in `docs/design-system.md`.
Do not introduce colors, fonts, spacing, or component patterns not defined there.
When in doubt, check the spec before writing CSS or JSX.