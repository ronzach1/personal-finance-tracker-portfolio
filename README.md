# Personal Finance Tracker

**An AI-assisted, full-stack application for tracking personal wealth and investments.**

I built this project to bring a fragmented financial picture—bank and brokerage accounts, securities, crypto, pension balances, deposits, and other assets—into one understandable view. It began as a personal tool and became a practical exercise in **turning product requirements into a working application with AI-assisted engineering**.

**Project status:** Public, sanitized source snapshot of a privately maintained, single-user application. This repository contains no real portfolio records, credentials, or production database. It is provided for code and product-work review, not as a public hosted service.

[**Read the project case study →**](docs/CASE_STUDY.md) — product decisions, my AI development workflow, an example of financial correctness work, and what early user research taught me.

## What the application does

- **Wealth overview:** consolidated tracked asset value, composition, liquidity, and largest holdings.
- **Investment portfolio:** holdings across accounts, classification by geography/sector, and current unrealized gain/loss against *known purchase cost*, with clear coverage limits.
- **Financial records:** cash balances, supported securities and crypto, manually valued pensions and assets, and calculated fixed-rate deposits.
- **History and money movements:** daily snapshots, explicitly recorded external contributions/withdrawals, and internal transfers that are not misclassified as new wealth.
- **Israeli context:** Hebrew/English interface, ILS/USD valuations, and security discovery/pricing for selected supported Israeli and foreign instruments, with manual fallback.
- **Data safety:** backup/restore, archival, validation, and an internal audit trail.

This is **not** a bank-connection aggregator, investment adviser, budgeting suite, or complete liabilities-based balance sheet. Its current gain/loss-versus-cost metric is not a full historical investment return.

## How I built it with AI

This project demonstrates **product ownership and AI-assisted software delivery**, not a claim that I hand-coded every component.

My role included identifying the problem, defining behavior and edge cases, prioritizing scope, writing and refining implementation briefs for AI coding agents, reviewing the resulting changes, organizing validation, and managing pull requests, releases, and deployment. AI agents performed substantial coding and implementation work; I treated their output as work to verify rather than as automatically correct.

Examples of decisions and review work:
- Distinguishing **wealth change**, **external cash flows**, and **investment performance** rather than presenting misleading financial numbers.
- Preserving intentionally unknown cost basis instead of inventing a gain/loss figure.
- Testing data persistence and backup-restore compatibility before releases.
- Finding and correcting a Portfolio sorting issue that an earlier change had only partially addressed.

The longer [case study](docs/CASE_STUDY.md) explains the workflow and its limitations.

## Stack

| Area | Technology |
| --- | --- |
| Application | TypeScript, React, Next.js / Vinext, Vite |
| UI | Tailwind CSS, bilingual Hebrew/English interface |
| Backend and storage | Cloudflare/Sites, Cloudflare D1 (SQLite), Drizzle ORM |
| Tooling and delivery | Node.js 24, npm, Git/GitHub, pull requests, automated tests |

## Portfolio snapshot, privacy, and limitations

This is a curated snapshot of a privately maintained project. Its original development history and pull requests are intentionally not included because a historical commit contained a credential. The original repository, deployment, and financial records remain private. The examples and tests use synthetic data.

**Security boundary:** The application relies on trusted authentication headers supplied by ChatGPT Sites. Do not expose a self-hosted instance to the internet without first implementing and testing an independent authentication and authorization boundary. The development-mode local user fallback is for local use only. The included hosting manifest is a placeholder without a production project identifier; no deployment or database is bundled. No software license is granted by this repository; contact the author for permission to reuse code.

## Development

**Requirements:** Node.js 24 LTS (`24.x`, see `.node-version`) and npm.

```sh
npm ci
npm run dev
```

Run the repository checks before submitting implementation work:

```sh
npm run lint
npm run build
npm test
```

`npm test` builds and validates the deployable artifact, then runs the test suite, including rendered-artifact checks.

### Data and environments

Portfolio data lives in the **runtime database**, not in Git. Use **Settings → Backup and restore** before moving, resetting, or replacing an environment; restoring a backup replaces the existing tracked portfolio.

Cloudflare D1 is configured via `.openai/hosting.json`, with the local development binding mirrored in `vite.config.ts`. Drizzle schema and migrations are in `db/schema.ts` and `drizzle/`. Generate migrations only for intentionally scoped schema changes (`npm run db:generate`).

TASE share/equity-ETF discovery is optional and requires a server-side `TASE_API_KEY`; never expose the key in browser code or commit it. Other supported discovery paths can operate without it. Prices and quotes may be unavailable or stale; manual valuation remains supported.

`npm run install:ci` is the stricter Sites-oriented installation workflow. The project uses cross-platform scripts with scoped runtime/cache/temp paths; disposable deployment output stays inside the checkout.

## Project scripts

| Command | Purpose |
| --- | --- |
| `npm ci` | Install lockfile-pinned dependencies. |
| `npm run install:ci` | Sites-specific guarded installation. |
| `npm run dev` | Start local development. |
| `npm run lint` | Run ESLint. |
| `npm run build` | Build and validate the deployable artifact. |
| `npm test` | Build, validate and run tests. |
| `npm run start` | Serve the built application. |
| `npm run validate:artifact` | Validate an existing build artifact. |
| `npm run db:generate` | Generate Drizzle migrations for an approved schema change. |

For detailed financial definitions and limitations, see [Domain Rules](docs/DOMAIN.md).

## References

- [Vinext](https://github.com/cloudflare/vinext)
- [Cloudflare D1 with Drizzle](https://orm.drizzle.team/docs/get-started/d1-new)
