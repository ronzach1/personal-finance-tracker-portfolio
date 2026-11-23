# Case Study — Building a Wealth Tracker with AI

*Independent product and AI-assisted development project · 2026*

## The problem and the goal

My savings and investments were spread across several accounts and asset types. I wanted one clear view of **what I own, where it is, and how it changes**, without building a generic budgeting app.

I used that need to build a working personal product—and to learn how to deliver software by **leading AI-assisted development rather than writing every line of code myself**.

## My role and workflow

I acted as product owner and AI development orchestrator: defining requirements and financial rules, prioritizing features, turning goals into scoped implementation tasks, checking results, reviewing PRs, and coordinating testing, releases, and deployment.

AI assistants and coding agents performed substantial implementation work. Their output was not treated as automatically correct. I used Git branches and pull requests, requested corrections on the same PR, and applied more intensive review and regression testing to changes affecting financial calculations or persistent data.

The result is a single-user, Hebrew/English wealth and portfolio tracker with consolidated asset views, ILS/USD valuation, selected Israeli and foreign security lookup, portfolio exposure, snapshots, external money flows, internal transfers, and backup/restore. It uses TypeScript, React, Vite/Vinext, Cloudflare D1, and Drizzle.

## A consequential financial correctness decision

A dashboard can easily display a compelling but misleading number. Suppose tracked wealth rises by ₪10,000 after a ₪10,000 contribution from outside the app. That is **not** ₪10,000 of investment profit. Moving cash between two already-tracked accounts is not an external contribution either.

We deliberately separated:
- **Wealth change:** current tracked wealth versus the latest snapshot from an earlier Jerusalem calendar day.
- **External flows:** money entering or leaving the tracked portfolio; internal transfers remain separate.
- **Residual change:** wealth change minus recorded net external flows, only where historical tracking coverage permits it—and explicitly **not** labeled investment return.
- **Current unrealized gain/loss:** eligible current holdings versus known purchase cost, with missing cost basis and incomplete coverage disclosed. It is not lifetime performance.

These definitions became documented domain rules and regression tests. Persistent financial writes and backup restores were also designed and tested to avoid partial updates.

**The lesson:** defining what a metric really means mattered more than how impressive it looked.

## Verification and iteration

I combined code review, automated lint/build/test checks, synthetic-data QA, and desktop/mobile checks in both languages.

An instructive example: an earlier “Unclassified last” sorting fix addressed portfolio summaries and filters, but not the actual table rows. Reviewing the real behavior exposed the omission; the next release fixed it. An AI-generated solution could pass checks and still miss the user's intended workflow.

The repository reached a tagged **v1.2.0** release, with an additional later fix to Israeli mutual-fund pricing and atomic saves.

## Discovery and product judgment

I also tested whether this personal tool could serve other Israeli investors. In an exploratory round of **three interviews and four external survey responses**, people did track wealth through spreadsheets and separate financial systems—but several were already satisfied with those approaches. Another interview revealed a different potential need: reviewing pension products and adviser fees.

This was a tiny, selective sample, not market validation. I had no credible evidence yet of switching behavior, retention, or willingness to pay. Rather than build speculative features or claim startup traction, I kept the tool for personal use.

## Outcome and limits

I built a usable application and practiced turning an ambiguous goal into scoped, reviewed, tested software with AI. The project demonstrates **product thinking, AI orchestration, financial-domain reasoning, QA, and evidence-based prioritization**.

It is **not** a commercial launch, public multi-user service, automatic bank aggregator, full assets-minus-liabilities balance sheet, or regulated investment adviser.

**What I would change:** begin user discovery earlier and write acceptance criteria as carefully as implementation instructions.

---

[Project README](../README.md) · [Financial domain rules](DOMAIN.md)
