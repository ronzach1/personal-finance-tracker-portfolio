import assert from "node:assert/strict";
import test from "node:test";
import { parsePortfolioRequest } from "../lib/portfolio-request.ts";

const account = { name: "Broker", kind: "broker", cashCurrency: "USD", cashBalance: 10 };
const asset = { accountId: 1, assetType: "stock", symbol: "MSFT", name: "Microsoft", currency: "USD", quantity: 2, averagePrice: 100, currentPrice: 110, liquidity: "invested", costMode: "average", priceUnit: "currency" };
const onboarding = { action: "onboard", language: "en", usdIlsRateMode: "manual", usdIlsRate: 3.7, accounts: [{ clientId: "broker", ...account }], holdings: [{ accountClientId: "broker", ...asset }] };

const valid = (value) => assert.equal(parsePortfolioRequest(value).ok, true);
const invalid = (value) => assert.equal(parsePortfolioRequest(value).ok, false);

test("optional aliases are trimmed, clearable, bounded, and kept separate from canonical fields", () => {
  const payload = { action: "save_asset", ...asset };
  assert.equal(Object.hasOwn(parsePortfolioRequest(payload).value, "displayAlias"), false);
  for (const displayAlias of [null, "", "   "]) assert.equal(parsePortfolioRequest({ ...payload, displayAlias }).value.displayAlias, null);
  const parsed = parsePortfolioRequest({ ...payload, displayAlias: "  Microsoft – USD  " }).value;
  assert.equal(parsed.displayAlias, "Microsoft – USD");
  assert.equal(parsed.symbol, asset.symbol);
  assert.equal(parsed.name, asset.name);
  for (const displayAlias of [false, 42, {}, [], "a".repeat(121)]) invalid({ ...payload, displayAlias });
});

test("rejects non-object, missing, and unknown actions", () => {
  invalid(null); invalid([]); invalid({}); invalid({ action: "nope" });
});

test("accepts no-payload actions and all refresh aliases", () => {
  for (const action of ["export_backup", "refresh_us_prices", "refresh_market_prices", "refresh_valuation", "automatic_rate", "snapshot"]) valid({ action });
});

test("validates ids and simple enums", () => {
  valid({ action: "archive_asset", id: 1 });
  invalid({ action: "archive_asset", id: 1.5 });
  invalid({ action: "archive_asset", id: 0 });
  invalid({ action: "archive_asset", id: -1 });
  invalid({ action: "archive_asset", id: Number.NaN });
  invalid({ action: "language", language: "fr" });
  invalid({ action: "liquidity", id: 1, liquidity: "soon" });
});

test("rejects non-finite and negative financial inputs", () => {
  invalid({ action: "cash", id: 1, balance: Number.NaN, currency: "ILS" });
  invalid({ action: "cash", id: 1, balance: Infinity, currency: "ILS" });
  invalid({ action: "cash", id: 1, balance: -0.01, currency: "ILS" });
  invalid({ action: "holding", id: 1, quantity: -1, averagePrice: 1, currentPrice: 1 });
  invalid({ action: "holding", id: 1, quantity: 1, averagePrice: -1, currentPrice: 1 });
  invalid({ action: "holding", id: 1, quantity: 1, averagePrice: 1, currentPrice: -1 });
  invalid({ action: "holding", id: 1, quantity: 1, averagePrice: 1, currentPrice: Infinity });
  invalid({ action: "rate", usdIlsRate: -1 });
  invalid({ action: "rate", usdIlsRate: Number.NaN });
});

test("parses save_account create and edit payloads", () => {
  valid({ action: "save_account", ...account });
  valid({ action: "save_account", id: 1, ...account });
  valid({ action: "save_account", id: 1, ...account, flowClassification: "correction" });
  invalid({ action: "save_account", ...account, kind: "checking" });
  invalid({ action: "save_account", ...account, cashCurrency: "EUR" });
});

test("management fees preserve omission, explicit clear and zero, and reject malformed percentages", () => {
  const transfer = { action: "internal_transfer", sourceAccountId: 1, destinationAccountId: 2, sourceBalance: 80, destinationBalance: 120, sourceCurrency: "ILS", destinationCurrency: "ILS" };
  for (const [payload, field] of [[{ action: "save_account", ...account }, "annualManagementFeePercent"], [{ action: "save_account", id: 1, ...account }, "annualManagementFeePercent"], [transfer, "sourceAnnualManagementFeePercent"]]) {
    assert.equal(Object.hasOwn(parsePortfolioRequest(payload).value, field), false);
    for (const value of [null, "", "   "]) assert.equal(parsePortfolioRequest({ ...payload, [field]: value }).value[field], null);
    for (const value of [0, 0.8, 0.001, 100]) assert.equal(parsePortfolioRequest({ ...payload, [field]: value }).value[field], value);
    for (const value of [-0.01, 100.01, NaN, Infinity, -Infinity, "0", "0.8", "bad", false, true, {}, []]) invalid({ ...payload, [field]: value });
  }
});

test("validates external-flow attribution and rejects one-sided internal cash changes", () => {
  const occurredAt = "2026-08-22T09:00:00.000Z";
  invalid({ action: "cash", id: 1, balance: 120, currency: "ILS", flowClassification: "internal" });
  invalid({ action: "cash", id: 1, balance: 120, currency: "ILS", flowClassification: "internal", flow: { direction: "in", originalAmount: 20, currency: "ILS", ilsValue: 20, occurredAt } });
  valid({ action: "cash", id: 1, balance: 120, currency: "ILS", flowClassification: "external_in", flow: { direction: "in", originalAmount: 20, currency: "ILS", ilsValue: 20, occurredAt } });
  invalid({ action: "cash", id: 1, balance: 120, currency: "ILS", flowClassification: "external_in" });
  invalid({ action: "cash", id: 1, balance: 120, currency: "ILS", flowClassification: "external_in", flow: { direction: "out", originalAmount: 20, currency: "ILS", ilsValue: 20, occurredAt } });
  valid({ action: "save_wealth_flow", direction: "in", originalAmount: 100, currency: "USD", ilsValue: 370, occurredAt });
  valid({ action: "save_wealth_flow", id: 4, direction: "out", originalAmount: 50, currency: "ILS", ilsValue: 50, occurredAt });
  valid({ action: "delete_wealth_flow", id: 4 });
  valid({ action: "delete_wealth_flow", id: -4 });
});

test("parses only complete paired internal-transfer requests", () => {
  const transfer = { action: "internal_transfer", sourceAccountId: 1, destinationAccountId: 2, sourceBalance: 80, destinationBalance: 120, sourceCurrency: "ILS", destinationCurrency: "ILS" };
  valid(transfer);
  valid({ ...transfer, sourceName: "Updated bank", sourceKind: "bank" });
  invalid({ ...transfer, destinationAccountId: 1 });
  invalid({ ...transfer, destinationBalance: -1 });
  invalid({ ...transfer, sourceCurrency: "EUR" });
  invalid({ ...transfer, sourceName: "Updated bank" });
});

test("enforces ILS parity and rejects meaningfully future wealth flows", () => {
  const occurredAt = new Date().toISOString();
  invalid({ action: "save_wealth_flow", direction: "in", originalAmount: 100, currency: "ILS", ilsValue: 5_000, occurredAt });
  valid({ action: "save_wealth_flow", direction: "in", originalAmount: 100, currency: "USD", ilsValue: 370, occurredAt });
  invalid({ action: "save_wealth_flow", direction: "in", originalAmount: 100, currency: "ILS", ilsValue: 100, occurredAt: new Date(Date.now() + 10 * 60_000).toISOString() });
});

test("parses manual and automatic asset payloads", () => {
  valid({ action: "save_asset", ...asset });
  valid({ action: "save_asset", ...asset, instrumentProvider: "yahoo", providerInstrumentId: "MSFT", instrumentMarket: "US" });
  valid({ action: "save_asset", ...asset, assetType: "money_market", symbol: "513", currency: "ILS", instrumentProvider: "keren44", providerInstrumentId: "513", instrumentExchange: "TASE" });
  valid({ action: "save_asset", ...asset, assetType: "etf", symbol: "TCH.F11", currency: "ILS", instrumentProvider: "tase", providerInstrumentId: "1200112", quoteProvider: "yahoo", quoteProviderInstrumentId: "TCH-F11.TA", instrumentMarket: "IL", instrumentMic: "XTAE" });
  valid({ action: "save_asset", ...asset, assetType: "stock", symbol: "BEZQ", currency: "ILS", instrumentProvider: "tase", providerInstrumentId: "230011", instrumentMarket: "IL", instrumentMic: "XTAE" });
  valid({ action: "save_asset", ...asset, assetType: "etf", symbol: "TCH.F11", currency: "ILS", instrumentProvider: "tase", providerInstrumentId: "1200112" });
  invalid({ action: "save_asset", ...asset, assetType: "stock", symbol: "BEZQ", currency: "ILS", instrumentProvider: "tase", providerInstrumentId: "230011", quoteProvider: "yahoo" });
  invalid({ action: "save_asset", ...asset, assetType: "stock", symbol: "BEZQ", currency: "ILS", instrumentProvider: "tase", providerInstrumentId: "230011", quoteProviderInstrumentId: "BEZQ.TA" });
  invalid({ action: "save_asset", ...asset, assetType: "bond_fund", symbol: "BOND.F1", currency: "ILS", instrumentProvider: "tase", providerInstrumentId: "999001", quoteProvider: "yahoo", quoteProviderInstrumentId: "BOND-F1.TA" });
  invalid({ action: "save_asset", ...asset, instrumentProvider: "yahoo", providerInstrumentId: "MSFT", quoteProvider: "keren44", quoteProviderInstrumentId: "513" });
  invalid({ action: "save_asset", ...asset, quantity: -1 });
  invalid({ action: "save_asset", ...asset, currentPrice: Number.NaN });
  invalid({ action: "save_asset", ...asset, averagePrice: Infinity });
});

test("accepts supported asset editor boundaries without silently defaulting invalid enums", () => {
  valid({ action: "save_asset", ...asset, costMode: "total", totalCost: 200 });
  valid({ action: "save_asset", ...asset, currency: "ILS", priceUnit: "agorot" });
  valid({ action: "save_asset", ...asset, instrumentProvider: false, providerInstrumentId: false, instrumentExchange: false, instrumentMarket: false, instrumentMic: false, instrumentIsin: false });
  valid({ action: "save_asset", ...asset, ignoredFutureField: { safe: true } });
  invalid({ action: "save_asset", ...asset, assetType: "share" });
  invalid({ action: "save_asset", ...asset, costMode: "estimated" });
  invalid({ action: "save_asset", ...asset, priceUnit: "cents" });
  invalid({ action: "save_asset", ...asset, instrumentProvider: "unknown" });
});

test("rejects invalid asset ids, quantities, prices, and total costs", () => {
  invalid({ action: "save_asset", ...asset, id: 0 });
  invalid({ action: "save_asset", ...asset, accountId: 1.5 });
  invalid({ action: "save_asset", ...asset, accountId: -1 });
  invalid({ action: "save_asset", ...asset, quantity: Number.NaN });
  invalid({ action: "save_asset", ...asset, currentPrice: -1 });
  invalid({ action: "save_asset", ...asset, averagePrice: -1 });
  invalid({ action: "save_asset", ...asset, costMode: "total", totalCost: Infinity });
  invalid({ action: "save_asset", ...asset, costMode: "total", totalCost: -1 });
});

test("validates complete onboarding data before it can mutate", () => {
  valid(onboarding);
  invalid({ ...onboarding, accounts: [...onboarding.accounts, { clientId: "broker", ...account }] });
  invalid({ ...onboarding, holdings: [{ ...onboarding.holdings[0], accountClientId: "missing" }] });
  invalid({ ...onboarding, accounts: [{ clientId: "broker", name: "", kind: "broker", cashCurrency: "USD", cashBalance: 0 }] });
  invalid({ ...onboarding, holdings: [{ ...onboarding.holdings[0], assetType: "unknown" }] });
  invalid({ ...onboarding, accounts: [{ ...onboarding.accounts[0], cashBalance: Number.NaN }] });
  invalid({ ...onboarding, holdings: [{ ...onboarding.holdings[0], currentPrice: "110" }] });
  const pension = { ...onboarding.holdings[0], assetType: "pension", symbol: "", quantity: 99, averagePrice: 100, liquidity: "available", geography: "global", sector: "finance" };
  const parsedPension = parsePortfolioRequest({ ...onboarding, holdings: [pension] });
  assert.equal(parsedPension.ok, true);
  assert.deepEqual(parsedPension.value.holdings[0], { accountClientId: "broker", assetType: "pension", symbol: "", name: "Microsoft", currency: "USD", quantity: 1, averagePrice: 0, currentPrice: 110, liquidity: "locked", geography: "unspecified", sector: "unspecified" });
  invalid({ ...onboarding, holdings: [{ ...onboarding.holdings[0], assetType: "deposit", symbol: "" }] });
});

test("first-account setup accepts optional fees and rejects malformed percentages before onboarding", () => {
  for (const fee of [undefined, null, "", 0, 0.8, 100]) {
    const parsed = parsePortfolioRequest({ ...onboarding, accounts: [{ ...onboarding.accounts[0], annualManagementFeePercent: fee }] });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.accounts[0].annualManagementFeePercent, fee === "" ? null : fee);
  }
  for (const fee of [-1, 100.01, Infinity, NaN, "0.8", false, {}]) invalid({ ...onboarding, accounts: [{ ...onboarding.accounts[0], annualManagementFeePercent: fee }] });
});

test("preserves the backup value for the specialized validator", () => {
  const backup = { anything: ["the backup validator decides"] };
  const parsed = parsePortfolioRequest({ action: "restore_backup", backup });
  assert.deepEqual(parsed, { ok: true, value: { action: "restore_backup", backup } });
});
