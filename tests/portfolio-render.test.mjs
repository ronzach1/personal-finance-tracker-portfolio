import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./helpers/portfolio-runtime.mjs";

const { HoldingIdentity } = await import("../app/components/PortfolioView.tsx");
const { Overview } = await import("../app/components/Overview.tsx");
const { copy } = await import("../app/components/portfolio-ui.ts");
const { PortfolioManager } = await import("../app/components/PortfolioManager.tsx");

test("account detail renders known fees including zero in both languages and omits unknown fees", () => {
  for (const language of ["en", "he"]) {
    for (const fee of [undefined, null, 0, 0.8]) {
      const account = { id: 1, name: "Broker", kind: "broker", cashBalance: 0, cashCurrency: "ILS", annualManagementFeePercent: fee, archivedAt: null };
      const props = { t: copy[language], accounts: [account], holdings: [], rate: 4, initialAccountId: 1, start: null, dataCheckFocus: null };
      const html = renderToStaticMarkup(React.createElement(PortfolioManager, props));
      const label = language === "he" ? "דמי ניהול: " : "Management fee: ";
      assert.equal(html.includes(label), fee != null);
      if (fee != null) assert.ok(html.includes(`<bdi>${fee}%</bdi>`));
      const createHtml = renderToStaticMarkup(React.createElement(PortfolioManager, { ...props, start: "new-account" }));
      assert.equal(createHtml.includes('account-fee-help'), false, "new non-broker accounts do not expose the fee");
    }
  }
});

test("rendered holding identity makes aliases primary while preserving canonical names", () => {
  const holding = { symbol: "NVDA", name: "NVIDIA Corporation", displayAlias: "Family – USD" };
  const aliased = renderToStaticMarkup(React.createElement(HoldingIdentity, { h: holding }));
  assert.match(aliased, /<strong><bdi>Family – USD<\/bdi><\/strong>/);
  assert.match(aliased, /NVDA · NVIDIA Corporation/);
  const legacy = renderToStaticMarkup(React.createElement(HoldingIdentity, { h: { ...holding, displayAlias: undefined } }));
  assert.match(legacy, /<strong><bdi>NVDA<\/bdi><\/strong>/);
  assert.match(legacy, /<small>NVIDIA Corporation<\/small>/);
});

test("Dashboard renders the same top-four holdings behind its allocation headline in both languages", () => {
  const holdings = [1, 2, 3, 4, 50, 100].map((ils, id) => ({ id, ils, symbol: `TOP${id}`, name: `Company ${id}`, instrumentKind: "security", type: "stock", qty: 1, avg: 1, price: ils, native: ils, currency: "ILS", geography: "japan", sector: "healthcare", status: "manual", access: "invested", updatedAt: new Date().toISOString() }));
  for (const language of ["en", "he"]) {
    const t = copy[language];
    const html = renderToStaticMarkup(React.createElement(Overview, { t, composition: "geography", holdings, accounts: [], snapshots: [], attribution: null, rate: 4, valuationMeta: { automaticCount: 0, staleCount: 0, failedCount: 0, rateMode: "manual" }, refreshingPrices: false }));
    const largest = html.split(t.largest)[1].split('recent-wealth-change')[0];
    assert.match(largest, /98%/);
    for (const id of [5, 4, 3, 2]) assert.ok(largest.includes(`TOP${id}`));
    for (const id of [0, 1]) assert.equal(largest.includes(`TOP${id}`), false);
    assert.ok(largest.indexOf("TOP5") < largest.indexOf("TOP4"));
    assert.ok(html.includes(language === "he" ? "יפן" : "Japan"));
  }
});
