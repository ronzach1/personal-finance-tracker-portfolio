import assert from "node:assert/strict";
import test from "node:test";
import { activePortfolio, allocationPercentage, cashValueIls, currentInvestmentPl, holdingUnrealizedPl, holdingValueIls, isExposureEligible, isSameJerusalemDay, isValidBackupV1, jerusalemDay, previousJerusalemDaySnapshot, resolveOnboardingRate, trackedWealthIls, wealthFlowAttribution } from "../lib/finance.ts";
import { restoredWealthFlowTrackingState } from "../lib/wealth-flow.ts";

const investment = (overrides = {}) => ({ accountId: 1, instrumentKind: "security", quantity: 10, averagePrice: 100, currentPrice: 125, currency: "ILS", archivedAt: null, ...overrides });

test("current ILS P/L measures current value against quantity times known purchase cost", () => {
  assert.deepEqual(holdingUnrealizedPl(investment(), 3.5), { unrealizedPlIls: 250, costBasisIls: 1000, percentage: 25, currentValueIls: 1250 });
  const total = currentInvestmentPl([investment()], 3.5);
  assert.equal(total.unrealizedPlIls, 250);
  assert.equal(total.percentage, 25);
  assert.equal(total.coveredCostBasisIls, 1000);
  assert.equal(total.coverage, "complete");
});

test("USD current P/L and covered cost use the same current FX rate", () => {
  for (const rate of [3.5, 4]) {
    const total = currentInvestmentPl([investment({ currency: "USD" })], rate);
    assert.equal(total.unrealizedPlIls, 250 * rate);
    assert.equal(total.coveredCostBasisIls, 1000 * rate);
    assert.equal(total.coveredValueIls, 1250 * rate);
    assert.equal(total.percentage, 25);
  }
});

test("mixed ILS and USD holdings aggregate amounts and use cost-weighted P/L percentage", () => {
  const total = currentInvestmentPl([investment(), investment({ currency: "USD", quantity: 2, averagePrice: 50, currentPrice: 40 }), investment({ instrumentKind: "crypto", currency: "USD", quantity: .5, averagePrice: 100, currentPrice: 200 })], 4);
  assert.equal(total.unrealizedPlIls, 370);
  assert.equal(total.coveredCostBasisIls, 1600);
  assert.equal(total.percentage, 23.125);
  assert.equal(total.coveredValueIls, 1970);
  assert.equal(total.eligibleValueIls, 1970);
  assert.equal(total.coveredHoldingCount, 3);
});

test("unknown, missing, zero and invalid purchase costs are excluded without zero P/L", () => {
  for (const overrides of [{ costBasisIntentionallyUnknown: true }, { averagePrice: undefined }, { averagePrice: null }, { averagePrice: 0 }, { averagePrice: -1 }, { averagePrice: NaN }, { averagePrice: Infinity }]) {
    const unknown = investment(overrides);
    assert.equal(holdingUnrealizedPl(unknown, 3.5), null);
    const total = currentInvestmentPl([unknown], 3.5);
    assert.equal(total.unrealizedPlIls, null);
    assert.equal(total.percentage, null);
    assert.equal(total.coveredCostBasisIls, 0);
    assert.equal(total.eligibleValueIls, 1250);
    assert.equal(total.coverage, "none");
  }
});

test("cash, deposits, pensions and generic assets neither contribute nor reduce coverage", () => {
  const excluded = ["deposit", "pension", "other"].flatMap(instrumentKind => [investment({ instrumentKind }), investment({ instrumentKind, averagePrice: 0 })]);
  assert.deepEqual(currentInvestmentPl([investment(), ...excluded], 4), currentInvestmentPl([investment()], 4));
  assert.equal(currentInvestmentPl(excluded, 4).eligibleHoldingCount, 0);
  assert.equal(currentInvestmentPl([], 4).unrealizedPlIls, null);
});

test("partial coverage uses current eligible values, not total wealth or covered cost", () => {
  const total = currentInvestmentPl([investment(), investment({ currency: "USD", costBasisIntentionallyUnknown: true })], 4);
  assert.equal(total.coverage, "partial");
  assert.equal(total.coveredHoldingCount, 1);
  assert.equal(total.eligibleHoldingCount, 2);
  assert.equal(total.coveredValueIls, 1250);
  assert.equal(total.eligibleValueIls, 6250);
  assert.equal(total.coveredCostBasisIls, 1000);
  assert.equal(total.percentage, 25);
});

test("negative and break-even current P/L remain available values", () => {
  const loss = currentInvestmentPl([investment({ currentPrice: 75 })], 4);
  assert.equal(loss.unrealizedPlIls, -250);
  assert.equal(loss.percentage, -25);
  const flat = currentInvestmentPl([investment({ currentPrice: 100 })], 4);
  assert.equal(flat.unrealizedPlIls, 0);
  assert.equal(flat.percentage, 0);
  assert.equal(flat.coverage, "complete");
});

test("unheld and archived positions, including archived accounts, are outside current P/L", () => {
  const accounts = [{ id: 1, cashBalance: 9000, cashCurrency: "ILS", archivedAt: null }, { id: 2, cashBalance: 0, cashCurrency: "ILS", archivedAt: "2026-01-01" }];
  const rows = [investment(), investment({ accountId: 2 }), investment({ archivedAt: "2026-01-01" }), investment({ quantity: 0 })];
  assert.deepEqual(currentInvestmentPl(activePortfolio(accounts, rows).holdings, 4), currentInvestmentPl([investment()], 4));
});

test("missing current prices and invalid FX do not fabricate losses or coverage values", () => {
  for (const currentPrice of [0, -1, NaN, Infinity]) {
    const total = currentInvestmentPl([investment(), investment({ currentPrice })], 4);
    assert.equal(total.unrealizedPlIls, 250);
    assert.equal(total.eligibleValueIls, null);
    assert.equal(total.coverage, "partial");
  }
  for (const rate of [0, -1, NaN, Infinity]) {
    assert.equal(holdingUnrealizedPl(investment({ currency: "USD" }), rate), null);
    assert.equal(holdingUnrealizedPl(investment(), rate)?.unrealizedPlIls, 250);
  }
});

test("current investment P/L stays independent of previous-day wealth and recorded flow attribution", () => {
  const accounts = [{ id: 1, cashBalance: 1000, cashCurrency: "ILS", archivedAt: null }];
  const holdings = [investment({ currency: "USD" })];
  const total = trackedWealthIls(accounts, holdings, 4);
  const snapshots = [{ capturedAt: "2026-08-28T08:00:00Z", totalIls: 5999 }, { capturedAt: "2026-08-27T08:00:00Z", totalIls: 5500 }];
  const previousSnapshot = previousJerusalemDaySnapshot(snapshots, "2026-08-28T12:00:00Z");
  const attribution = wealthFlowAttribution({ currentTrackedWealth: total, previousSnapshot, trackingStartedAt: "2026-08-26T08:00:00Z", now: "2026-08-28T12:00:00Z", flows: [{ direction: "in", ilsValue: 370, occurredAt: "2026-08-27T10:00:00Z" }] });
  assert.equal(currentInvestmentPl(holdings, 4).unrealizedPlIls, 1000);
  assert.equal(attribution.wealthChange, 500);
  assert.equal(attribution.netExternalFlow, 370);
  assert.equal(attribution.residualChange, 130);
});

test("wealth breakdown converts USD, excludes archived data, and reconciles to tracked wealth", () => {
  const accounts = [{ id: 1, cashBalance: 100, cashCurrency: "ILS", archivedAt: null }, { id: 2, cashBalance: 10, cashCurrency: "USD", archivedAt: null }, { id: 3, cashBalance: 500, cashCurrency: "ILS", archivedAt: "2026-01-01" }];
  const holdings = [{ accountId: 1, quantity: 2, currentPrice: 50, currency: "ILS", archivedAt: null }, { accountId: 2, quantity: 3, currentPrice: 4, currency: "USD", archivedAt: null }, { accountId: 1, quantity: 99, currentPrice: 1, currency: "ILS", archivedAt: "2026-01-01" }, { accountId: 3, quantity: 99, currentPrice: 1, currency: "ILS", archivedAt: null }];
  assert.equal(cashValueIls(accounts[0], 3.5), 100); assert.equal(cashValueIls(accounts[1], 3.5), 35); assert.equal(holdingValueIls(holdings[1], 3.5), 42);
  const active = activePortfolio(accounts, holdings);
  const cashTotal = active.accounts.reduce((sum, account) => sum + cashValueIls(account, 3.5), 0);
  const holdingsTotal = active.holdings.reduce((sum, holding) => sum + holdingValueIls(holding, 3.5), 0);
  assert.equal(cashTotal, 135); assert.equal(holdingsTotal, 142); assert.equal(cashTotal + holdingsTotal, trackedWealthIls(accounts, holdings, 3.5));
  assert.deepEqual(active.holdings, holdings.slice(0, 2));
});

test("allocation percentages use active wealth and handle zero totals", () => {
  assert.equal(allocationPercentage(50, 200), 25); assert.equal(allocationPercentage(50, 0), 0);
  const accounts = [{ id: 1, cashBalance: 100, cashCurrency: "ILS", archivedAt: null }, { id: 2, cashBalance: 100, cashCurrency: "ILS", archivedAt: "2026-01-01" }];
  const holdings = [{ accountId: 1, quantity: 1, currentPrice: 100, currency: "ILS", archivedAt: null }, { accountId: 2, quantity: 1, currentPrice: 100, currency: "ILS", archivedAt: null }];
  assert.equal(trackedWealthIls(accounts, holdings, 3.5), 200); assert.equal(allocationPercentage(100, trackedWealthIls(accounts, holdings, 3.5)), 50);
});

test("only equity-style securities require geography and sector classification", () => {
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "Stock" }), true);
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "ETF" }), true);
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "index-tracking-fund" }), true);
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "index_fund" }), true);
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "Money-market" }), false);
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "bond" }), false);
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "bond_fund" }), false);
  assert.equal(isExposureEligible({ instrumentKind: "deposit", assetType: "Deposit" }), false);
  assert.equal(isExposureEligible({ instrumentKind: "crypto", assetType: "crypto" }), false);
  assert.equal(isExposureEligible({ instrumentKind: "other", assetType: "cash" }), false);
  assert.equal(isExposureEligible({ instrumentKind: "security", assetType: "other" }), false);
});

test("snapshot days use Asia/Jerusalem calendar dates", () => {
  assert.equal(jerusalemDay("2026-01-01T21:30:00.000Z"), "2026-01-01"); assert.equal(jerusalemDay("2026-01-01T22:30:00.000Z"), "2026-01-02"); assert.equal(isSameJerusalemDay("2026-01-01T22:30:00.000Z", "2026-01-02T20:00:00.000Z"), true); assert.equal(isSameJerusalemDay("2026-01-01T21:30:00.000Z", "2026-01-01T22:30:00.000Z"), false);
});

test("daily change ignores today's snapshots and selects the newest earlier Jerusalem day", () => {
  const snapshots = [
    { id: 1, capturedAt: "2026-08-18T08:00:00.000Z" },
    { id: 2, capturedAt: "2026-08-19T05:00:00.000Z" },
    { id: 3, capturedAt: "2026-08-18T19:00:00.000Z" },
  ];
  assert.equal(previousJerusalemDaySnapshot(snapshots, "2026-08-19T12:00:00.000Z")?.id, 3);
});

test("daily change has no comparison when every snapshot is from today", () => {
  assert.equal(previousJerusalemDaySnapshot([{ id: 1, capturedAt: "2026-08-19T05:00:00.000Z" }], "2026-08-19T12:00:00.000Z"), null);
});

test("daily change respects the Jerusalem midnight boundary", () => {
  const snapshots = [{ id: 1, capturedAt: "2026-01-01T21:30:00.000Z" }, { id: 2, capturedAt: "2026-01-01T22:30:00.000Z" }];
  assert.equal(previousJerusalemDaySnapshot(snapshots, "2026-01-02T10:00:00.000Z")?.id, 1);
});

test("wealth-flow attribution separates money in and out without changing tracked wealth", () => {
  const result = wealthFlowAttribution({ currentTrackedWealth: 1_120, previousSnapshot: { totalIls: 1_000, capturedAt: "2026-08-21T18:00:00.000Z" }, trackingStartedAt: "2026-08-20T08:00:00.000Z", now: "2026-08-22T12:00:00.000Z", flows: [
    { direction: "in", ilsValue: 200, occurredAt: "2026-08-22T08:00:00.000Z" },
    { direction: "out", ilsValue: 50, occurredAt: "2026-08-22T09:00:00.000Z" },
    { direction: "in", ilsValue: 999, occurredAt: "2026-08-21T17:00:00.000Z" },
  ] });
  assert.deepEqual(result, { wealthChange: 120, moneyInIls: 200, moneyOutIls: 50, netExternalFlow: 150, residualChange: -30 });
  assert.equal(trackedWealthIls([{ id: 1, cashBalance: 1120, cashCurrency: "ILS", archivedAt: null }], [], 3.5), 1120);
});

test("periods beginning before the durable tracking baseline receive no fabricated attribution", () => {
  assert.equal(wealthFlowAttribution({ currentTrackedWealth: 1100, previousSnapshot: { totalIls: 1000, capturedAt: "2026-08-20T18:00:00.000Z" }, trackingStartedAt: "2026-08-21T08:00:00.000Z", flows: [{ direction: "in", ilsValue: 100, occurredAt: "2026-08-21T09:00:00.000Z" }] }), null);
});

test("onboarding rates prefer automatic metadata and allow only explicit manual fallback", () => {
  const automatic = resolveOnboardingRate({ requestedMode: "automatic", automaticRate: { rate: 3.41, priceAsOf: "2026-08-18T20:00:00.000Z", provider: "yahoo" }, manualRate: 3.65, now: "2026-08-19T10:00:00.000Z" });
  assert.deepEqual(automatic, { rate: 3.41, mode: "automatic", asOf: "2026-08-18T20:00:00.000Z", source: "yahoo" });
  assert.equal(resolveOnboardingRate({ requestedMode: "automatic", automaticRate: null, manualRate: 3.65, now: "2026-08-19T10:00:00.000Z" }), null);
  assert.deepEqual(resolveOnboardingRate({ requestedMode: "manual", automaticRate: null, manualRate: 3.65, now: "2026-08-19T10:00:00.000Z" }), { rate: 3.65, mode: "manual", asOf: "2026-08-19T10:00:00.000Z", source: "manual" });
  assert.equal(resolveOnboardingRate({ requestedMode: "manual", automaticRate: null, manualRate: 0, now: "2026-08-19T10:00:00.000Z" }), null);
});

test("version 1 backups remain accepted and malformed backups are rejected", () => {
  const backup = { schema: "my-wealth-backup", version: 1, data: { accounts: [{ id: 1, name: "Bank", kind: "bank", cashCurrency: "ILS", cashBalance: 0 }], holdings: [{ id: 1, accountId: 1, instrumentId: 1, name: "Fund", instrumentKind: "security", currency: "ILS", liquidity: "invested", priceMode: "manual", quantity: 2, averagePrice: 10, currentPrice: 12 }], instruments: [{ id: 1, symbol: "FUND", name: "Fund", provider: "manual", providerInstrumentId: "fund", currency: "ILS" }], snapshots: [{ totalIls: 24, capturedAt: "2026-01-01T00:00:00.000Z" }] } };
  assert.equal(isValidBackupV1(backup), true); assert.equal(isValidBackupV1({ ...backup, version: 2 }), false); assert.equal(isValidBackupV1({ ...backup, data: { ...backup.data, holdings: [{ ...backup.data.holdings[0], accountId: 99 }] } }), false);
});

test("new backups preserve TASE canonical identity and Yahoo quote configuration", () => {
  const backup = { schema: "my-wealth-backup", version: 1, data: { accounts: [{ id: 1, name: "Broker", kind: "broker", cashCurrency: "ILS", cashBalance: 0 }], holdings: [{ id: 1, accountId: 1, instrumentId: 1, name: "Bezeq", instrumentKind: "security", currency: "ILS", liquidity: "invested", priceMode: "automatic", quantity: 10, averagePrice: 5, currentPrice: 7.828 }], instruments: [{ id: 1, symbol: "BEZQ", name: "Bezeq", assetClass: "stock", provider: "tase", providerInstrumentId: "230011", quoteProvider: "yahoo", quoteProviderInstrumentId: "BEZQ.TA", currency: "ILS" }], snapshots: [] } };
  assert.equal(isValidBackupV1(backup), true);
  assert.equal(isValidBackupV1({ ...backup, data: { ...backup.data, instruments: [{ ...backup.data.instruments[0], quoteProvider: "yahoo", quoteProviderInstrumentId: null }] } }), false);
});

test("backup validation accepts TASE canonical identity without Yahoo pricing", () => {
  const backup = { schema: "my-wealth-backup", version: 1, data: { accounts: [{ id: 1, name: "Broker", kind: "broker", cashCurrency: "ILS", cashBalance: 0 }], holdings: [{ id: 1, accountId: 1, instrumentId: 1, name: "Bezeq", instrumentKind: "security", currency: "ILS", liquidity: "invested", priceMode: "manual", quantity: 10, averagePrice: 5, currentPrice: 7.8 }], instruments: [{ id: 1, symbol: "BEZQ", name: "Bezeq", assetClass: "stock", provider: "tase", providerInstrumentId: "230011", currency: "ILS" }], snapshots: [] } };
  assert.equal(isValidBackupV1(backup), true);
  assert.equal(isValidBackupV1({ ...backup, data: { ...backup.data, instruments: [{ ...backup.data.instruments[0], quoteProvider: "yahoo" }] } }), false);
});

test("version 1 backups accept additive USD/ILS flow data while legacy files remain valid", () => {
  const legacy = { schema: "my-wealth-backup", version: 1, data: { accounts: [{ id: 1, name: "Bank", kind: "bank", cashCurrency: "ILS", cashBalance: 0 }], holdings: [], instruments: [], snapshots: [] } };
  const current = { ...legacy, data: { ...legacy.data, settings: { wealthFlowTrackingStartedAt: "2026-08-22T00:00:00.000Z" }, wealthFlows: [{ id: 1, direction: "in", originalAmount: 100, currency: "USD", ilsValue: 370, relatedAccountId: 1, occurredAt: "2026-08-22T01:00:00.000Z" }] } };
  assert.equal(isValidBackupV1(legacy), true);
  assert.equal(isValidBackupV1(current), true);
  assert.deepEqual(restoredWealthFlowTrackingState({ hasWealthFlows: true, wealthFlows: current.data.wealthFlows, trackingStartedAt: current.data.settings.wealthFlowTrackingStartedAt, now: "2026-08-23T00:00:00.000Z" }), { valid: true, trackingStartedAt: "2026-08-22T00:00:00.000Z", restoreFlows: true });
  assert.deepEqual(restoredWealthFlowTrackingState({ hasWealthFlows: false, wealthFlows: undefined, trackingStartedAt: undefined, now: "2026-08-23T00:00:00.000Z" }), { valid: true, trackingStartedAt: "2026-08-23T00:00:00.000Z", restoreFlows: false });
});
