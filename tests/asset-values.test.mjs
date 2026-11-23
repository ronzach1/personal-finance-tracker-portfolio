import assert from "node:assert/strict";
import test from "node:test";
import { deriveAssetValues, quoteLocatorForInstrumentSave } from "../app/api/portfolio/asset-values.ts";
import { parseKeren44ProviderInstrumentId } from "../lib/market-data.ts";

const asset = (patch = {}) => ({
  action: "save_asset",
  accountId: 1,
  assetType: "stock",
  symbol: "msft",
  name: "Microsoft",
  currency: "USD",
  quantity: 4,
  averagePrice: 25,
  currentPrice: 30,
  liquidity: "invested",
  costMode: "average",
  priceUnit: "currency",
  ...patch,
});

test("USD stocks preserve average-cost inputs", () => {
  const result = deriveAssetValues(asset());
  assert.equal(result.instrumentKind, "security");
  assert.equal(result.quantity, 4);
  assert.equal(result.averagePrice, 25);
  assert.equal(result.currentPrice, 30);
});

test("USD ETFs derive average price from total cost", () => {
  const result = deriveAssetValues(asset({ assetType: "etf", quantity: 8, costMode: "total", totalCost: 1_000 }));
  assert.equal(result.averagePrice, 125);
});

test("ILS agorot inputs convert current and average prices to shekels", () => {
  const result = deriveAssetValues(asset({ currency: "ILS", currentPrice: 1234, averagePrice: 987, priceUnit: "agorot" }));
  assert.equal(result.currentPrice, 12.34);
  assert.equal(result.averagePrice, 9.87);
});

test("non-market assets normalize quantity and cost representation", () => {
  for (const assetType of ["deposit", "cash", "real_estate", "other"]) {
    const result = deriveAssetValues(asset({ assetType, quantity: 7, averagePrice: 2, currentPrice: 900 }));
    assert.equal(result.quantity, 1);
    assert.equal(result.averagePrice, 900);
  }
});

test("Yahoo automatic pricing is limited to USD stocks and ETFs", () => {
  for (const assetType of ["stock", "etf"]) {
    const result = deriveAssetValues(asset({ assetType, instrumentProvider: "yahoo", providerInstrumentId: "msft" }));
    assert.equal(result.automaticProvider, "yahoo");
    assert.equal(result.priceMode, "automatic");
  }
  assert.equal(deriveAssetValues(asset({ currency: "ILS", instrumentProvider: "yahoo", providerInstrumentId: "msft" })).priceMode, "manual");
  assert.equal(deriveAssetValues(asset({ assetType: "bond", instrumentProvider: "yahoo", providerInstrumentId: "bond" })).priceMode, "manual");
});

test("Keren44 automatic pricing is limited to ILS index and money-market funds", () => {
  for (const assetType of ["index_fund", "money_market"]) {
    const result = deriveAssetValues(asset({ assetType, currency: "ILS", instrumentProvider: "keren44", providerInstrumentId: "513" }));
    assert.equal(result.automaticProvider, "keren44");
    assert.equal(result.priceMode, "automatic");
  }
  assert.equal(deriveAssetValues(asset({ assetType: "index_fund", instrumentProvider: "keren44", providerInstrumentId: "513" })).priceMode, "manual");
  assert.equal(deriveAssetValues(asset({ assetType: "stock", currency: "ILS", instrumentProvider: "keren44", providerInstrumentId: "513" })).priceMode, "manual");
});

test("Yahoo provider identifiers and symbols retain uppercase normalization", () => {
  const result = deriveAssetValues(asset({ symbol: "brk.b", instrumentProvider: "yahoo", providerInstrumentId: "brk-b" }));
  assert.equal(result.symbol, "BRK.B");
  assert.equal(result.providerInstrumentId, "BRK-B");
});

test("Keren44 locators remain opaque through the asset save normalization path", () => {
  const locator = "5127600::תכלית-ise-cloud-ttf-ממ";
  const result = deriveAssetValues(asset({ assetType: "index_fund", currency: "ILS", instrumentProvider: "keren44", providerInstrumentId: locator, quoteProvider: "keren44", quoteProviderInstrumentId: ` ${locator} ` }));
  assert.equal(result.providerInstrumentId, locator);
  assert.equal(result.quoteProviderInstrumentId, locator);
  assert.deepEqual(parseKeren44ProviderInstrumentId(result.providerInstrumentId), { fundId: "5127600", slug: "תכלית-ise-cloud-ttf-ממ" });
});

test("TASE keeps canonical identity separate from its Yahoo quote locator",()=>{
  const result=deriveAssetValues(asset({assetType:"etf",symbol:"TCH.F11",currency:"ILS",instrumentProvider:"tase",providerInstrumentId:"1200112",quoteProvider:"yahoo",quoteProviderInstrumentId:"TCH-F11.TA"}));
  assert.equal(result.providerInstrumentId,"1200112");
  assert.equal(result.quoteProviderInstrumentId,"TCH-F11.TA");
  assert.equal(result.automaticProvider,"yahoo");
  assert.equal(result.priceMode,"automatic");
});

test("unresolved TASE instruments retain canonical identity with manual pricing",()=>{
  const result=deriveAssetValues(asset({assetType:"stock",symbol:"BEZQ",name:"Bezeq",currency:"ILS",currentPrice:7.8,instrumentProvider:"tase",providerInstrumentId:"230011"}));
  assert.equal(result.persistCanonicalInstrument,true);
  assert.equal(result.automaticProvider,null);
  assert.equal(result.priceMode,"manual");
  assert.equal(result.providerInstrumentId,"230011");
  assert.equal(result.quoteProviderInstrumentId,"");
});

test("manual TASE saves preserve a shared verified locator but unresolved instruments have none",()=>{
  assert.deepEqual(quoteLocatorForInstrumentSave({
    automaticProvider:null,
    quoteProviderInstrumentId:"",
    existingQuoteProvider:"yahoo",
    existingQuoteProviderInstrumentId:"BEZQ.TA",
  }),{quoteProvider:"yahoo",quoteProviderInstrumentId:"BEZQ.TA"});
  assert.deepEqual(quoteLocatorForInstrumentSave({
    automaticProvider:null,
    quoteProviderInstrumentId:"",
    existingQuoteProvider:null,
    existingQuoteProviderInstrumentId:null,
  }),{quoteProvider:null,quoteProviderInstrumentId:null});
});

test("zero quantity total-cost input remains finite", () => {
  const result = deriveAssetValues(asset({ quantity: 0, averagePrice: 17, costMode: "total", totalCost: 100 }));
  assert.equal(result.averagePrice, 17);
  assert.equal(Number.isFinite(result.averagePrice), true);
});
