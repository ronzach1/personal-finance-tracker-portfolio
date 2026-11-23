import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { env, memoryD1 } from "./helpers/portfolio-runtime.mjs";

const { getDb } = await import("../db/index.ts");
const { ensureSchema } = await import("../db/ensure.ts");
const { handleMutation } = await import("../app/api/portfolio/mutations.ts");
const { handleBackup } = await import("../app/api/portfolio/backup.ts");
const { readPortfolio } = await import("../app/api/portfolio/read.ts");
const { parsePortfolioRequest } = await import("../lib/portfolio-request.ts");
const { geographyOptions, sectorOptions } = await import("../app/components/portfolio-ui.ts");
const { marketData } = await import("../lib/market-data.ts");
const { currentInvestmentPl, trackedWealthIls } = await import("../lib/finance.ts");

test("additive schema, actual save/edit/read/audit, and atomic modern/legacy backup restore", async (t) => {
  const d1 = memoryD1();
  env.DB = d1;
  try {
    // Runtime initialization owns several historical tables absent from the migration chain.
    // Remove only the new column to model the pre-alias schema, then verify both upgrade paths.
    await ensureSchema();
    d1.sqlite.exec("ALTER TABLE holdings DROP COLUMN display_alias");
    d1.sqlite.exec("INSERT INTO accounts (id,owner_email,name,kind,cash_balance,cash_currency) VALUES (1,'test@local','Test account','broker',100,'ILS')");
    d1.sqlite.exec("INSERT INTO holdings (id,owner_email,account_id,symbol,name,asset_type,currency,quantity,average_price,current_price,liquidity) VALUES (1,'test@local',1,'OLD','Existing holding','stock','ILS',2,10,20,'invested')");
    const original = d1.sqlite.prepare("SELECT * FROM holdings WHERE id=1").get();
    const migration = readFileSync(new URL("../drizzle/0011_crazy_ben_grimm.sql", import.meta.url), "utf8");
    assert.match(migration, /^ALTER TABLE `holdings` ADD `display_alias` text;\s*$/);
    const { ensureSchema: upgradeSchema } = await import("../db/ensure.ts?upgrade");
    await upgradeSchema();
    await upgradeSchema();
    assert.equal(d1.sqlite.prepare("SELECT display_alias FROM holdings WHERE id=1").get().display_alias, null);
    d1.sqlite.exec("ALTER TABLE holdings DROP COLUMN display_alias");
    d1.sqlite.exec(migration);
    const migrated = d1.sqlite.prepare("SELECT * FROM holdings WHERE id=1").get();
    assert.equal(migrated.display_alias, null);
    for (const key of Object.keys(original).filter(key => key !== "exposure_mode")) assert.equal(migrated[key], original[key]);
    d1.sqlite.prepare("INSERT INTO settings (owner_email,language,usd_ils_rate,usd_ils_rate_mode,onboarding_complete,wealth_flow_tracking_started_at) VALUES (?,?,?,?,?,?)").run("test@local", "en", 4, "manual", 1, "2026-01-01T00:00:00.000Z");
    const context = { db: await getDb(), owner: "test@local" };
    const save = async (payload) => {
      const parsed = parsePortfolioRequest(payload);
      assert.equal(parsed.ok, true);
      const response = await handleMutation(parsed.value, context);
      assert.equal(response.ok, true, await response.text());
    };
    const base = { action: "save_asset", accountId: 1, assetType: "stock", symbol: "TEST", name: "Test Company", currency: "ILS", quantity: 2, averagePrice: 100, currentPrice: 110, liquidity: "invested", costMode: "average", priceUnit: "currency" };
    for (let i = 0; i < Math.max(geographyOptions.length, sectorOptions.length); i++) {
      await save({ ...base, symbol: `TEST${i}`, displayAlias: i % 2 ? null : `Family ${i} – USD`, geography: geographyOptions[i % geographyOptions.length], sector: sectorOptions[i % sectorOptions.length] });
    }
    const quoteCalls = [];
    t.mock.method(marketData, "getDailyClose", async (locator, provider) => {
      quoteCalls.push([locator, provider]);
      return { price: 110, currency: locator.endsWith(".TA") ? "ILS" : "USD", priceAsOf: new Date().toISOString(), provider };
    });
    for (const identity of [
      { symbol: "NVDA", name: "NVIDIA Corporation", currency: "USD", instrumentProvider: "yahoo", providerInstrumentId: "NVDA" },
      { symbol: "BEZQ", name: "Bezeq", currency: "ILS", instrumentProvider: "tase", providerInstrumentId: "230011", quoteProvider: "yahoo", quoteProviderInstrumentId: "BEZQ.TA" },
    ]) {
      const auto = { ...base, ...identity, geography: "global", sector: "financials", displayAlias: "Personal label" };
      await save(auto);
      const before = (await readPortfolio(context)).holdings.find(row => row.symbol === identity.symbol);
      await save({ ...auto, id: before.id, displayAlias: "Changed label" });
      const after = (await readPortfolio(context)).holdings.find(row => row.id === before.id);
      for (const key of ["symbol", "name", "instrumentId", "currentPrice", "averagePrice", "quantity", "geography", "sector"]) assert.equal(after[key], before[key]);
    }
    assert.deepEqual(quoteCalls, [["NVDA", "yahoo"], ["NVDA", "yahoo"], ["BEZQ.TA", "yahoo"], ["BEZQ.TA", "yahoo"]]);
    await save({ action: "save_wealth_flow", direction: "in", originalAmount: 10, currency: "ILS", ilsValue: 10, relatedAccountId: 1, occurredAt: "2026-01-02T00:00:00.000Z" });
    let portfolio = await readPortfolio(context);
    const target = portfolio.holdings.find(row => row.symbol === "TEST0");
    const beforePl = currentInvestmentPl(portfolio.holdings, 4);
    const beforeWealth = trackedWealthIls(portfolio.accounts, portfolio.holdings, 4);
    await save({ ...base, id: target.id, symbol: target.symbol, geography: target.geography, sector: target.sector, displayAlias: "  Family long-term  " });
    await save({ ...base, id: target.id, symbol: target.symbol, geography: target.geography, sector: target.sector });
    portfolio = await readPortfolio(context);
    assert.equal(portfolio.holdings.find(row => row.id === target.id).displayAlias, "Family long-term", "old clients must not clear aliases");
    assert.deepEqual(currentInvestmentPl(portfolio.holdings, 4), beforePl);
    assert.equal(trackedWealthIls(portfolio.accounts, portfolio.holdings, 4), beforeWealth);
    const log = d1.sqlite.prepare("SELECT changed_fields_json FROM change_log WHERE event_type='asset.updated' ORDER BY id DESC LIMIT 1").get();
    assert.deepEqual(JSON.parse(log.changed_fields_json), ["displayAlias"]);
    const exported = await (await handleBackup({ action: "export_backup" }, context)).json();
    const restore = backup => handleBackup({ action: "restore_backup", backup }, context);
    assert.equal((await restore(exported)).status, 200);
    const roundTrip = await (await handleBackup({ action: "export_backup" }, context)).json();
    const metadata = backup => backup.data.holdings.map(({ symbol, name, displayAlias, geography, sector, quantity, averagePrice, currentPrice }) => ({ symbol, name, displayAlias, geography, sector, quantity, averagePrice, currentPrice }));
    assert.deepEqual(metadata(roundTrip), metadata(exported));
    assert.deepEqual(roundTrip.data.snapshots.map(({ totalIls, capturedAt }) => ({ totalIls, capturedAt })), exported.data.snapshots.map(({ totalIls, capturedAt }) => ({ totalIls, capturedAt })));
    const flows = backup => backup.data.wealthFlows.map(({ direction, originalAmount, currency, ilsValue, occurredAt }) => ({ direction, originalAmount, currency, ilsValue, occurredAt }));
    assert.deepEqual(flows(roundTrip), flows(exported));
    assert.equal(roundTrip.data.wealthFlows[0].relatedAccountId, roundTrip.data.accounts[0].id);
    assert.deepEqual(roundTrip.data.instruments, exported.data.instruments);

    const invalid = structuredClone(roundTrip);
    invalid.data.holdings[0].displayAlias = { bad: true };
    assert.equal((await restore(invalid)).status, 400);
    assert.deepEqual(metadata(await (await handleBackup({ action: "export_backup" }, context)).json()), metadata(roundTrip));
    // A late SQL failure must roll back the deletes and all earlier inserts.
    d1.sqlite.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON holdings WHEN NEW.symbol='FAIL' BEGIN SELECT RAISE(ABORT,'test failure'); END");
    const failing = structuredClone(roundTrip);
    failing.data.holdings.at(-1).symbol = "FAIL";
    assert.equal((await restore(failing)).status, 500);
    assert.deepEqual(metadata(await (await handleBackup({ action: "export_backup" }, context)).json()), metadata(roundTrip));
    const legacy = structuredClone(roundTrip);
    for (const row of legacy.data.holdings) delete row.displayAlias;
    delete legacy.data.wealthFlows;
    delete legacy.data.settings.wealthFlowTrackingStartedAt;
    assert.equal((await restore(legacy)).status, 200);
    const restored = await readPortfolio(context);
    assert.ok(restored.holdings.every(row => row.displayAlias === null));
    assert.deepEqual(currentInvestmentPl(restored.holdings, 4), beforePl);
    assert.equal(trackedWealthIls(restored.accounts, restored.holdings, 4), beforeWealth);
    const clearedTarget = restored.holdings.find(row => row.symbol === "TEST0");
    await save({ ...base, id: clearedTarget.id, accountId: clearedTarget.accountId, displayAlias: "Alias" });
    await save({ ...base, id: clearedTarget.id, accountId: clearedTarget.accountId, displayAlias: " " });
    assert.equal((await readPortfolio(context)).holdings.find(row => row.id === clearedTarget.id).displayAlias, null);
  } finally {
    d1.sqlite.close();
    delete env.DB;
  }
});

test("account fee migration, persistence, audit, backup compatibility and metadata-only financial semantics", async () => {
  const d1 = memoryD1();
  env.DB = d1;
  try {
    const { ensureSchema: initialize } = await import("../db/ensure.ts?fee-initialize");
    await initialize();
    d1.sqlite.exec("ALTER TABLE accounts DROP COLUMN annual_management_fee_percent");
    d1.sqlite.exec("INSERT INTO accounts (id,owner_email,name,kind,cash_balance,cash_currency) VALUES (1,'fee@local','Existing broker','broker',100,'ILS')");
    d1.sqlite.exec("INSERT INTO holdings (id,owner_email,account_id,symbol,name,asset_type,currency,quantity,average_price,current_price,liquidity) VALUES (1,'fee@local',1,'TEST','Test security','stock','ILS',2,10,20,'invested')");
    const original = d1.sqlite.prepare("SELECT * FROM accounts WHERE id=1").get();
    const rootPage = () => d1.sqlite.prepare("SELECT rootpage FROM sqlite_schema WHERE name='accounts'").get().rootpage;
    const originalRoot = rootPage();
    const { ensureSchema: upgrade } = await import("../db/ensure.ts?fee-upgrade");
    await upgrade();
    await upgrade();
    const upgraded = d1.sqlite.prepare("SELECT * FROM accounts WHERE id=1").get();
    assert.deepEqual({ ...upgraded }, { ...original, annual_management_fee_percent: null });
    assert.equal(rootPage(), originalRoot, "runtime upgrade must not rebuild accounts");
    d1.sqlite.exec("ALTER TABLE accounts DROP COLUMN annual_management_fee_percent");
    const migration = readFileSync(new URL("../drizzle/0012_chemical_ink.sql", import.meta.url), "utf8");
    assert.match(migration, /^ALTER TABLE `accounts` ADD `annual_management_fee_percent` real;\s*$/);
    d1.sqlite.exec(migration);
    assert.deepEqual(d1.sqlite.prepare("SELECT * FROM accounts WHERE id=1").get(), upgraded);
    assert.equal(rootPage(), originalRoot, "generated migration must not rebuild accounts");
    assert.equal(d1.sqlite.prepare("SELECT account_id FROM holdings WHERE id=1").get().account_id, 1);
    d1.sqlite.prepare("INSERT INTO settings (owner_email,language,usd_ils_rate,usd_ils_rate_mode,onboarding_complete,wealth_flow_tracking_started_at) VALUES (?,?,?,?,?,?)").run("fee@local", "en", 4, "manual", 1, "2026-01-01T00:00:00.000Z");
    const context = { db: await getDb(), owner: "fee@local" };
    const save = async payload => {
      const parsed = parsePortfolioRequest(payload);
      assert.equal(parsed.ok, true);
      const response = await handleMutation(parsed.value, context);
      assert.equal(response.ok, true, await response.text());
    };
    const account = { action: "save_account", name: "Existing broker", kind: "broker", cashBalance: 100, cashCurrency: "ILS" };
    const exported = async () => (await handleBackup({ action: "export_backup" }, context)).json();
    const restore = backup => handleBackup({ action: "restore_backup", backup }, context);
    for (const [name, fee] of [["Unknown", undefined], ["Free", 0], ["Managed", 0.8]]) {
      await save({ ...account, name, annualManagementFeePercent: fee });
      const created = (await readPortfolio(context)).accounts.find(row => row.name === name);
      assert.equal(created.annualManagementFeePercent, fee ?? null);
      const log = d1.sqlite.prepare("SELECT after_json FROM change_log WHERE event_type='account.created' AND entity_id=?").get(created.id);
      assert.equal(JSON.parse(log.after_json).annualManagementFeePercent, fee ?? null);
    }
    await save({ action: "save_wealth_flow", direction: "in", originalAmount: 10, currency: "ILS", ilsValue: 10, relatedAccountId: 1, occurredAt: "2026-02-02T00:00:00.000Z" });
    d1.sqlite.exec("UPDATE snapshots SET captured_at='2026-02-01T00:00:00.000Z',total_ils=400");
    const before = await readPortfolio(context);
    assert.notEqual(before.wealthFlowAttribution, null);
    const financialState = portfolio => ({
      wealth: trackedWealthIls(portfolio.accounts, portfolio.holdings, 4),
      pl: currentInvestmentPl(portfolio.holdings, 4),
      holdings: portfolio.holdings,
      snapshots: portfolio.snapshots,
      flows: portfolio.wealthFlows,
      attribution: portfolio.wealthFlowAttribution,
    });
    for (const annualManagementFeePercent of [0.8, 0, null, 100, ""]) {
      await save({ ...account, id: 1, annualManagementFeePercent });
      const after = await readPortfolio(context);
      assert.equal(after.accounts[0].annualManagementFeePercent, annualManagementFeePercent === "" ? null : annualManagementFeePercent);
      assert.deepEqual(financialState(after), financialState(before));
      const log = d1.sqlite.prepare("SELECT changed_fields_json,after_json FROM change_log WHERE event_type='account.updated' ORDER BY id DESC LIMIT 1").get();
      assert.deepEqual(JSON.parse(log.changed_fields_json), ["annualManagementFeePercent"]);
      assert.equal(JSON.parse(log.after_json).annualManagementFeePercent, annualManagementFeePercent === "" ? null : annualManagementFeePercent);
    }
    await save({ ...account, id: 1, annualManagementFeePercent: 0.8 });
    await save({ ...account, id: 1, kind: "bank" });
    assert.equal((await readPortfolio(context)).accounts[0].annualManagementFeePercent, 0.8, "omitting fee, including when changing kind, preserves it");
    await save({ action: "archive_account", id: 1 });
    await save({ action: "restore_account", id: 1 });
    assert.equal((await readPortfolio(context)).accounts[0].annualManagementFeePercent, 0.8);

    const modern = await exported();
    assert.equal((await restore(modern)).status, 200);
    const roundTrip = await exported();
    const metadata = backup => backup.data.accounts.map(({ name, kind, cashBalance, cashCurrency, annualManagementFeePercent }) => ({ name, kind, cashBalance, cashCurrency, annualManagementFeePercent }));
    assert.deepEqual(metadata(roundTrip), metadata(modern));
    assert.equal(roundTrip.data.accounts.find(row => row.name === "Free").annualManagementFeePercent, 0);
    const databaseState = () => ["accounts", "holdings", "settings", "snapshots", "wealth_flows", "change_log", "instruments", "instrument_quotes", "deposit_details", "deposit_exit_points"].map(table => d1.sqlite.prepare(`SELECT * FROM ${table}`).all());
    const beforeInvalid = databaseState();
    for (const value of [-1, 100.01, NaN, Infinity, -Infinity, "", "0", "0.8", false, true, {}, []]) {
      const invalid = structuredClone(roundTrip);
      invalid.data.accounts[0].annualManagementFeePercent = value;
      assert.equal((await restore(invalid)).status, 400);
      assert.deepEqual(databaseState(), beforeInvalid, "invalid fee must not change any data or audit history");
    }
    const legacy = structuredClone(roundTrip);
    for (const row of legacy.data.accounts) delete row.annualManagementFeePercent;
    assert.equal((await restore(legacy)).status, 200);
    const restored = await readPortfolio(context);
    assert.ok(restored.accounts.every(row => row.annualManagementFeePercent === null));
    assert.equal(trackedWealthIls(restored.accounts, restored.holdings, 4), financialState(before).wealth);
    assert.deepEqual(currentInvestmentPl(restored.holdings, 4), financialState(before).pl);

    // The editor's existing internal-transfer path must save fee changes in its atomic batch.
    const [source, destination] = restored.accounts;
    const transfer = { action: "internal_transfer", sourceAccountId: source.id, destinationAccountId: destination.id, sourceCurrency: "ILS", destinationCurrency: "ILS", sourceName: source.name, sourceKind: source.kind };
    for (const [sourceBalance, destinationBalance, fee] of [[90, 110, 0.8], [80, 120, undefined], [70, 130, 0], [60, 140, null]]) {
      await save({ ...transfer, sourceBalance, destinationBalance, sourceAnnualManagementFeePercent: fee });
      const after = await readPortfolio(context);
      assert.equal(after.accounts.find(row => row.id === source.id).annualManagementFeePercent, fee === undefined ? 0.8 : fee);
      assert.equal(trackedWealthIls(after.accounts, after.holdings, 4), financialState(before).wealth);
      assert.deepEqual(after.wealthFlows, restored.wealthFlows);
    }

    const { onboardPortfolio } = await import("../app/api/portfolio/onboarding.ts");
    const onboardingContext = { ...context, owner: "new-fee@local" };
    const onboard = parsePortfolioRequest({ action: "onboard", language: "en", usdIlsRateMode: "manual", usdIlsRate: 4, holdings: [], accounts: [undefined, null, 0, 0.8].map((fee, index) => ({ clientId: `account${index}`, name: `New ${index}`, kind: "broker", cashBalance: 0, cashCurrency: "ILS", annualManagementFeePercent: fee })) });
    assert.equal(onboard.ok, true);
    assert.equal((await onboardPortfolio(onboard.value, onboardingContext)).status, 200);
    const initialPortfolio = await readPortfolio(onboardingContext);
    assert.deepEqual(initialPortfolio.accounts.map(row => row.annualManagementFeePercent), [null, null, 0, 0.8]);
    const initialLogs = d1.sqlite.prepare("SELECT after_json FROM change_log WHERE owner_email='new-fee@local' AND event_type='account.created' ORDER BY id").all();
    assert.deepEqual(initialLogs.map(row => JSON.parse(row.after_json).annualManagementFeePercent), [null, null, 0, 0.8]);
  } finally {
    d1.sqlite.close();
    delete env.DB;
  }
});
