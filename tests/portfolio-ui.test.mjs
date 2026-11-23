import assert from "node:assert/strict";
import test from "node:test";
import { compareExposureKeysWithUnclassifiedLast, compareInvestmentPl, dataCheckIssueLabel, exposureEligible, exposureProfile, instrumentKindForType, instrumentSaveFields, investmentPlInput, normalizeAssetType, signedMoney, signedPercentage, supportsPriceChangeComparison } from "../app/components/portfolio-ui.ts";
import { holdingUnrealizedPl } from "../lib/finance.ts";
import { compareHoldingExposure, exposureLabel, geographyOptions, sectorOptions, holdingMatchesSearch, holdingDisplayName, holdingCanonicalName, largestAssets } from "../app/components/portfolio-ui.ts";

test("holding geography and sector sorting keep Unclassified last in both languages and directions", () => {
  for (const dimension of ["geography", "sector"]) for (const he of [false, true]) {
    const keys = dimension === "geography" ? ["canada", "japan"] : ["healthcare", "technology"];
    const rows = [{ id: 8, [dimension]: "unspecified" }, { id: 3, [dimension]: keys[0] }, { id: 2, [dimension]: keys[1] }, { id: 1, [dimension]: keys[0] }, { id: 7, [dimension]: "" }];
    for (const direction of ["asc", "desc"]) {
      const sorted = rows.toSorted((a, b) => compareHoldingExposure(a, b, dimension, direction, he));
      assert.deepEqual(sorted.slice(-2).map(row => row.id), [7, 8]);
      const expectedKeys = keys.toSorted((a, b) => (direction === "asc" ? 1 : -1) * exposureLabel(he, dimension, a).localeCompare(exposureLabel(he, dimension, b), he ? "he" : "en"));
      assert.deepEqual(sorted.slice(0, 3).map(row => row.id), expectedKeys[0] === keys[0] ? [1, 3, 2] : [2, 1, 3]);
    }
    assert.deepEqual(rows.toSorted((a, b) => compareHoldingExposure(a, b, dimension, "asc", he)), rows.toReversed().sort((a, b) => compareHoldingExposure(a, b, dimension, "asc", he)));
  }
});

test("every manual classification has bilingual labels and an unchanged exposure key", () => {
  assert.equal(geographyOptions.length, 12);
  assert.equal(sectorOptions.length, 14);
  for (const [dimension, options] of [["geography", geographyOptions], ["sector", sectorOptions]]) {
    assert.equal(options.at(-1), "unspecified");
    for (const key of options) {
      assert.notEqual(exposureLabel(false, dimension, key), key);
      assert.match(exposureLabel(true, dimension, key), /[א-ת]/);
      assert.deepEqual(exposureProfile({ [dimension]: key })[dimension], { [key]: 100 });
    }
  }
  assert.equal(exposureLabel(false, "sector", "financials"), "Financials");
  assert.equal(exposureLabel(false, "sector", "finance"), "Financials");
  assert.equal(exposureLabel(false, "geography", "other"), "Other / Mixed");
  assert.equal(exposureLabel(false, "sector", "other"), "Other");
});

test("alias search supplements canonical identity without changing unnamed holdings", () => {
  const holding = { symbol: "NVDA", name: "NVIDIA Corporation", providerInstrumentId: "NVDA", displayAlias: "Family – USD" };
  for (const query of ["family", "usd", "nvda", "nvidia corporation", ""]) assert.equal(holdingMatchesSearch(holding, query), true);
  assert.equal(holdingMatchesSearch(holding, "missing"), false);
  assert.equal(holdingDisplayName(holding), "Family – USD");
  assert.equal(holdingCanonicalName(holding), "NVDA · NVIDIA Corporation");
  assert.equal(holdingDisplayName({ ...holding, displayAlias: null }), "NVDA");
  assert.equal(holdingDisplayName({ name: "Pension", symbol: "" }), "Pension");
  assert.equal(holdingMatchesSearch({ ...holding, displayAlias: undefined }, "family"), false);
  assert.equal(holdingMatchesSearch({ ...holding, providerInstrumentId: "230011" }, "230011"), true);
});

test("Largest Assets percentage describes the exact sorted top four, including short and empty portfolios", () => {
  const rows = [1, 2, 3, 4, 50, 100].map((ils, id) => ({ id, ils }));
  const result = largestAssets(rows, 200);
  assert.deepEqual(result.topHoldings.map(row => row.ils), [100, 50, 4, 3]);
  assert.equal(result.percentage, 79);
  assert.deepEqual(rows.map(row => row.ils), [1, 2, 3, 4, 50, 100]);
  assert.deepEqual(largestAssets(rows.slice(0, 2), 10), { topHoldings: [rows[1], rows[0]], percentage: 30 });
  assert.deepEqual(largestAssets([], 0), { topHoldings: [], percentage: 0 });
});

test("P/L sorting uses ILS amounts, keeps unavailable values last in both directions, and breaks ties by ID", () => {
  const rows = [{ id: 5, pl: null }, { id: 3, pl: { unrealizedPlIls: 20 } }, { id: 2, pl: { unrealizedPlIls: -10 } }, { id: 1, pl: { unrealizedPlIls: 20 } }, { id: 4, pl: null }, { id: 6, pl: { unrealizedPlIls: 0 } }];
  assert.deepEqual(rows.toSorted((a,b)=>compareInvestmentPl(a,b,"desc")).map(row=>row.id), [1,3,6,2,4,5]);
  assert.deepEqual(rows.toSorted((a,b)=>compareInvestmentPl(a,b,"asc")).map(row=>row.id), [2,6,1,3,4,5]);
});

test("UI P/L mapping preserves intentional unknown cost and uses the shared finance helper", () => {
  const holding = { instrumentKind: "security", qty: 2, avg: 100, price: 120, currency: "USD", costBasisIntentionallyUnknown: false, archivedAt: null };
  assert.equal(holdingUnrealizedPl(investmentPlInput(holding), 4)?.unrealizedPlIls, 160);
  assert.equal(holdingUnrealizedPl(investmentPlInput({ ...holding, costBasisIntentionallyUnknown: true }), 4), null);
});

test("P/L amount and percentage use explicit, consistently placed signs", () => {
  assert.equal(signedMoney(8420), "+₪8,420");
  assert.equal(signedMoney(-8420), "−₪8,420");
  assert.equal(signedPercentage(34.56), "+34.6%");
  assert.equal(signedPercentage(-34.56), "−34.6%");
  assert.equal(signedPercentage(0), "+0.0%");
});

test("asset type normalization preserves supported aliases and maps unknown values to other", () => {
  assert.equal(normalizeAssetType("money-market"), "money_market");
  assert.equal(normalizeAssetType("money market"), "money_market");
  assert.equal(normalizeAssetType("real estate"), "real_estate");
  assert.equal(normalizeAssetType("something-new"), "other");
});

test("instrument kinds match the shared asset taxonomy", () => {
  for (const type of ["stock", "etf", "index_fund", "money_market", "bond", "bond_fund"]) assert.equal(instrumentKindForType(type), "security");
  assert.equal(instrumentKindForType("crypto"), "crypto");
  assert.equal(instrumentKindForType("deposit"), "deposit");
  for (const type of ["cash", "real_estate", "other"]) assert.equal(instrumentKindForType(type), "other");
});

test("price-change comparison is limited to securities and crypto", () => {
  assert.equal(supportsPriceChangeComparison({ instrumentKind: "security" }), true);
  assert.equal(supportsPriceChangeComparison({ instrumentKind: "crypto" }), true);
  assert.equal(supportsPriceChangeComparison({ instrumentKind: "other" }), false);
  assert.equal(supportsPriceChangeComparison({ instrumentKind: "deposit" }), false);
  assert.equal(supportsPriceChangeComparison({ instrumentKind: "pension" }), false);
});

test("UI exposure eligibility follows equity-only product semantics", () => {
  assert.equal(exposureEligible({ instrumentKind: "security", type: "stock" }), true);
  assert.equal(exposureEligible({ instrumentKind: "security", type: "index_fund" }), true);
  assert.equal(exposureEligible({ instrumentKind: "security", type: "money_market" }), false);
  assert.equal(exposureEligible({ instrumentKind: "crypto", type: "crypto" }), false);
});

test("exposure profiles normalize financials to finance and preserve unspecified values", () => {
  assert.deepEqual(exposureProfile({ geography: "global", sector: "financials" }), { geography: { global: 100 }, sector: { finance: 100 } });
  assert.deepEqual(exposureProfile({ geography: "", sector: "" }), { geography: { unspecified: 100 }, sector: { unspecified: 100 } });
});

test("geography composition keeps a dominant unclassified bucket last", () => {
  const byValue = [["unspecified", 900], ["global", 300], ["us", 600]].sort((a, b) => compareExposureKeysWithUnclassifiedLast(a[0], b[0], () => b[1] - a[1]));
  assert.deepEqual(byValue, [["us", 600], ["global", 300], ["unspecified", 900]]);
});

test("sector composition keeps a dominant unclassified bucket last", () => {
  const byValue = [["unspecified", 900], ["finance", 300], ["technology", 600]].sort((a, b) => compareExposureKeysWithUnclassifiedLast(a[0], b[0], () => b[1] - a[1]));
  assert.deepEqual(byValue, [["technology", 600], ["finance", 300], ["unspecified", 900]]);
});

test("exposure filter options keep unclassified last after alphabetized classified options", () => {
  const alphabetically = ["unspecified", "us", "global"].sort((a, b) => compareExposureKeysWithUnclassifiedLast(a, b, () => a.localeCompare(b)));
  assert.deepEqual(alphabetically, ["global", "us", "unspecified"]);
});

test("Data Check warning labels follow the active UI language", () => {
  assert.equal(dataCheckIssueLabel("missing-cost-basis", false), "securities without cost basis — valuation unaffected");
  assert.equal(dataCheckIssueLabel("missing-cost-basis", true), "ניירות ללא בסיס עלות — לא משפיע על השווי");
});

test("manual TASE saves retain canonical identity and automatic switching retains its locator", () => {
  const instrument = {
    provider: "tase",
    providerInstrumentId: "230011",
    symbol: "BEZQ",
    name: "Bezeq",
    exchange: "TASE",
    exchangeCode: "TLV",
    mic: "XTAE",
    isin: "IL0002300114",
    assetClass: "stock",
    currency: "ILS",
    market: "IL",
    quoteProvider: "yahoo",
    quoteProviderInstrumentId: "BEZQ.TA",
  };
  const manual = instrumentSaveFields(instrument, true);
  assert.equal(manual.instrumentProvider, "tase");
  assert.equal(manual.providerInstrumentId, "230011");
  assert.equal(manual.quoteProvider, undefined);
  assert.equal(manual.quoteProviderInstrumentId, undefined);

  const automatic = instrumentSaveFields(instrument, false);
  assert.equal(automatic.instrumentProvider, "tase");
  assert.equal(automatic.providerInstrumentId, "230011");
  assert.equal(automatic.quoteProvider, "yahoo");
  assert.equal(automatic.quoteProviderInstrumentId, "BEZQ.TA");
});

test("manual Yahoo and Keren44 saves continue to omit their instruments", () => {
  for (const provider of ["yahoo", "keren44"]) {
    assert.deepEqual(instrumentSaveFields({ provider, providerInstrumentId: "locator" }, true), {});
  }
});
