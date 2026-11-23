export const interestMethods = ["simple", "compound"] as const;
export const compoundingFrequencies = ["annual", "monthly", "daily"] as const;

export type InterestMethod = (typeof interestMethods)[number];
export type CompoundingFrequency = (typeof compoundingFrequencies)[number];

export type FixedDepositTerms = {
  principal: number;
  currency: "ILS" | "USD";
  startDate: string;
  maturityDate: string;
  annualInterestRate: number;
  interestMethod: InterestMethod;
  compoundingFrequency: CompoundingFrequency | null;
  note?: string | null;
};

export type FixedDepositValidationIssue =
  | "principal_required"
  | "start_date_required"
  | "maturity_date_required"
  | "maturity_after_start"
  | "interest_rate_invalid"
  | "interest_method_invalid"
  | "compounding_frequency_required"
  | "exit_point_invalid";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function utcDateOnly(value: string) {
  if (!isoDatePattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function fixedDepositValidationIssues(value: FixedDepositTerms, exitPoints: string[] = []): FixedDepositValidationIssue[] {
  const issues: FixedDepositValidationIssue[] = [];
  const start = utcDateOnly(value.startDate);
  const maturity = utcDateOnly(value.maturityDate);
  if (!Number.isFinite(value.principal) || value.principal <= 0) issues.push("principal_required");
  if (!start) issues.push("start_date_required");
  if (!maturity) issues.push("maturity_date_required");
  if (start && maturity && maturity.getTime() <= start.getTime()) issues.push("maturity_after_start");
  if (!Number.isFinite(value.annualInterestRate) || value.annualInterestRate < 0) issues.push("interest_rate_invalid");
  if (!interestMethods.includes(value.interestMethod)) issues.push("interest_method_invalid");
  if (value.interestMethod === "compound" && !compoundingFrequencies.includes(value.compoundingFrequency as CompoundingFrequency)) issues.push("compounding_frequency_required");
  if (value.interestMethod === "simple" && value.compoundingFrequency !== null) issues.push("compounding_frequency_required");
  if (exitPoints.length && !validateExitPoints(exitPoints, value)) issues.push("exit_point_invalid");
  return issues;
}

export function validateFixedDepositTerms(value: FixedDepositTerms) {
  return ["ILS", "USD"].includes(value.currency) && fixedDepositValidationIssues(value).length === 0;
}

export function validateExitPoints(exitPoints: string[], terms: Pick<FixedDepositTerms, "startDate" | "maturityDate">) {
  const start = utcDateOnly(terms.startDate)?.getTime();
  const maturity = utcDateOnly(terms.maturityDate)?.getTime();
  return start !== undefined && maturity !== undefined && exitPoints.every((value) => {
    const time = utcDateOnly(value)?.getTime();
    return time !== undefined && time > start && time <= maturity;
  });
}

export function sortedExitPoints(exitPoints: string[]) {
  return [...new Set(exitPoints)].sort((left, right) => left.localeCompare(right));
}

export function nextExitPoint(exitPoints: string[], asOfDate: string) {
  return sortedExitPoints(exitPoints).find((date) => date > asOfDate) ?? null;
}

export function fixedDepositValue(terms: FixedDepositTerms, asOfDate: string) {
  if (!validateFixedDepositTerms(terms)) throw new Error("Invalid fixed-deposit terms");
  const start = utcDateOnly(terms.startDate)!;
  const maturity = utcDateOnly(terms.maturityDate)!;
  const asOf = utcDateOnly(asOfDate);
  if (!asOf) throw new Error("Invalid as-of date");
  if (asOf.getTime() <= start.getTime()) return terms.principal;
  const end = Math.min(asOf.getTime(), maturity.getTime());
  const elapsedDays = (end - start.getTime()) / 86_400_000;
  const yearFraction = elapsedDays / 365;
  const rate = terms.annualInterestRate / 100;
  const value = terms.interestMethod === "simple"
    ? terms.principal * (1 + rate * yearFraction)
    : terms.principal * Math.pow(1 + rate / ({ annual: 1, monthly: 12, daily: 365 }[terms.compoundingFrequency!]), ({ annual: 1, monthly: 12, daily: 365 }[terms.compoundingFrequency!]) * yearFraction);
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid calculated deposit value");
  return value;
}

export function depositTiming(terms: Pick<FixedDepositTerms, "maturityDate">, exitPoints: string[], asOfDate: string) {
  return { matured: asOfDate >= terms.maturityDate, nextExitPoint: nextExitPoint(exitPoints, asOfDate), exitPoints: sortedExitPoints(exitPoints) };
}

export function validateDepositBackupData({ hasDepositData, holdings, details, exitPoints }: { hasDepositData: boolean; holdings: Record<string, unknown>[]; details: Record<string, unknown>[]; exitPoints: Record<string, unknown>[] }) {
  const holdingById = new Map(holdings.map((row) => [Number(row.id), row]));
  const detailsByHolding = new Map(details.map((row) => [Number(row.holdingId), row]));
  if (!hasDepositData && (details.length || exitPoints.length)) return false;
  if (detailsByHolding.size !== details.length) return false;
  if (holdings.some((row) => row.priceMode === "calculated" && row.instrumentKind !== "deposit")) return false;
  if (details.some((row) => holdingById.get(Number(row.holdingId))?.instrumentKind !== "deposit")) return false;
  if (holdings.some((row) => row.instrumentKind === "deposit" && row.priceMode === "manual" && detailsByHolding.has(Number(row.id)))) return false;
  if (holdings.some((row) => row.instrumentKind === "deposit" && row.priceMode === "calculated" && !detailsByHolding.has(Number(row.id)))) return false;
  if (details.some((row) => {
    const holding = holdingById.get(Number(row.holdingId));
    return holding?.priceMode !== "calculated" || holding.currency !== row.currency || !validateFixedDepositTerms({ principal: Number(row.principal), currency: String(row.currency) as "ILS"|"USD", startDate: String(row.startDate), maturityDate: String(row.maturityDate), annualInterestRate: Number(row.annualInterestRate), interestMethod: String(row.interestMethod) as InterestMethod, compoundingFrequency: row.compoundingFrequency == null ? null : String(row.compoundingFrequency) as CompoundingFrequency, note: typeof row.note === "string" ? row.note : null });
  })) return false;
  return exitPoints.every((row) => {
    const holding = holdingById.get(Number(row.holdingId));
    const terms = detailsByHolding.get(Number(row.holdingId));
    return Boolean(holding?.instrumentKind === "deposit" && holding.priceMode === "calculated" && terms && validateExitPoints([String(row.exitDate)], { startDate: String(terms.startDate), maturityDate: String(terms.maturityDate) }));
  });
}

export function ownedDepositBackupData<TDetail extends { holdingId: number }, TExit extends { holdingId: number }>(holdingIds: Iterable<number>, details: TDetail[], exitPoints: TExit[]) {
  const ownedHoldingIds = new Set(holdingIds);
  return {
    depositDetails: details.filter((row) => ownedHoldingIds.has(row.holdingId)),
    depositExitPoints: exitPoints.filter((row) => ownedHoldingIds.has(row.holdingId)),
  };
}
