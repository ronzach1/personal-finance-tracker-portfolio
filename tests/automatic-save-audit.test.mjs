import assert from "node:assert/strict";
import test from "node:test";
import { env, memoryD1 } from "./helpers/portfolio-runtime.mjs";

const { getDb } = await import("../db/index.ts");
const { ensureSchema } = await import("../db/ensure.ts");
const { handleMutation } = await import("../app/api/portfolio/mutations.ts");
const { parsePortfolioRequest } = await import("../lib/portfolio-request.ts");
const { marketData } = await import("../lib/market-data.ts");
const { assetState } = await import("../lib/change-log.ts");
const { holdings } = await import("../db/schema.ts");

test("manual-to-automatic edit audits the newly created instrument and rolls back on audit failure", async t => {
  const d1 = memoryD1();
  env.DB = d1;
  try {
    await ensureSchema();
    d1.sqlite.exec("INSERT INTO accounts (id,owner_email,name,kind,cash_balance,cash_currency) VALUES (1,'audit@local','Synthetic account','broker',0,'ILS')");
    const context = { db: await getDb(), owner: "audit@local" };
    const manual = { action: "save_asset", accountId: 1, assetType: "index_fund", symbol: "5124482", name: "Synthetic fund", currency: "ILS", quantity: 2, averagePrice: 1, currentPrice: 3.252, liquidity: "invested", costMode: "average", priceUnit: "currency" };
    const save = async payload => {
      const parsed = parsePortfolioRequest(payload);
      assert.equal(parsed.ok, true);
      return handleMutation(parsed.value, context);
    };
    assert.equal((await save(manual)).status, 200);
    const [before] = await context.db.select().from(holdings);
    assert.equal(before.instrumentId, null);
    assert.equal(before.priceMode, "manual");
    assert.equal(d1.sqlite.prepare("SELECT count(*) AS count FROM instruments").get().count, 0);
    const automatic = { ...manual, id: before.id, instrumentProvider: "keren44", providerInstrumentId: "5124482::קסם-sp500-ktf", quoteProvider: "keren44", quoteProviderInstrumentId: "5124482::קסם-sp500-ktf" };
    t.mock.method(marketData, "getDailyClose", async () => ({ price: manual.currentPrice, currency: "ILS", provider: "keren44", priceAsOf: "2026-10-08T15:00:00.000Z" }));
    const databaseState = () => ["holdings", "instruments", "instrument_quotes", "change_log", "snapshots"].map(table => d1.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    // The failure occurs after the instrument, quote and holding statements.
    d1.sqlite.exec("CREATE TRIGGER fail_conversion_audit BEFORE INSERT ON change_log WHEN NEW.event_type='asset.updated' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    const beforeFailure = databaseState();
    await assert.rejects(save(automatic), /synthetic audit failure/);
    assert.deepEqual(databaseState(), beforeFailure);
    d1.sqlite.exec("DROP TRIGGER fail_conversion_audit");

    assert.equal((await save(automatic)).status, 200);
    const [after] = await context.db.select().from(holdings);
    assert.equal(after.id, before.id);
    assert.equal(after.priceMode, "automatic");
    assert.ok(Number.isInteger(after.instrumentId) && after.instrumentId > 0);
    const instrument = d1.sqlite.prepare("SELECT * FROM instruments WHERE id=?").get(after.instrumentId);
    assert.equal(instrument.provider_instrument_id, automatic.providerInstrumentId);
    assert.equal(d1.sqlite.prepare("SELECT instrument_id FROM instrument_quotes").get().instrument_id, after.instrumentId);
    const audits = d1.sqlite.prepare("SELECT * FROM change_log WHERE event_type='asset.updated' AND entity_id=?").all(before.id);
    assert.equal(audits.length, 1);
    const audit = audits[0];
    assert.equal(audit.entity_type, "asset");
    assert.deepEqual(JSON.parse(audit.before_json), assetState({ ...before, depositDetails: null }));
    assert.deepEqual(JSON.parse(audit.after_json), assetState({ ...after, depositDetails: null }));
    assert.equal(JSON.parse(audit.before_json).instrumentId, null);
    assert.equal(JSON.parse(audit.after_json).instrumentId, after.instrumentId);
    const changed = JSON.parse(audit.changed_fields_json);
    assert.deepEqual(changed, ["instrumentId", "priceMode", "manualPriceReviewedAt"]);
    assert.equal(new Set(changed).size, changed.length);
    assert.equal(audit.metadata_json, null);
    // A repeat using the now-known instrument must not invent a new change.
    assert.equal((await save(automatic)).status, 200);
    assert.equal(d1.sqlite.prepare("SELECT count(*) AS count FROM change_log WHERE event_type='asset.updated'").get().count, 1);
    const createdAudit = d1.sqlite.prepare("SELECT * FROM change_log WHERE event_type='asset.created'").get();
    assert.equal(createdAudit.changed_fields_json, null);
    assert.equal(JSON.parse(createdAudit.after_json).instrumentId, null);

    // A legacy automatic holding lacking an instrument must also retain the
    // event when resolving its new instrument is the only business change.
    const instrumentOnlyManual = { ...manual, symbol: "5138631" };
    assert.equal((await save(instrumentOnlyManual)).status, 200);
    d1.sqlite.exec("UPDATE holdings SET price_mode='automatic',manual_price_reviewed_at=NULL WHERE symbol='5138631'");
    const beforeInstrumentOnly = (await context.db.select().from(holdings)).find(row => row.symbol === "5138631");
    const locator = "5138631::קסם-ru20n30u-ktf";
    assert.equal((await save({ ...instrumentOnlyManual, id: beforeInstrumentOnly.id, instrumentProvider: "keren44", providerInstrumentId: locator, quoteProvider: "keren44", quoteProviderInstrumentId: locator })).status, 200);
    const afterInstrumentOnly = (await context.db.select().from(holdings)).find(row => row.id === beforeInstrumentOnly.id);
    const instrumentOnlyAudit = d1.sqlite.prepare("SELECT * FROM change_log WHERE event_type='asset.updated' AND entity_id=?").get(beforeInstrumentOnly.id);
    assert.ok(instrumentOnlyAudit, "instrument-only updates must not be omitted as no-ops");
    assert.deepEqual(JSON.parse(instrumentOnlyAudit.changed_fields_json), ["instrumentId"]);
    assert.deepEqual(JSON.parse(instrumentOnlyAudit.before_json), assetState({ ...beforeInstrumentOnly, depositDetails: null }));
    assert.deepEqual(JSON.parse(instrumentOnlyAudit.after_json), assetState({ ...afterInstrumentOnly, depositDetails: null }));
  } finally {
    d1.sqlite.close();
    delete env.DB;
  }
});
