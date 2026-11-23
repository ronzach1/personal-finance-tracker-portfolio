import assert from "node:assert/strict";
import test from "node:test";
import { accountChangeEvent, assetChangeEvent, backupRestoredEvent, changedFields, wealthFlowChangeEvent } from "../lib/change-log.ts";

const account = { id: 7, ownerEmail: "private@example.com", name: "Bank", kind: "bank", cashBalance: 100, cashCurrency: "ILS", archivedAt: null, updatedAt: "ignored" };
const asset = { id: 11, ownerEmail: "private@example.com", accountId: 7, instrumentId: 3, symbol: "FUND", name: "Fund", instrumentKind: "security", assetType: "etf", geography: "global", sector: "broad", exposureMode: "manual", currency: "USD", quantity: 2, averagePrice: 20, currentPrice: 25, priceMode: "manual", attentionReason: null, costBasisIntentionallyUnknown: false, geographyIntentionallyUnclassified: false, sectorIntentionallyUnclassified: false, manualPriceReviewedAt: null, liquidity: "invested", archivedAt: null };

test("changed-field detection reports only meaningful differences", () => {
  assert.deepEqual(changedFields({ name: "Bank", cashBalance: 100 }, { name: "Bank", cashBalance: 150 }), ["cashBalance"]);
});

test("account events contain safe before/after state and identify cash changes", () => {
  const event = accountChangeEvent("account.updated", account, { ...account, cashBalance: 150, updatedAt: "new" });
  assert.deepEqual(event?.changedFields, ["cashBalance"]);
  assert.equal(event?.before?.cashBalance, 100);
  assert.equal(event?.after?.cashBalance, 150);
  assert.equal("ownerEmail" in (event?.before ?? {}), false);
  assert.equal("updatedAt" in (event?.after ?? {}), false);
});

test("asset events contain before/after state and identify price-mode changes", () => {
  const event = assetChangeEvent("asset.updated", asset, { ...asset, priceMode: "automatic", instrumentId: 9, currentPrice: 26 });
  assert.deepEqual(event?.changedFields, ["instrumentId", "currentPrice", "priceMode"]);
  assert.equal(event?.before?.priceMode, "manual");
  assert.equal(event?.after?.priceMode, "automatic");
});

test("asset events audit every persistent Data Check state change", () => {
  const changes = [
    ["costBasisIntentionallyUnknown", true],
    ["geographyIntentionallyUnclassified", true],
    ["sectorIntentionallyUnclassified", true],
    ["manualPriceReviewedAt", "2026-08-22T10:00:00.000Z"],
  ];
  for (const [field, value] of changes) {
    const event = assetChangeEvent("asset.updated", asset, { ...asset, [field]: value });
    assert.notEqual(event, null, `${field} must create an asset audit event`);
    assert.deepEqual(event?.changedFields, [field]);
    assert.equal(event?.after?.[field], value);
  }
});

test("no-op entity updates do not produce events", () => {
  assert.equal(accountChangeEvent("account.updated", account, { ...account, updatedAt: "new" }), null);
  assert.equal(assetChangeEvent("asset.updated", asset, { ...asset }), null);
});

test("alias creation, edits and clearing are audited without changing canonical identity", () => {
  for (const [before, after] of [[null, "Family fund"], ["Family fund", "Long-term"], ["Long-term", null]]) {
    const event = assetChangeEvent("asset.updated", { ...asset, displayAlias: before }, { ...asset, displayAlias: after });
    assert.deepEqual(event.changedFields, ["displayAlias"]);
    assert.equal(event.before.displayAlias, before);
    assert.equal(event.after.displayAlias, after);
    assert.equal(event.after.name, asset.name);
    assert.equal(event.after.symbol, asset.symbol);
  }
});

test("permanent deletion retains the pre-delete business state", () => {
  const event = assetChangeEvent("asset.deleted", { ...asset, archivedAt: "2026-08-19T00:00:00.000Z" }, null);
  assert.equal(event?.entityId, 11);
  assert.equal(event?.before?.name, "Fund");
  assert.equal(event?.after, null);
});

test("wealth-flow edits and deletion retain auditable business state", () => {
  const flow = { id: 4, ownerEmail: "private@example.com", direction: "in", originalAmount: 100, currency: "USD", ilsValue: 365, relatedAccountId: 7, occurredAt: "2026-08-20T10:00:00.000Z", note: null, updatedAt: "ignored" };
  const edit = wealthFlowChangeEvent("wealth_flow.updated", flow, { ...flow, ilsValue: 370 });
  assert.deepEqual(edit?.changedFields, ["ilsValue"]);
  assert.equal(edit?.after?.currency, "USD");
  assert.equal("ownerEmail" in (edit?.after ?? {}), false);
  const deletion = wealthFlowChangeEvent("wealth_flow.deleted", flow, null);
  assert.equal(deletion?.entityId, 4);
  assert.equal(deletion?.before?.originalAmount, 100);
});

test("backup restore metadata is compact and excludes backup contents", () => {
  const backup = { schema: "my-wealth-backup", version: 1, exportedAt: "2026-08-18T00:00:00.000Z", data: { accounts: [{ secret: "large" }], holdings: [{}, {}], snapshots: [{}], instruments: [{ full: "payload" }] } };
  const event = backupRestoredEvent(backup);
  assert.deepEqual(event.metadata, { schema: "my-wealth-backup", version: 1, exportedAt: "2026-08-18T00:00:00.000Z", accountCount: 1, holdingCount: 2, snapshotCount: 1, wealthFlowCount: 0 });
  assert.equal(JSON.stringify(event).includes("large"), false);
  assert.equal(JSON.stringify(event).includes("payload"), false);
});
