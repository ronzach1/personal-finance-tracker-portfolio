import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pairedTransferDestinationBalance, validatePairedTransferBalances } from "../lib/internal-transfer.ts";

const state = (balance, currency = "ILS") => ({ balance, currency });

test("same-currency paired transfers preserve combined native cash", () => {
  assert.equal(pairedTransferDestinationBalance(1000, 750, 400), 650);
  assert.deepEqual(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(750), destinationBefore: state(400), destinationAfter: state(650) }), { ok: true });
  assert.equal(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(750), destinationBefore: state(400), destinationAfter: state(600) }).ok, false);
});

test("cross-currency transfers require both explicit native balance changes without inferred FX", () => {
  assert.deepEqual(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(900), destinationBefore: state(20, "USD"), destinationAfter: state(47, "USD") }), { ok: true });
  assert.equal(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(900), destinationBefore: state(20, "USD"), destinationAfter: state(20, "USD") }).ok, false);
});

test("paired transfers require source-down and destination-up in every currency combination", () => {
  const crossCurrency = { sourceBefore: state(1000), destinationBefore: state(20, "USD") };
  assert.equal(validatePairedTransferBalances({ ...crossCurrency, sourceAfter: state(900), destinationAfter: state(10, "USD") }).ok, false, "cross-currency both decrease");
  assert.equal(validatePairedTransferBalances({ ...crossCurrency, sourceAfter: state(1100), destinationAfter: state(30, "USD") }).ok, false, "cross-currency both increase");
  assert.equal(validatePairedTransferBalances({ ...crossCurrency, sourceAfter: state(1100), destinationAfter: state(10, "USD") }).ok, false, "cross-currency reversed direction");
  assert.equal(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(1100), destinationBefore: state(400), destinationAfter: state(300) }).ok, false, "same-currency reversed direction despite conservation");
});

test("paired transfer refuses currency changes, negative balances, and one-sided updates", () => {
  assert.equal(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(900, "USD"), destinationBefore: state(400), destinationAfter: state(500) }).ok, false);
  assert.equal(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(-1), destinationBefore: state(400), destinationAfter: state(1401) }).ok, false);
  assert.equal(validatePairedTransferBalances({ sourceBefore: state(1000), sourceAfter: state(1000), destinationBefore: state(400), destinationAfter: state(400) }).ok, false);
});

test("server persists both accounts and both audits in one batch without creating a wealth flow", async () => {
  const source = await readFile(new URL("../app/api/portfolio/mutations.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf('if (payload.action === "internal_transfer")'), source.indexOf('if (payload.action === "cash")'));
  assert.equal((block.match(/db\.update\(accounts\)/g) ?? []).length, 2);
  assert.match(block, /sourceEvent/);
  assert.match(block, /destinationEvent/);
  assert.match(block, /await db\.batch\(statements\)/);
  assert.doesNotMatch(block, /wealthFlow/);
});
