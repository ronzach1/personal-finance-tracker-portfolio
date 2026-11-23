// Informational percentage of assets per year; never part of valuation or flows.
export function isValidAnnualManagementFeePercent(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

// Only request input accepts a blank as an explicit clear. Backups stay strictly typed.
export function normalizeAnnualManagementFeeInput(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}
