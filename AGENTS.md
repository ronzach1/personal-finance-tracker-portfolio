# Repository guidance

- Inspect the existing implementation before changing code, and keep each change narrowly scoped to the requested task.
- Do not change user-visible behavior unless explicitly requested. Treat portfolio/net-worth calculations and allocation semantics as behaviorally sensitive.
- Preserve Backup & Restore compatibility unless the task explicitly includes a migration.
- Do not add or upgrade dependencies unless required and justified. Do not suppress lint or type rules merely to make checks pass.
- Do not generate or modify database migrations unless requested.
- Never commit personal financial or other runtime data, secrets, `.env` files, or local databases.
- Prefer simple, maintainable solutions over unnecessary abstraction.
- Keep `main` clean: normally implement work in a branch or worktree and submit it through a PR.
- Before declaring implementation work complete, run `npm run lint`, `npm run build`, and `npm test`.
- Report every changed file, validation result, and meaningful behavioral risk.

## Project context

- For product-facing behavior or UX/product decisions, consult `docs/PRODUCT.md`.
- For financial calculations, valuation behavior, portfolio semantics, data-safety behavior, or other finance-domain changes, consult `docs/DOMAIN.md`.
- `docs/ROADMAP.md` provides product-direction context; do not treat it as implementation scope unless the task explicitly references it.
