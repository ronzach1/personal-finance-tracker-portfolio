import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { wealthFlowChangeEvent } from "../lib/change-log.ts";
import { isExplicitUtcIso, localDateTimeToStoredIso, storedIsoToLocalDateTime } from "../lib/datetime-local.ts";
import { wealthFlowAttribution } from "../lib/finance.ts";
import { newWealthFlowId, remapWealthFlowAccountId, restoredWealthFlowTrackingState, validWealthFlowBackupRows, wealthFlowCreateRecord } from "../lib/wealth-flow.ts";

test("datetime-local conversions preserve Jerusalem summer and winter wall clocks", () => {
  assert.equal(storedIsoToLocalDateTime("2026-07-01T20:30:00.000Z", -180), "2026-07-01T23:30");
  assert.equal(localDateTimeToStoredIso("2026-07-01T23:30", -180), "2026-07-01T20:30:00.000Z");
  assert.equal(storedIsoToLocalDateTime("2026-01-01T21:30:00.000Z", -120), "2026-01-01T23:30");
  assert.equal(localDateTimeToStoredIso("2026-01-01T23:30", -120), "2026-01-01T21:30:00.000Z");
});

test("datetime-local conversions round-trip across a Jerusalem midnight boundary", () => {
  const instant = "2026-07-01T21:30:00.000Z";
  const local = storedIsoToLocalDateTime(instant, -180);
  assert.equal(local, "2026-07-02T00:30");
  assert.equal(localDateTimeToStoredIso(local, -180), instant);
});

test("persisted tracking-baseline SQL always emits explicit UTC ISO text", async () => {
  const [migration, ensure] = await Promise.all([readFile(new URL("../drizzle/0007_zippy_ultimates.sql", import.meta.url), "utf8"), readFile(new URL("../db/ensure.ts", import.meta.url), "utf8")]);
  assert.match(migration, /strftime\('%Y-%m-%dT%H:%M:%fZ', 'now'\)/);
  assert.match(ensure, /strftime\('%Y-%m-%dT%H:%M:%fZ', 'now'\)/);
  assert.equal(isExplicitUtcIso("2026-08-22T12:34:56.789Z"), true);
  assert.equal(isExplicitUtcIso("2026-08-22 12:34:56"), false);
});

test("comparison boundaries exclude the snapshot instant and include the current instant", () => {
  const result = wealthFlowAttribution({ currentTrackedWealth: 120, previousSnapshot: { totalIls: 100, capturedAt: "2026-08-20T10:00:00.000Z" }, trackingStartedAt: "2026-08-20T09:00:00.000Z", now: "2026-08-20T12:00:00.000Z", flows: [
    { direction: "in", ilsValue: 1000, occurredAt: "2026-08-20T10:00:00.000Z" },
    { direction: "in", ilsValue: 10, occurredAt: "2026-08-20T10:00:00.001Z" },
    { direction: "out", ilsValue: 2, occurredAt: "2026-08-20T12:00:00.000Z" },
    { direction: "in", ilsValue: 1000, occurredAt: "2026-08-20T12:00:00.001Z" },
  ] });
  assert.equal(result?.netExternalFlow, 8);
  assert.equal(result?.residualChange, 12);
});

test("flow edits and deletion recalculate attribution from stored ILS values", () => {
  const base = { direction: "in", ilsValue: 365, occurredAt: "2026-08-21T11:00:00.000Z" };
  const input = { currentTrackedWealth: 1365, previousSnapshot: { totalIls: 1000, capturedAt: "2026-08-21T10:00:00.000Z" }, trackingStartedAt: "2026-08-20T10:00:00.000Z", now: "2026-08-21T12:00:00.000Z" };
  assert.equal(wealthFlowAttribution({ ...input, flows: [base] })?.residualChange, 0);
  assert.equal(wealthFlowAttribution({ ...input, flows: [{ ...base, ilsValue: 370 }] })?.residualChange, -5);
  assert.equal(wealthFlowAttribution({ ...input, flows: [] })?.residualChange, 365);
});

test("historical USD flows retain attributed ILS instead of using a later FX rate", () => {
  const result = wealthFlowAttribution({ currentTrackedWealth: 1370, previousSnapshot: { totalIls: 1000, capturedAt: "2026-08-21T10:00:00.000Z" }, trackingStartedAt: "2026-08-20T10:00:00.000Z", now: "2026-08-21T12:00:00.000Z", flows: [{ direction: "in", ilsValue: 370, occurredAt: "2026-08-21T11:00:00.000Z" }] });
  assert.equal(result?.netExternalFlow, 370);
  assert.equal(result?.residualChange, 0);
});

test("backup rows enforce ILS parity and reject meaningfully future flow timestamps", () => {
  const flow = { direction: "in", originalAmount: 100, currency: "ILS", ilsValue: 100, relatedAccountId: 4, occurredAt: "2026-08-21T11:00:00.000Z" };
  assert.equal(validWealthFlowBackupRows([{ ...flow, ilsValue: 5_000 }], new Set([4]), "2026-08-22T10:00:00.000Z"), false);
  assert.equal(validWealthFlowBackupRows([{ ...flow, currency: "USD", ilsValue: 370 }], new Set([4]), "2026-08-22T10:00:00.000Z"), true);
  assert.equal(validWealthFlowBackupRows([{ ...flow, occurredAt: "2026-08-22T10:06:00.000Z" }], new Set([4]), "2026-08-22T10:00:00.000Z"), false);
});

test("attribution has no arbitrary 1,000-flow dependency", () => {
  const flows = Array.from({ length: 1001 }, (_, index) => ({ direction: "in", ilsValue: 1, occurredAt: `2026-08-21T11:${String(Math.floor(index / 60) % 60).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z` }));
  const result = wealthFlowAttribution({ currentTrackedWealth: 2001, previousSnapshot: { totalIls: 1000, capturedAt: "2026-08-21T10:00:00.000Z" }, trackingStartedAt: "2026-08-20T10:00:00.000Z", now: "2026-08-22T12:00:00.000Z", flows });
  assert.equal(result?.moneyInIls, 1001);
  assert.equal(result?.residualChange, 0);
});

test("server attribution uses an unbounded comparison-range query separate from History limits", async () => {
  const readSource = await readFile(new URL("../app/api/portfolio/read.ts", import.meta.url), "utf8");
  const comparisonQuery = readSource.match(/const comparisonFlows = ([^;]+);/)?.[1] ?? "";
  assert.match(comparisonQuery, /julianday\(\$\{wealthFlows\.occurredAt\}\) > julianday\(\$\{previousSnapshot\.capturedAt\}\)/);
  assert.match(comparisonQuery, /julianday\(\$\{wealthFlows\.occurredAt\}\) <= julianday\(\$\{now\}\)/);
  assert.doesNotMatch(comparisonQuery, /\.limit\(/);
});

test("flow-enabled backup state is strict while legacy backup state restarts tracking", () => {
  const flow = { direction: "in", originalAmount: 100, currency: "USD", ilsValue: 370, relatedAccountId: 4, occurredAt: "2026-08-21T11:00:00.000Z" };
  assert.deepEqual(restoredWealthFlowTrackingState({ hasWealthFlows: false, wealthFlows: undefined, trackingStartedAt: undefined, now: "2026-08-22T10:00:00.000Z" }), { valid: true, trackingStartedAt: "2026-08-22T10:00:00.000Z", restoreFlows: false });
  assert.deepEqual(restoredWealthFlowTrackingState({ hasWealthFlows: true, wealthFlows: [flow], trackingStartedAt: "2026-08-20T10:00:00.000Z" }), { valid: true, trackingStartedAt: "2026-08-20T10:00:00.000Z", restoreFlows: true });
  assert.equal(restoredWealthFlowTrackingState({ hasWealthFlows: true, wealthFlows: {}, trackingStartedAt: "2026-08-20T10:00:00.000Z" }).valid, false);
  assert.equal(restoredWealthFlowTrackingState({ hasWealthFlows: true, wealthFlows: [flow], trackingStartedAt: "2026-08-20 10:00:00" }).valid, false);
  assert.equal(validWealthFlowBackupRows([flow], new Set([4])), true);
  assert.equal(validWealthFlowBackupRows([{ ...flow, relatedAccountId: 99 }], new Set([4])), false);
  assert.equal(validWealthFlowBackupRows([null], new Set([4])), false);
});

test("inconsistent flow-enabled backups are rejected before restore statements are prepared", async () => {
  const backupSource = await readFile(new URL("../app/api/portfolio/backup.ts", import.meta.url), "utf8");
  const extensionRejection = backupSource.indexOf("if (!restoredTracking.valid)");
  const rowRejection = backupSource.indexOf("if (!validHoldingMetadata || !validWealthFlows)");
  const databaseAccess = backupSource.indexOf('await import("cloudflare:workers")');
  assert.equal(extensionRejection > 0 && extensionRejection < databaseAccess, true);
  assert.equal(rowRejection > extensionRejection && rowRejection < databaseAccess, true);
});

test("backup related-account IDs remap to restored IDs", () => {
  const accountMap = new Map([[4, 104]]);
  assert.equal(remapWealthFlowAccountId(4, accountMap), 104);
  assert.equal(remapWealthFlowAccountId(null, accountMap), null);
});

test("atomic creation records share one generated flow ID with their audit event", async () => {
  const id = newWealthFlowId(new Uint32Array([1, 2]));
  const record = wealthFlowCreateRecord("owner@example.com", { direction: "in", originalAmount: 10, currency: "ILS", ilsValue: 10, occurredAt: "2026-08-21T11:00:00.000Z" }, 7, id);
  const event = wealthFlowChangeEvent("wealth_flow.created", null, record);
  assert.equal(id < 0 && Number.isSafeInteger(id), true);
  assert.equal(event?.entityId, id);
  const mutations = await readFile(new URL("../app/api/portfolio/mutations.ts", import.meta.url), "utf8");
  assert.match(mutations, /statements\.push\(\.\.\.wealthFlowCreateStatements/);
  assert.match(mutations, /db\.batch\(wealthFlowCreateStatements/);
});

test("cash-change UIs require an explicit choice and contain no delta-sign auto-classification", async () => {
  const [quickUpdate, accountEditor] = await Promise.all([readFile(new URL("../app/components/PortfolioSheets.tsx", import.meta.url), "utf8"), readFile(new URL("../app/components/PortfolioManager.tsx", import.meta.url), "utf8")]);
  assert.match(quickUpdate, /Choose classification/);
  assert.match(accountEditor, /Choose classification/);
  assert.doesNotMatch(quickUpdate, /delta>0/);
  assert.doesNotMatch(accountEditor, /next>account\.cashBalance/);
});

test("Account Editor records the chosen local occurrence time for external cash flows", async () => {
  const accountEditor = await readFile(new URL("../app/components/PortfolioManager.tsx", import.meta.url), "utf8");
  assert.match(accountEditor, /occurredAt:localDateTimeToStoredIso\(occurredAt\)/);
  assert.match(accountEditor, /type="datetime-local" value=\{occurredAt\}/);
  assert.doesNotMatch(accountEditor, /occurredAt:new Date\(\)\.toISOString\(\)/);
});
