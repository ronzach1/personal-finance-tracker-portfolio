# V1 Manual QA Checklist

Keep this checklist unchecked until each item has been performed manually. Use only temporary or disposable test records; never add personal financial values to the repository.

## A. Safety and preparation

- [ ] Update the local checkout to the latest `main` and confirm it matches `origin/main`.
- [ ] Confirm the Git working tree is clean before QA begins.
- [ ] Confirm Node.js 24 is active.
- [ ] Create and download a fresh backup before any destructive QA.
- [ ] Confirm runtime financial data, backups, local databases, secrets, and `.env` files will not be committed.

## B. Initial load

- [ ] Open the app and confirm it loads successfully.
- [ ] Confirm the expected existing portfolio data appears.
- [ ] Confirm onboarding does not unexpectedly replace the portfolio experience.
- [ ] Confirm there are no console errors or runtime-breaking errors.

## C. Overview correctness

- [ ] Independently calculate tracked wealth from known account cash and holding values; compare it with the overview total.
- [ ] Confirm USD cash and assets use the displayed USD–ILS rate correctly.
- [ ] Confirm archived accounts and holdings are excluded from totals.
- [ ] Confirm the previous-daily-snapshot comparison uses a sensible prior Jerusalem calendar day.
- [ ] Check every composition tab and confirm its parts produce sensible totals.
- [ ] Confirm geography and sector composition includes only equity-style holdings.
- [ ] Confirm Data Check issue counts and actions match the affected records.

## D. Portfolio

- [ ] Search by name, ticker, and security number.
- [ ] Exercise every portfolio filter and clear the filters.
- [ ] Exercise each available sorting option and direction.
- [ ] Independently verify allocation percentages for representative holdings.
- [ ] Open holding details and verify displayed values and metadata.
- [ ] Verify the holding's share of total tracked wealth.
- [ ] At mobile width, verify row layout, opening behavior, and actions.

## E. Accounts

- [ ] Independently verify representative account totals.
- [ ] Verify cash balances and quoted currencies.
- [ ] Add a temporary account and edit its details.
- [ ] Archive and restore the temporary account; verify linked holdings and totals behave as intended.
- [ ] Verify permanent deletion requires prior archiving and respects linked-asset safeguards.

## F. Asset editing

- [ ] Create and edit a temporary manual ILS asset.
- [ ] Create and edit a temporary manual USD asset.
- [ ] Save a market asset using average-cost mode and verify the stored/displayed average price.
- [ ] Save a market asset using total-cost mode and independently verify total cost divided by quantity.
- [ ] Save ILS current and average prices in agorot and verify their shekel representation.
- [ ] Save a supported Yahoo USD stock or ETF and verify automatic pricing.
- [ ] Where practical, save a supported Keren44 ILS index or money-market fund and verify automatic pricing.
- [ ] Try an unsupported provider/currency/asset combination and verify it follows the manual path.
- [ ] Change a temporary asset between manual and automatic price modes and verify the result.
- [ ] Archive and restore a temporary asset.
- [ ] Verify permanent asset deletion requires prior archiving and a deliberate confirmation.

## G. Valuation refresh

- [ ] Refresh the USD–ILS rate and verify the displayed rate and as-of metadata.
- [ ] Refresh automatic prices and verify representative supported holdings.
- [ ] Verify progress/disabled states while a refresh is running.
- [ ] Verify a fully successful refresh reports success and updates the daily snapshot.
- [ ] Exercise or safely simulate a partial provider failure; confirm the previous value remains and the partial failure is reported.
- [ ] Enter a manual FX override and verify USD valuations use it.
- [ ] Return FX to automatic mode and verify the next refresh restores provider metadata.

## H. Data Check

- [ ] Create or identify a temporary holding with a missing current value and verify its issue and edit action.
- [ ] Verify a manual security or crypto price older than 30 days is reported as stale.
- [ ] Verify an equity-style holding missing geography or sector classification is reported.
- [ ] Verify a security with valid current value but missing cost basis reports only the cost-basis issue.
- [ ] Verify automatic price and FX failures point to valuation refresh.
- [ ] Run sequential review across multiple affected holdings in deterministic order.
- [ ] Save an affected holding without resolving its issue; confirm the review finishes without looping forever.
- [ ] Verify cancellation and browser-back behavior exit the review safely.

## I. History

- [ ] Save a manual snapshot and verify it appears.
- [ ] Confirm only one snapshot is retained per Jerusalem calendar day.
- [ ] Save again on the same Jerusalem day and confirm the existing daily snapshot is replaced rather than duplicated.
- [ ] Exercise every history range.
- [ ] Select representative graph points and verify their values and dates.
- [ ] Confirm wording describes wealth change rather than investment return.

## J. Backup and restore

- [ ] Export a backup and download it successfully.
- [ ] Open the export and confirm it is valid JSON with the expected v1 backup identity.
- [ ] Start restore and verify the review/confirmation step appears before mutation.
- [ ] Restore the fresh backup successfully.
- [ ] Confirm accounts, holdings, settings, valuations, and history match the pre-export portfolio.
- [ ] Attempt to restore malformed or unsupported backup JSON and confirm it is rejected.
- [ ] Confirm current data remains intact after every rejected or failed restore.

## K. Language and RTL

- [ ] Switch Hebrew to English and back to Hebrew.
- [ ] Confirm page direction changes between RTL and LTR.
- [ ] Inspect Overview, Portfolio, Accounts, History, and Settings in both languages.
- [ ] Inspect sheets, editors, onboarding, and confirmation dialogs in both languages.
- [ ] Confirm controls, numbers, icons, and text are not clipped, reversed, or incorrectly ordered.

## L. Responsive and device pass

- [ ] Complete a pass at a normal desktop width.
- [ ] Complete a pass in a narrow/mobile-width browser.
- [ ] Complete a pass on an actual phone if one is available.
- [ ] Verify desktop, sidebar, and bottom navigation behavior at relevant widths.
- [ ] Verify tables and cards remain readable and actionable.
- [ ] Verify sheets and dialogs fit the viewport.
- [ ] Verify page and nested scrolling do not trap content.
- [ ] Verify touch targets are comfortably usable.

## M. Final release gate

- [ ] `npm run lint` completes with zero errors and zero warnings.
- [ ] `npm run build` passes.
- [ ] `npm test` passes with every automated test green.
- [ ] Every critical manual QA case above passes or has an explicitly accepted disposition.
- [ ] There are no open data-loss or financial-correctness bugs.
- [ ] A fresh backup has been exported successfully after QA.
- [ ] `main` is clean and synchronized with `origin/main`.
