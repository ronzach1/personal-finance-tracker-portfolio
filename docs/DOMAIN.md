# Domain Rules

These are product semantics, not implementation details.

## Wealth and valuation

- Archived accounts and holdings are excluded from tracked wealth.
- The application currently represents assets, not a complete assets/liabilities balance sheet.
- ILS and USD are the primary currencies.
- USD values are converted using the tracked USD/ILS rate where applicable.
- Israeli prices entered or received in agorot must be normalized consistently.
- Cash and holdings belong to accounts; values must not be accidentally duplicated.
- An account's optional annual management fee is a percentage of assets per year, stored as informational metadata only. Null means unknown; zero means explicitly no fee. It never deducts wealth, changes holdings or current investment P/L, estimates fees paid, or creates money flows. Fee-only edits are audited without refreshing snapshots.
- Manual valuation is a valid fallback.
- Pension balances are manually entered, normally locked, and are not modeled as underlying securities.
- Fixed-rate deposits accrue as calculated economic value using ACT/365, stop accruing at maturity, and remain informationally subject to the user's accessibility classification. Deposit principal must not also be counted as account cash.
- An explicitly unknown cost basis is valid portfolio state: it remains visibly unknown but is not an unresolved Data Check warning until a real cost basis is entered.
- Explicitly unclassified geography and sector are valid, independent portfolio states for exposure-eligible holdings; they remain visibly unclassified without being warnings.
- A manual-price acknowledgement means the price was reviewed for now. It becomes stale again after the normal interval, and unrelated holding edits do not refresh that review date.
- Automatic market-data paths include Yahoo for supported USD stocks/ETFs, Keren44 for supported ILS equity index-tracking mutual funds and money-market funds, and official TASE discovery for ordinary shares, REITs, and equity ETFs that Yahoo can value. TASE remains the canonical identity; its validated Yahoo `.TA` locator is stored separately, and Yahoo `ILA` closes are normalized from agorot to ILS at the provider boundary. TASE bond ETFs and all other TASE security types remain out of scope. Keren44 ETFs, leveraged funds, hedge funds, bond/non-equity trackers, and other active mutual funds remain manual-price assets.
- Provider or FX failure must not silently replace a previous valid value with zero. Preserve the prior valid value where possible and surface the failure.

## Current investment gain/loss versus cost

- Current unrealized investment P/L covers actively held securities and crypto with positive quantity, a valid current price, and a known positive average purchase price. Intentionally unknown cost basis is excluded even if a numeric cost is present. Cash, pensions, deposits, and generic manual assets do not participate.
- Native purchase cost is quantity × average purchase price. Native P/L is current native value minus that cost. Both USD cost and P/L are translated at the current tracked USD/ILS rate; ILS amounts are used directly.
- Aggregate P/L percentage is total covered P/L divided by total covered purchase cost, not an average of holding percentages. Coverage amounts compare the current value of covered holdings with the current value of all otherwise-eligible holdings. Missing current valuations use a holding-count coverage note instead.
- No covered holdings means unavailable, not zero. A zero current price retains the existing missing-value meaning rather than implying a total loss.
- This is not lifetime return: historical FX effects, realized gains, dividends, fees and transaction timing are not reconstructed. This metric does not change snapshots, tracked wealth, recorded external flows, or remaining-change attribution.

## Change and history

- Overview `Change` compares current tracked wealth with the newest snapshot from an earlier `Asia/Jerusalem` calendar day.
- External wealth flows are positive money in or withdrawals out across the boundary of all tracked wealth. Transfers between tracked accounts, trades, and corrections are not external flows.
- When the comparison snapshot is fully covered by the durable flow-tracking baseline, wealth change is separated into net external flow and remaining/residual change. The residual is not investment return.
- Periods beginning before the tracking baseline must not receive a fabricated attribution breakdown.
- Historical daily boundaries use `Asia/Jerusalem`.
- At most one canonical daily snapshot should exist per Jerusalem calendar day.
- Geography and sector apply conservatively to equity-style securities such as stocks, ETFs, and equity index funds.
- Geography and sector are not generally required for cash, deposits, money-market funds, bonds/bond funds, crypto, and other non-equity assets.
- Pensions and deposits count in tracked wealth, account/accessibility/currency composition, and snapshots, but not in geography or sector exposure. Time-based deposit accrual is valuation change, not an external wealth flow or an audit mutation.

## Data safety

- Archiving is reversible: archived records remain stored but are excluded from active calculations.
- Permanent deletion is deliberately safeguarded.
- Backup compatibility is part of the data-safety contract.
- A successful restore replaces the current tracked portfolio.
- A failed or invalid restore must not partially corrupt or replace current data.

The internal change log is technical append-only history, not a complete transaction ledger. Wealth-flow records are auditable but do not replace current account balances or holdings. True investment-performance calculations still require explicit future semantics for fees, dividends, realized transactions, timing, and other flows.
