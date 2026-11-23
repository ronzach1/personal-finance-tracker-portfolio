import { isExposureEligible } from "./finance.ts";

export type DataCheckHolding = {
  id: number;
  instrumentKind: string;
  type: string;
  avg: number;
  price: number;
  status: "auto" | "manual" | "calculated";
  updatedAt: string;
  costBasisIntentionallyUnknown?: boolean;
  geographyIntentionallyUnclassified?: boolean;
  sectorIntentionallyUnclassified?: boolean;
  manualPriceReviewedAt?: string | null;
  geography: string;
  sector: string;
  archivedAt?: string | null;
  attentionReason?: string | null;
};

export type DataCheckIssueType = "missing-value" | "stale-manual-price" | "missing-classification" | "missing-cost-basis" | "matured-deposit" | "automatic-price-failed" | "automatic-price-stale" | "automatic-fx-failed";

export type DataCheckIssue = {
  type: DataCheckIssueType;
  priority: "urgent" | "review";
  action: "edit-holding" | "refresh-valuation";
  holdingIds?: number[];
  count: number;
};

const isUnspecified = (value: string) => value === "" || value === "unspecified";
export const holdingIssueTypes = ["missing-value", "stale-manual-price", "missing-classification", "missing-cost-basis", "matured-deposit"] as const;
export type HoldingDataCheckIssueType = typeof holdingIssueTypes[number];

export function missingClassificationDimensions(holding: DataCheckHolding) {
  return {
    geography: isUnspecified(holding.geography) && !holding.geographyIntentionallyUnclassified,
    sector: isUnspecified(holding.sector) && !holding.sectorIntentionallyUnclassified,
  };
}

export function dataCheckHoldingIds(holdings: DataCheckHolding[], type: Extract<DataCheckIssueType, "missing-value" | "stale-manual-price" | "missing-classification" | "missing-cost-basis" | "matured-deposit">, now = Date.now()) {
  return holdings
    .filter((holding) => !holding.archivedAt)
    .filter((holding) => {
      if (type === "missing-value") return holding.price <= 0;
      if (type === "matured-deposit") return holding.instrumentKind === "deposit" && holding.attentionReason === "deposit_matured";
      if (type === "stale-manual-price") return holding.status === "manual" && ["security", "crypto"].includes(holding.instrumentKind) && now - new Date(holding.manualPriceReviewedAt ?? holding.updatedAt).getTime() > 30 * 864e5;
      if (type === "missing-classification") { const missing = missingClassificationDimensions(holding); return isExposureEligible({ instrumentKind: holding.instrumentKind, assetType: holding.type }) && (missing.geography || missing.sector); }
      return holding.instrumentKind === "security" && holding.avg <= 0 && !holding.costBasisIntentionallyUnknown;
    })
    .map((holding) => holding.id)
    .sort((left, right) => left - right);
}

export function unresolvedHoldingIssueTypes(holding: DataCheckHolding, now = Date.now()): HoldingDataCheckIssueType[] {
  return holdingIssueTypes.filter((type) => dataCheckHoldingIds([holding], type, now).length > 0);
}

export function intentionalStateAfterHoldingSave(before: DataCheckHolding | null, next: Pick<DataCheckHolding,"avg"|"price"|"status"|"geography"|"sector">, { reviewManualPrice = false, now = new Date().toISOString() } = {}) {
  return {
    costBasisIntentionallyUnknown: next.avg > 0 ? false : before?.costBasisIntentionallyUnknown ?? false,
    geographyIntentionallyUnclassified: !isUnspecified(next.geography) ? false : before?.geographyIntentionallyUnclassified ?? false,
    sectorIntentionallyUnclassified: !isUnspecified(next.sector) ? false : before?.sectorIntentionallyUnclassified ?? false,
    manualPriceReviewedAt: next.status !== "manual" ? null : (!before || before.status !== "manual" || before.price !== next.price || reviewManualPrice ? now : before.manualPriceReviewedAt ?? null),
  };
}

export function restoredHoldingDataCheckState(row: Record<string, unknown>) {
  return {
    costBasisIntentionallyUnknown: row.costBasisIntentionallyUnknown === true,
    geographyIntentionallyUnclassified: row.geographyIntentionallyUnclassified === true,
    sectorIntentionallyUnclassified: row.sectorIntentionallyUnclassified === true,
    manualPriceReviewedAt: row.priceMode === "manual" && typeof row.manualPriceReviewedAt === "string" && !Number.isNaN(new Date(row.manualPriceReviewedAt).getTime()) ? row.manualPriceReviewedAt : null,
  };
}

export function firstAffectedHolding<T extends DataCheckHolding>(holdings: T[], type: Extract<DataCheckIssueType, "missing-value" | "stale-manual-price" | "missing-classification" | "missing-cost-basis" | "matured-deposit">, now = Date.now()) {
  const ids = new Set(dataCheckHoldingIds(holdings, type, now));
  return holdings.filter((holding) => ids.has(holding.id)).sort((left, right) => left.id - right.id)[0] ?? null;
}

export function nextUnreviewedAffectedHolding<T extends DataCheckHolding>(holdings: T[], type: Extract<DataCheckIssueType, "missing-value" | "stale-manual-price" | "missing-classification" | "missing-cost-basis" | "matured-deposit">, reviewedIds: Iterable<number>, now = Date.now()) {
  const reviewed = new Set(reviewedIds);
  return holdings
    .filter((holding) => !reviewed.has(holding.id))
    .filter((holding) => dataCheckHoldingIds([holding], type, now).length > 0)
    .sort((left, right) => left.id - right.id)[0] ?? null;
}

export function nextReviewProgress(current: number, total: number) {
  return Math.min(total, current + 1);
}

export function dataCheckIssues(holdings: DataCheckHolding[], valuation: { failedCount: number; staleCount: number; rateFailed: boolean }, now = Date.now()): DataCheckIssue[] {
  const holdingIssue = (type: Extract<DataCheckIssueType, "missing-value" | "stale-manual-price" | "missing-classification" | "missing-cost-basis" | "matured-deposit">, priority: "urgent" | "review"): DataCheckIssue | null => {
    const holdingIds = dataCheckHoldingIds(holdings, type, now);
    return holdingIds.length ? { type, priority, action: "edit-holding", holdingIds, count: holdingIds.length } : null;
  };
  return [
    holdingIssue("missing-value", "urgent"),
    holdingIssue("matured-deposit", "review"),
    valuation.failedCount ? { type: "automatic-price-failed", priority: "urgent", action: "refresh-valuation", count: valuation.failedCount } : null,
    valuation.rateFailed ? { type: "automatic-fx-failed", priority: "urgent", action: "refresh-valuation", count: 1 } : null,
    valuation.staleCount ? { type: "automatic-price-stale", priority: "review", action: "refresh-valuation", count: valuation.staleCount } : null,
    holdingIssue("stale-manual-price", "review"),
    holdingIssue("missing-classification", "review"),
    holdingIssue("missing-cost-basis", "review"),
  ].filter((issue): issue is DataCheckIssue => issue !== null);
}
