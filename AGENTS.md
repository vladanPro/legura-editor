# Working Rules

- Read README.md and docs before implementing a new editor feature.
- Feature PRs target dev; release PRs target main from dev.
- Preserve unrelated work and never touch an operator database or secrets.
- Start with a small document-to-rendering vertical slice, not a page builder.
- Never trust submitted JSON, pasted HTML, client validation or browser DOM.
- Server validation and escaping are mandatory before publishing content.
- Keep browser editing separate from server persistence/authentication.
- Keep existing plain-text posts readable; no silent content conversion.
- Test selection, keyboard behavior and JS/no-JS fallbacks honestly.
- Do not claim planned editor features or package integrations are shipped.
