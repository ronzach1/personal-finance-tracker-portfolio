// Display metadata only: never use this value for instrument identity or valuation.
export const holdingAliasMaxLength = 120;

export function isValidHoldingAlias(value: unknown): value is string | null | undefined {
  return value == null || (typeof value === "string" && value.trim().length <= holdingAliasMaxLength);
}

export function normalizeHoldingAlias(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
