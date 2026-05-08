@AGENTS.md
## Git Workflow
- Niemals direkt auf main committen
- Für jedes Feature/Fix einen neuen Branch erstellen: feat/<name> oder fix/<name>
- Nach Implementierung: pnpm typecheck + pnpm build muessen gruen sein
- Dann commit + push + gh pr create mit aussagekraeftiger Beschreibung
- /security-review als letzten Schritt vor dem PR ausfuehren
- /security-review als letzten Schritt vor dem PR ausfuehren
- PRs nicht als Draft öffnen