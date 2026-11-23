import assert from "node:assert/strict";
import test from "node:test";
import { dataCheckHoldingIds, dataCheckIssues, firstAffectedHolding, intentionalStateAfterHoldingSave, missingClassificationDimensions, nextReviewProgress, nextUnreviewedAffectedHolding, restoredHoldingDataCheckState, unresolvedHoldingIssueTypes } from "../lib/data-check.ts";
import { parsePortfolioRequest } from "../lib/portfolio-request.ts";
import { readFile } from "node:fs/promises";

const now = new Date("2026-08-19T12:00:00Z").getTime();
const holding = (id, patch = {}) => ({ id, instrumentKind: "security", type: "etf", avg: 10, price: 20, status: "manual", updatedAt: "2026-08-19T12:00:00Z", geography: "global", sector: "broad", ...patch });

test("ineligible holdings do not create classification issues", () => {
  const issues = dataCheckIssues([
    holding(1, { type: "money_market", geography: "unspecified", sector: "unspecified" }),
    holding(2, { type: "bond", geography: "unspecified", sector: "unspecified" }),
    holding(3, { instrumentKind: "crypto", type: "crypto", geography: "unspecified", sector: "unspecified" }),
  ], { failedCount: 0, staleCount: 0, rateFailed: false }, now);
  assert.equal(issues.some((issue) => issue.type === "missing-classification"), false);
});

test("archived holdings never appear in holding-based issues", () => {
  const archived = holding(9, { price: 0, avg: 0, geography: "unspecified", sector: "unspecified", updatedAt: "2026-01-01T00:00:00Z", archivedAt: "2026-08-01T00:00:00Z" });
  for (const type of ["missing-value", "stale-manual-price", "missing-classification", "missing-cost-basis"]) {
    assert.deepEqual(dataCheckHoldingIds([archived], type, now), []);
  }
});

test("manual price staleness begins only beyond the 30-day threshold", () => {
  const exact = new Date(now - 30 * 864e5).toISOString();
  const beyond = new Date(now - 30 * 864e5 - 1).toISOString();
  assert.deepEqual(dataCheckHoldingIds([holding(1, { updatedAt: exact })], "stale-manual-price", now), []);
  assert.deepEqual(dataCheckHoldingIds([holding(1, { updatedAt: beyond })], "stale-manual-price", now), [1]);
});

test("missing cost basis is distinct from valid current valuation", () => {
  const issues = dataCheckIssues([holding(1, { avg: 0, price: 25 })], { failedCount: 0, staleCount: 0, rateFailed: false }, now);
  assert.deepEqual(issues.map((issue) => issue.type), ["missing-cost-basis"]);
});

test("intentionally unknown cost basis is valid until a real basis is entered", () => {
  const unknown = holding(1, { avg: 0, costBasisIntentionallyUnknown: true });
  assert.deepEqual(dataCheckHoldingIds([unknown], "missing-cost-basis", now), []);
  const state = intentionalStateAfterHoldingSave(unknown, { avg: 12, price: unknown.price, status: unknown.status, geography: unknown.geography, sector: unknown.sector });
  assert.equal(state.costBasisIntentionallyUnknown, false);
});

test("geography and sector acknowledgements are independent", () => {
  const onlyGeographyAcknowledged = holding(1, { geography: "unspecified", sector: "unspecified", geographyIntentionallyUnclassified: true });
  assert.deepEqual(missingClassificationDimensions(onlyGeographyAcknowledged), { geography: false, sector: true });
  assert.deepEqual(dataCheckHoldingIds([onlyGeographyAcknowledged], "missing-classification", now), [1]);
  assert.deepEqual(dataCheckHoldingIds([{ ...onlyGeographyAcknowledged, sectorIntentionallyUnclassified: true }], "missing-classification", now), []);
});

test("missing value cannot be acknowledged", () => {
  const missing = holding(1, { price: 0, costBasisIntentionallyUnknown: true, geographyIntentionallyUnclassified: true, sectorIntentionallyUnclassified: true });
  assert.deepEqual(unresolvedHoldingIssueTypes(missing, now), ["missing-value"]);
  assert.equal(parsePortfolioRequest({ action: "acknowledge_data_check", id: 1, issue: "missing-value" }).ok, false);
});

test("manual price review is temporary and unrelated edits preserve its age", () => {
  const old = new Date(now - 31 * 864e5).toISOString();
  const reviewed = new Date(now).toISOString();
  const stale = holding(1, { updatedAt: reviewed, manualPriceReviewedAt: old });
  assert.deepEqual(dataCheckHoldingIds([stale], "stale-manual-price", now), [1], "updatedAt does not mask stale manual price");
  const kept = intentionalStateAfterHoldingSave(stale, { avg: stale.avg, price: stale.price, status: stale.status, geography: stale.geography, sector: stale.sector }, { now: reviewed });
  assert.equal(kept.manualPriceReviewedAt, old, "unrelated save keeps review age");
  const acknowledged = intentionalStateAfterHoldingSave(stale, { avg: stale.avg, price: stale.price, status: stale.status, geography: stale.geography, sector: stale.sector }, { reviewManualPrice: true, now: reviewed });
  assert.deepEqual(dataCheckHoldingIds([{ ...stale, ...acknowledged }], "stale-manual-price", now), []);
  assert.deepEqual(dataCheckHoldingIds([{ ...stale, ...acknowledged }], "stale-manual-price", now + 30 * 864e5 + 1), [1]);
});

test("pension balance confirmation changes only when its manual balance changes", () => {
  const confirmedAt = "2026-07-01T09:30:00.000Z";
  const savedAt = "2026-08-19T12:00:00.000Z";
  const pension = holding(4, { instrumentKind: "pension", type: "pension", avg: 0, price: 31000, manualPriceReviewedAt: confirmedAt });
  const metadataOnly = intentionalStateAfterHoldingSave(pension, { avg: 0, price: 31000, status: "manual", geography: "unspecified", sector: "unspecified" }, { now: savedAt });
  assert.equal(metadataOnly.manualPriceReviewedAt, confirmedAt, "metadata-only edits must not refresh pension balance freshness");
  const newBalance = intentionalStateAfterHoldingSave(pension, { avg: 0, price: 32000, status: "manual", geography: pension.geography, sector: pension.sector }, { now: savedAt });
  assert.equal(newBalance.manualPriceReviewedAt, savedAt, "a changed pension balance is newly confirmed");
});

test("pension onboarding records the entered balance as confirmed", async () => {
  const source = await readFile(new URL("../app/api/portfolio/onboarding.ts", import.meta.url), "utf8");
  assert.match(source, /manualPriceReviewedAt: values\.instrumentKind === "pension" \? onboardingTimestamp : null/);
});

test("Data Check identifies the exact holding and classification fields", () => {
  const target = holding(7, { geography: "unspecified", sector: "broad" });
  assert.equal(firstAffectedHolding([holding(2), target], "missing-classification", now)?.id, 7);
  assert.deepEqual(missingClassificationDimensions(target), { geography: true, sector: false });
});

test("legacy backup fields default conservatively and new fields round-trip", () => {
  assert.deepEqual(restoredHoldingDataCheckState({ priceMode: "manual" }), { costBasisIntentionallyUnknown: false, geographyIntentionallyUnclassified: false, sectorIntentionallyUnclassified: false, manualPriceReviewedAt: null });
  const timestamp = "2026-08-19T12:00:00.000Z";
  assert.deepEqual(restoredHoldingDataCheckState({ priceMode: "manual", costBasisIntentionallyUnknown: true, geographyIntentionallyUnclassified: true, sectorIntentionallyUnclassified: true, manualPriceReviewedAt: timestamp }), { costBasisIntentionallyUnknown: true, geographyIntentionallyUnclassified: true, sectorIntentionallyUnclassified: true, manualPriceReviewedAt: timestamp });
  assert.equal(restoredHoldingDataCheckState({ priceMode: "automatic", manualPriceReviewedAt: timestamp }).manualPriceReviewedAt, null);
});

test("holding review selects the first affected holding in deterministic order", () => {
  const holdings = [holding(8, { geography: "unspecified" }), holding(3, { sector: "unspecified" })];
  assert.equal(firstAffectedHolding(holdings, "missing-classification", now)?.id, 3);
  assert.deepEqual(dataCheckHoldingIds(holdings, "missing-classification", now), [3, 8]);
});

test("resolved holding is no longer selected for review", () => {
  const holdings = [holding(3, { geography: "global", sector: "broad" }), holding(8, { geography: "unspecified" })];
  assert.equal(firstAffectedHolding(holdings, "missing-classification", now)?.id, 8);
});

test("a review session offers each unresolved holding at most once in deterministic order", () => {
  const holdings = [holding(7, { geography: "unspecified" }), holding(2, { geography: "unspecified" }), holding(5, { geography: "unspecified" })];
  const first = nextUnreviewedAffectedHolding(holdings, "missing-classification", [], now);
  const second = nextUnreviewedAffectedHolding(holdings, "missing-classification", [first.id], now);
  const third = nextUnreviewedAffectedHolding(holdings, "missing-classification", [first.id, second.id], now);
  const finished = nextUnreviewedAffectedHolding(holdings, "missing-classification", [first.id, second.id, third.id], now);
  assert.deepEqual([first?.id, second?.id, third?.id, finished], [2, 5, 7, null]);
});

test("an unresolved saved holding can remain after a review session ends", () => {
  const holdings = [holding(2, { geography: "unspecified" })];
  assert.equal(nextUnreviewedAffectedHolding(holdings, "missing-classification", [2], now), null);
  assert.deepEqual(dataCheckHoldingIds(holdings, "missing-classification", now), [2]);
});

test("review progress cannot exceed its original total", () => {
  assert.equal(nextReviewProgress(3, 3), 3);
  assert.equal(nextReviewProgress(2, 3), 3);
});

test("automatic valuation issues use the refresh action", () => {
  const issues = dataCheckIssues([], { failedCount: 1, staleCount: 1, rateFailed: true }, now);
  assert.deepEqual(issues.map((issue) => [issue.type, issue.action]), [["automatic-price-failed", "refresh-valuation"], ["automatic-fx-failed", "refresh-valuation"], ["automatic-price-stale", "refresh-valuation"]]);
});

test("no issues produces a healthy result", () => {
  assert.deepEqual(dataCheckIssues([holding(1)], { failedCount: 0, staleCount: 0, rateFailed: false }, now), []);
});
