import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { env, memoryD1 } from "./helpers/portfolio-runtime.mjs";
import { marketData, parseKeren44FundClose, quoteIsStale, searchKeren44Funds } from "../lib/market-data.ts";
import { deriveAssetValues } from "../app/api/portfolio/asset-values.ts";
import { instrumentSaveFields } from "../app/components/portfolio-ui.ts";
import { parsePortfolioRequest } from "../lib/portfolio-request.ts";
const { handleMutation } = await import("../app/api/portfolio/mutations.ts");
const { getDb } = await import("../db/index.ts");
const { ensureSchema } = await import("../db/ensure.ts");

const discovery = JSON.parse(readFileSync(new URL("./fixtures/keren44/discovery.json", import.meta.url), "utf8"));
const fixture = id => readFileSync(new URL(`./fixtures/keren44/${id}.html`, import.meta.url), "utf8");
const reported = ["5124482", "5138631", "5136064", "5139902"];
const supported = [["5124482", 3.252, "2026-10-08"], ["5138631", 1.1688, "2026-10-08"], ["5136064", 338.1837, "2026-10-08"], ["5139902", 50.2689, "2026-10-08"], ["5138698", 1.0963, "2026-10-12"], ["5127600", 2.5883, "2026-10-08"], ["5139571", 1.304, "2026-10-08"], ["5130752", 1.6273, "2026-10-08"], ["5137039", 7.1381, "2026-10-08"], ["5137088", 13.372, "2026-10-08"]];
const counterexamples = ["5141007", "5115795", "5127089", "1159250"];
function changedFund(id, patch) {
  const props = JSON.parse(fixture(id).match(/props="([^"]*)"/)[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete props.fund[1][key]; else props.fund[1][key] = [0, value];
  }
  return `<astro-island props="${JSON.stringify(props).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></astro-island>`;
}
const base = { action: "save_asset", accountId: 1, assetType: "index_fund", currency: "ILS", quantity: 2, averagePrice: 100, currentPrice: 0, liquidity: "invested", costMode: "average", priceUnit: "agorot" };
function payloadFor(id) {
  const fund = discovery.funds.find(fund => fund.fundId === id);
  const match = searchKeren44Funds(discovery, id)[0] ?? { provider: "keren44", providerInstrumentId: `${id}::${fund.slug}`, quoteProvider: "keren44", quoteProviderInstrumentId: `${id}::${fund.slug}`, symbol: id, name: fund.name, exchange: "Israeli mutual fund", market: "IL" };
  return { ...base, symbol: id, name: fund.name, ...instrumentSaveFields(match, false) };
}

test("all four explicit UI quote locators retain their case through request parsing and saving", () => {
  for (const id of reported) {
    const parsed = parsePortfolioRequest(payloadFor(id));
    assert.equal(parsed.ok, true);
    const values = deriveAssetValues(parsed.value);
    assert.equal(values.quoteProviderInstrumentId, payloadFor(id).quoteProviderInstrumentId);
    assert.equal(values.quoteProviderInstrumentId, values.providerInstrumentId);
  }
});

test("captured supported fund NAVs convert agorot exactly once and retain their full source date", () => {
  for (const [id, price, date] of supported) assert.deepEqual(parseKeren44FundClose(fixture(id), id), { price, currency: "ILS", provider: "keren44", priceAsOf: `${date}T15:00:00.000Z` });
});

test("base/exposure currencies do not change domestic agorot NAV denomination", () => {
  for (const [id, price] of supported) {
    const [match] = searchKeren44Funds(discovery, id);
    assert.equal(match.symbol, id);
    assert.equal(match.currency, "ILS");
    assert.equal(parseKeren44FundClose(fixture(id), id).price, price);
  }
});

test("real USD-unit funds and foreign ETFs remain unavailable for ILS automatic pricing", () => {
  for (const id of counterexamples) {
    assert.equal(searchKeren44Funds(discovery, id).length, 0);
    assert.throws(() => parseKeren44FundClose(fixture(id), id), /currency unverifiable/);
  }
  // Base ILS alone cannot override genuine dollar unit denomination.
  assert.equal(discovery.funds.find(fund => fund.fundId === "5127089").currency, "ILS");
  // Explicit denomination labels also fail closed if a flag changes incorrectly.
  for (const id of ["5141007", "5115795", "5127089"]) {
    const fund = discovery.funds.find(fund => fund.fundId === id);
    assert.equal(searchKeren44Funds({ funds: [{ ...fund, unitsInUsd: false }] }, id).length, 0);
    assert.throws(() => parseKeren44FundClose(changedFund(id, { unitsInUsd: false }), id), /currency unverifiable/);
  }
});

test("discovery and closing-price parsing use the same strict unit metadata rule", () => {
  const original = discovery.funds.find(fund => fund.fundId === "5136064");
  for (const patch of [
    { unitsInUsd: true }, { unitsInUsd: undefined }, { unitsInUsd: null }, { unitsInUsd: "false" }, { unitsInUsd: 0 },
    { isForeignEtf: true }, { isForeignEtf: undefined }, { isForeignEtf: null }, { isForeignEtf: "false" },
    { isin: null }, { isin: "IE00B5BMR087" }, { isin: "IL0051399025" },
    { currency: undefined }, { currency: null }, { currency: "AED" }, { currency: "XYZ" },
    { fundType: "etf" }, { fundType: "hedge" }, { fundType: undefined },
    { name: "קרן נקובה אירו" }, { name: "Euro denominated fund" }, { name: undefined },
  ]) {
    assert.equal(searchKeren44Funds({ funds: [{ ...original, ...patch }] }, original.fundId).length, 0);
    assert.throws(() => parseKeren44FundClose(changedFund(original.fundId, patch), original.fundId), /currency unverifiable/);
  }
});

test("malformed, changed and wrong-security responses fail closed", () => {
  const html = fixture("5124482");
  for (const changed of [
    "<html>temporarily unavailable</html>",
    html.replace("&quot;nav&quot;:[0,325.2]", "&quot;nav&quot;:[0,null]"),
    html.replace("&quot;nav&quot;:[0,325.2]", "&quot;nav&quot;:[0,0]"),
    html.replace("&quot;nav&quot;:[0,325.2]", "&quot;nav&quot;:[0,-1]"),
    html.replace("&quot;nav&quot;:[0,325.2]", "&quot;nav&quot;:[0,1e999]"),
    html.replace("2026-10-08", "2026-02-30"),
    html.replace("2026-10-08", "08/10"),
    html.replace("latestNavDate", "renamedDate"),
    html.replace("&quot;unitsInUsd&quot;:[0,false]", "&quot;unitsInUsd&quot;:[0,true]"),
    html.replace("&quot;currency&quot;:[0,&quot;ILS&quot;]", "&quot;currency&quot;:[0,null]"),
    html.replace("&quot;fundId&quot;", "broken-json"),
    fixture("5138631"),
  ]) assert.throws(() => parseKeren44FundClose(changed, "5124482"), /Fund NAV/);
  assert.throws(() => parseKeren44FundClose(`${fixture("5138631")}<p>5124482</p>`, "5124482"), /expected security/);
  assert.equal(parseKeren44FundClose(fixture("5138631") + html, "5124482").price, 3.252);
});

test("actual provider requests preserve slugs, resolve numeric IDs and surface upstream errors", async t => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async url => {
    requests.push(url);
    if (url.endsWith("funds.json")) return Response.json(discovery);
    const fund = discovery.funds.find(fund => url === `https://keren44.co.il/fund/${encodeURIComponent(fund.slug)}-${fund.fundId}`);
    return new Response(fund ? fixture(fund.fundId) : "Not found", { status: fund ? 200 : 404 });
  });
  for (const [id, price] of supported) assert.equal((await marketData.getDailyClose(payloadFor(id).quoteProviderInstrumentId, "keren44")).price, price);
  for (const id of reported) assert.equal((await marketData.getDailyClose(id, "keren44")).price, supported.find(row => row[0] === id)[1]);
  for (const id of reported) await assert.rejects(marketData.getDailyClose(payloadFor(id).quoteProviderInstrumentId.toUpperCase(), "keren44"), /404/);
  for (const id of counterexamples) {
    await assert.rejects(marketData.getDailyClose(payloadFor(id).quoteProviderInstrumentId, "keren44"), /currency unverifiable/);
    await assert.rejects(marketData.getDailyClose(id, "keren44"), /Unsupported Israeli fund/);
  }
  assert.ok(requests.some(url => url.includes("sp500-ktf")));
  for (const status of [429, 500, 503]) {
    t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status }));
    await assert.rejects(marketData.getDailyClose(payloadFor("5124482").quoteProviderInstrumentId, "keren44"), new RegExp(String(status)));
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error("timeout"); });
  await assert.rejects(marketData.getDailyClose(payloadFor("5124482").quoteProviderInstrumentId, "keren44"), /timeout/);
});

test("automatic save failures leave all database state intact; successful saves and valid cache retain units and dates", async t => {
  const d1 = memoryD1();
  env.DB = d1;
  try {
    await ensureSchema();
    d1.sqlite.exec("INSERT INTO accounts (id,owner_email,name,kind,cash_balance,cash_currency) VALUES (1,'test@local','Test','broker',0,'ILS')");
    const context = { db: await getDb(), owner: "test@local" };
    const state = () => ["accounts", "instruments", "instrument_quotes", "holdings", "settings", "snapshots", "wealth_flows", "change_log"].map(table => d1.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const save = (id, patch = {}) => {
      const parsed = parsePortfolioRequest({ ...payloadFor(id), ...patch });
      assert.equal(parsed.ok, true);
      return handleMutation(parsed.value, context);
    };
    t.mock.method(globalThis, "fetch", async url => {
      const fund = discovery.funds.find(fund => url === `https://keren44.co.il/fund/${encodeURIComponent(fund.slug)}-${fund.fundId}`);
      return new Response(fund ? fixture(fund.fundId) : "Not found", { status: fund ? 200 : 404 });
    });
    for (const [id, price, date] of supported) {
      assert.equal((await save(id)).status, 200);
      const holding = d1.sqlite.prepare("SELECT * FROM holdings WHERE symbol=?").get(id);
      assert.equal(holding.current_price, price);
      assert.equal(holding.average_price, 1);
      const quote = d1.sqlite.prepare("SELECT * FROM instrument_quotes WHERE instrument_id=?").get(holding.instrument_id);
      assert.equal(quote.price_as_of, `${date}T15:00:00.000Z`);
      assert.equal(quote.currency, "ILS");
      const audit = d1.sqlite.prepare("SELECT * FROM change_log WHERE entity_id=? AND event_type='asset.created'").get(holding.id);
      assert.equal(JSON.parse(audit.after_json).instrumentId, holding.instrument_id);
      assert.equal(JSON.parse(audit.after_json).id, holding.id);
    }
    for (const id of counterexamples) {
      const before = state();
      assert.equal((await save(id)).status, 503);
      assert.deepEqual(state(), before);
    }
    const target = d1.sqlite.prepare("SELECT * FROM holdings WHERE symbol='5124482'").get();
    const quoteBefore = d1.sqlite.prepare("SELECT * FROM instrument_quotes WHERE instrument_id=?").get(target.instrument_id);
    // Also cover a late database failure, after instrument and quote statements.
    d1.sqlite.exec("CREATE TRIGGER fail_auto BEFORE INSERT ON holdings WHEN NEW.symbol='5124482' BEGIN SELECT RAISE(ABORT,'test save failure'); END");
    const beforeSqlFailure = state();
    await assert.rejects(save("5124482", { name: "Must roll back" }), /test save failure/);
    assert.deepEqual(state(), beforeSqlFailure);
    d1.sqlite.exec("DROP TRIGGER fail_auto");
    d1.sqlite.exec("DELETE FROM holdings WHERE symbol='5127600'; DELETE FROM instruments WHERE symbol='5127600'");
    d1.sqlite.exec("CREATE TRIGGER fail_new_auto BEFORE INSERT ON holdings WHEN NEW.symbol='5127600' BEGIN SELECT RAISE(ABORT,'test new instrument failure'); END");
    const beforeNewSqlFailure = state();
    await assert.rejects(save("5127600"), /test new instrument failure/);
    assert.deepEqual(state(), beforeNewSqlFailure);
    d1.sqlite.exec("DROP TRIGGER fail_new_auto");
    d1.sqlite.exec("CREATE TRIGGER fail_edit_auto BEFORE UPDATE ON holdings WHEN NEW.symbol='5124482' BEGIN SELECT RAISE(ABORT,'test edit failure'); END");
    const beforeEditSqlFailure = state();
    await assert.rejects(save("5124482", { id: target.id, name: "Must roll back" }), /test edit failure/);
    assert.deepEqual(state(), beforeEditSqlFailure);
    d1.sqlite.exec("DROP TRIGGER fail_edit_auto");
    // Source identity/unit contradictions must not be hidden by a cached quote.
    for (const html of [fixture("5138631"), changedFund("5124482", { unitsInUsd: true }), changedFund("5124482", { isForeignEtf: true }), changedFund("5124482", { currency: "XYZ" })]) {
      t.mock.method(globalThis, "fetch", async () => new Response(html));
      const before = state();
      assert.equal((await save("5124482", { id: target.id })).status, 503);
      assert.deepEqual(state(), before);
    }
    t.mock.method(globalThis, "fetch", async () => { throw new Error("upstream unavailable"); });
    // Remove one quote: both creating and editing must leave shared metadata untouched.
    d1.sqlite.prepare("DELETE FROM instrument_quotes WHERE instrument_id<>?").run(target.instrument_id);
    for (const id of reported) {
      if (id === "5124482") continue;
      const before = state();
      assert.equal((await save(id, { name: "Must not persist" })).status, 503);
      assert.deepEqual(state(), before);
    }
    const russell = d1.sqlite.prepare("SELECT * FROM holdings WHERE symbol='5138631'").get();
    const beforeEditFailure = state();
    assert.equal((await save("5138631", { id: russell.id, quantity: 99, name: "Must not persist" })).status, 503);
    assert.deepEqual(state(), beforeEditFailure);
    // A valid old cache can preserve valuation; it must never be stamped fresh.
    d1.sqlite.prepare("UPDATE instrument_quotes SET price_as_of=?,status='refresh_failed' WHERE instrument_id=?").run("2020-01-01T15:00:00.000Z", target.instrument_id);
    const cached = d1.sqlite.prepare("SELECT * FROM instrument_quotes WHERE instrument_id=?").get(target.instrument_id);
    assert.equal((await save("5124482", { id: target.id })).status, 200);
    assert.equal(d1.sqlite.prepare("SELECT current_price FROM holdings WHERE id=?").get(target.id).current_price, quoteBefore.price);
    assert.deepEqual(d1.sqlite.prepare("SELECT * FROM instrument_quotes WHERE instrument_id=?").get(target.instrument_id), cached);
    assert.equal(quoteIsStale(cached.price_as_of, "keren44"), true);
    for (const [column, value] of [["price", 0], ["currency", "USD"], ["provider", "yahoo"], ["price_as_of", "invalid"], ["status", "unverified"]]) {
      d1.sqlite.prepare(`UPDATE instrument_quotes SET ${column}=? WHERE instrument_id=?`).run(value, target.instrument_id);
      const before = state();
      assert.equal((await save("5124482", { id: target.id, name: "Must not persist" })).status, 503);
      assert.deepEqual(state(), before);
      d1.sqlite.prepare("UPDATE instrument_quotes SET price=?,currency=?,provider=?,price_as_of=?,status=? WHERE instrument_id=?").run(cached.price, cached.currency, cached.provider, cached.price_as_of, cached.status, target.instrument_id);
    }
    d1.sqlite.prepare("UPDATE instruments SET quote_provider_instrument_id='wrong-security' WHERE id=?").run(target.instrument_id);
    const beforeLocatorFailure = state();
    assert.equal((await save("5124482", { id: target.id })).status, 503);
    assert.deepEqual(state(), beforeLocatorFailure);
    d1.sqlite.exec("DELETE FROM instrument_quotes");
    for (const response of [
      () => new Response("unavailable", { status: 503 }),
      () => new Response("<html>changed source layout</html>"),
      () => new Response(fixture("5124482").replace("&quot;nav&quot;:[0,325.2]", "&quot;nav&quot;:[0,null]")),
      () => { throw new Error("network timeout"); },
    ]) {
      t.mock.method(globalThis, "fetch", async () => response());
      for (const id of reported) {
        const before = state();
        assert.equal((await save(id, { name: "Must not persist" })).status, 503);
        assert.deepEqual(state(), before);
      }
    }
  } finally {
    d1.sqlite.close();
    delete env.DB;
  }
});
