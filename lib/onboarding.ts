type OnboardingHolding = {
  assetType: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  liquidity: "available" | "near" | "invested" | "locked";
  geography?: string;
  sector?: string;
};

export function onboardingHoldingValues(item: OnboardingHolding) {
  if (item.assetType === "deposit") throw new Error("Fixed deposits must be added after setup");
  const instrumentKind = item.assetType === "pension" ? "pension" as const
    : item.assetType === "crypto" ? "crypto" as const
      : ["cash", "real_estate", "other"].includes(item.assetType) ? "other" as const
        : "security" as const;
  const marketHolding = instrumentKind === "security" || instrumentKind === "crypto";
  const pension = instrumentKind === "pension";
  return {
    instrumentKind,
    symbol: pension ? "" : item.symbol.toUpperCase(),
    quantity: marketHolding ? item.quantity : 1,
    averagePrice: marketHolding ? item.averagePrice : pension ? 0 : item.currentPrice,
    liquidity: pension ? "locked" as const : item.liquidity,
    geography: pension ? "unspecified" : item.geography ?? "unspecified",
    sector: pension ? "unspecified" : item.sector ?? "unspecified",
  };
}
