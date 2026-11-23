import assert from "node:assert/strict";
import test from "node:test";
import { backupPresentationSummary, parsedBackupPresentationSummary } from "../lib/backup-presentation.ts";
import { firstRunAccountName, neutralFirstRunAccount } from "../lib/first-run.ts";
import { isValidBackupV1 } from "../lib/finance.ts";
import { historyRangeComparison } from "../lib/history-range.ts";

const validBackup = {
  schema: "my-wealth-backup",
  version: 1,
  data: {
    accounts: [{ id: 1, name: "Everyday account", kind: "other", cashCurrency: "ILS", cashBalance: 1000 }],
    holdings: [],
    instruments: [],
    snapshots: [{ totalIls: 1000, capturedAt: "2026-08-24T09:00:00.000Z" }],
  },
};

test("first run creates one neutral, empty account without provider assumptions", () => {
  assert.deepEqual(neutralFirstRunAccount("en"), {
    clientId: "first-account",
    name: "My first account",
    kind: "other",
    cashBalance: 0,
    cashCurrency: "ILS",
  });
  assert.equal(firstRunAccountName("he"), "החשבון הראשון שלי");
});

test("restore review summarizes a recognizable backup without replacing authoritative validation", () => {
  assert.deepEqual(backupPresentationSummary(validBackup), {
    backup: validBackup,
    accountCount: 1,
    assetCount: 0,
    snapshotCount: 1,
  });
  assert.equal(backupPresentationSummary({ ...validBackup, version: 2 }), null);
  assert.equal(backupPresentationSummary({ ...validBackup, data: { ...validBackup.data, accounts: [] } }), null);

  const inconsistent = {
    ...validBackup,
    data: {
      ...validBackup.data,
      holdings: [{ id: 1, accountId: 99, name: "Detached asset", instrumentKind: "other", currency: "ILS", liquidity: "invested", priceMode: "manual", quantity: 1, averagePrice: 1, currentPrice: 1 }],
    },
  };
  assert.ok(backupPresentationSummary(inconsistent), "the review can show a file summary");
  assert.equal(isValidBackupV1(inconsistent), false, "the server-level validator still rejects inconsistent relationships");
});

test("restore review rejects malformed JSON without surfacing parser details", () => {
  assert.equal(parsedBackupPresentationSummary('{"schema":'), null);
  assert.deepEqual(parsedBackupPresentationSummary(JSON.stringify(validBackup)), backupPresentationSummary(validBackup));
});

test("legacy backups without wealth-flow fields remain recognized and valid", () => {
  const legacy = structuredClone(validBackup);
  assert.equal("wealthFlows" in legacy.data, false);
  assert.ok(backupPresentationSummary(legacy));
  assert.equal(isValidBackupV1(legacy), true);
});

test("range change requires two snapshot comparison points", () => {
  assert.deepEqual(historyRangeComparison([]), { available: false, delta: null, percent: null });
  assert.deepEqual(historyRangeComparison([{ totalIls: 1000 }]), { available: false, delta: null, percent: null });
  assert.deepEqual(historyRangeComparison([{ totalIls: 1000 }, { totalIls: 1250 }]), { available: true, delta: 250, percent: 25 });
});
