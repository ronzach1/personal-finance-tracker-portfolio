import assert from "node:assert/strict";
import test from "node:test";
import { cashClassificationReady } from "../lib/cash-change.ts";

test("unchanged cash is ready without classification", () => {
  assert.equal(cashClassificationReady(false, ""), true);
});

test("changed cash requires an explicit supported classification", () => {
  assert.equal(cashClassificationReady(true, ""), false);
  assert.equal(cashClassificationReady(true, "unexpected"), false);
  for (const classification of ["external_in", "external_out", "internal", "correction"]) {
    assert.equal(cashClassificationReady(true, classification), true);
  }
});
