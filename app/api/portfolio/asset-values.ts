import type { PortfolioRequest } from "../../../lib/portfolio-request";

type SaveAssetRequest = Extract<PortfolioRequest, { action: "save_asset" }>;
export function quoteLocatorForInstrumentSave({automaticProvider,quoteProviderInstrumentId,existingQuoteProvider,existingQuoteProviderInstrumentId}:{automaticProvider:"yahoo"|"keren44"|null;quoteProviderInstrumentId:string;existingQuoteProvider:string|null|undefined;existingQuoteProviderInstrumentId:string|null|undefined}){return automaticProvider?{quoteProvider:automaticProvider,quoteProviderInstrumentId}:{quoteProvider:existingQuoteProvider??null,quoteProviderInstrumentId:existingQuoteProviderInstrumentId??null}}

type StoredDepositState = { instrumentKind: string; priceMode: string } | null | undefined;

export function isLegacyManualDepositState(holding: StoredDepositState, hasDepositDetails: boolean) {
  return Boolean(holding?.instrumentKind === "deposit" && holding.priceMode === "manual" && !hasDepositDetails);
}

export function deriveAssetValues(payload: SaveAssetRequest, options: { verifiedLegacyManualDeposit?: boolean } = {}) {
  const instrumentKind = payload.assetType === "crypto" ? "crypto" as const
    : payload.assetType === "deposit" ? "deposit" as const
    : payload.assetType === "pension" ? "pension" as const
    : ["cash", "real_estate", "other"].includes(payload.assetType) ? "other" as const
    : "security" as const;
  const quantity = ["security", "crypto"].includes(instrumentKind) ? payload.quantity : 1;
  const priceDivisor = payload.priceUnit === "agorot" && payload.currency === "ILS" ? 100 : 1;
  const currentPrice = payload.assetType === "deposit" ? payload.deposit?.principal ?? payload.currentPrice : payload.currentPrice / priceDivisor;
  const enteredAveragePrice = payload.averagePrice / priceDivisor;
  const totalCost = payload.totalCost ?? 0;
  const averagePrice = ["security", "crypto"].includes(instrumentKind)
    ? (payload.costMode === "total" && quantity > 0 ? totalCost / quantity : enteredAveragePrice)
    : currentPrice;
  const providerInstrumentId = ["keren44", "tase"].includes(payload.instrumentProvider ?? "")
    ? payload.providerInstrumentId?.trim() ?? ""
    : payload.providerInstrumentId?.trim().toUpperCase() ?? "";
  const suppliedQuoteLocator = payload.quoteProviderInstrumentId?.trim();
  const quoteProviderInstrumentId = (payload.instrumentProvider === "keren44" ? suppliedQuoteLocator : suppliedQuoteLocator?.toUpperCase())
    || (payload.instrumentProvider !== "tase" ? providerInstrumentId : "");
  const automaticProvider = quoteProviderInstrumentId && payload.instrumentProvider === "yahoo" && payload.currency === "USD" && ["stock", "etf"].includes(payload.assetType) ? "yahoo" as const
    : providerInstrumentId && payload.instrumentProvider === "keren44" && payload.currency === "ILS" && ["index_fund", "money_market"].includes(payload.assetType) ? "keren44" as const
    : providerInstrumentId && quoteProviderInstrumentId && payload.instrumentProvider === "tase" && payload.quoteProvider === "yahoo" && payload.currency === "ILS" && ["stock", "etf"].includes(payload.assetType) ? "yahoo" as const
    : null;
  const persistCanonicalInstrument = payload.instrumentProvider === "tase" && Boolean(providerInstrumentId);

  return {
    instrumentKind,
    symbol: payload.symbol.toUpperCase(),
    quantity,
    currentPrice,
    averagePrice,
    providerInstrumentId,
    quoteProviderInstrumentId,
    automaticProvider,
    persistCanonicalInstrument,
    priceMode: payload.assetType === "deposit" && !options.verifiedLegacyManualDeposit ? "calculated" as const : automaticProvider ? "automatic" as const : "manual" as const,
  };
}
