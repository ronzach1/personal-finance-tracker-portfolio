import { isValidHoldingAlias, normalizeHoldingAlias } from "./holding-alias.ts";
import { isValidAnnualManagementFeePercent, normalizeAnnualManagementFeeInput } from "./account-management-fee.ts";
import { isAcceptableWealthFlowOccurredAt } from "./wealth-flow.ts";
import { validateExitPoints, validateFixedDepositTerms } from "./fixed-deposit.ts";

export const currencies = ["ILS", "USD"] as const;
export const liquidities = ["available", "near", "invested", "locked"] as const;
export const accountKinds = ["bank", "broker", "crypto_wallet", "cash", "pension", "deposit", "other"] as const;
export const languages = ["he", "en"] as const;
export const assetTypes = ["stock", "etf", "index_fund", "money_market", "bond", "bond_fund", "crypto", "deposit", "pension", "cash", "real_estate", "other"] as const;

export type Currency = (typeof currencies)[number];
export type Liquidity = (typeof liquidities)[number];
export type AccountKind = (typeof accountKinds)[number];
export type Language = (typeof languages)[number];
export type AssetType = (typeof assetTypes)[number];
export type PriceUnit = "currency" | "agorot";
export type CostMode = "average" | "total";
export type InstrumentProvider = "yahoo" | "keren44" | "tase";
export type QuoteProvider = "yahoo" | "keren44";

type OnboardingAccount = { clientId: string; name: string; kind: AccountKind; cashCurrency: Currency; cashBalance: number; annualManagementFeePercent?: number | null };
type OnboardingHolding = { accountClientId: string; assetType: AssetType; symbol: string; name: string; currency: Currency; liquidity: Liquidity; quantity: number; averagePrice: number; currentPrice: number; geography?: string; sector?: string };
export type DepositInput = { principal: number; startDate: string; maturityDate: string; annualInterestRate: number; interestMethod: "simple" | "compound"; compoundingFrequency?: "annual" | "monthly" | "daily"; exitPoints: string[]; note?: string };
type AssetInput = { displayAlias?: string | null; id?: number; accountId: number; assetType: AssetType; symbol: string; name: string; currency: Currency; quantity: number; averagePrice: number; currentPrice: number; liquidity: Liquidity; geography?: string; sector?: string; costMode: CostMode; totalCost?: number; priceUnit: PriceUnit; reviewManualPrice?: boolean; instrumentProvider?: InstrumentProvider; providerInstrumentId?: string; quoteProvider?: QuoteProvider; quoteProviderInstrumentId?: string; instrumentExchange?: string; instrumentMarket?: string; instrumentMic?: string; instrumentIsin?: string; deposit?: DepositInput };
type FlowInput = { direction: "in" | "out"; originalAmount: number; currency: Currency; ilsValue: number; relatedAccountId?: number; occurredAt: string; note?: string };
type CashFlowClassification = "external_in" | "external_out" | "correction";

export type PortfolioRequest =
  | { action: "export_backup" }
  | { action: "restore_backup"; backup: unknown }
  | { action: "onboard"; accounts: OnboardingAccount[]; holdings: OnboardingHolding[]; usdIlsRateMode: "automatic" | "manual"; usdIlsRate?: number; language: Language }
  | { action: "liquidity"; id: number; liquidity: Liquidity }
  | { action: "language"; language: Language }
  | { action: "cash"; id: number; balance: number; currency: Currency; flowClassification?: CashFlowClassification; flow?: Omit<FlowInput, "relatedAccountId"> }
  | { action: "internal_transfer"; sourceAccountId: number; destinationAccountId: number; sourceBalance: number; destinationBalance: number; sourceCurrency: Currency; destinationCurrency: Currency; sourceName?: string; sourceKind?: AccountKind; sourceAnnualManagementFeePercent?: number | null }
  | { action: "holding"; id: number; quantity: number; averagePrice: number; currentPrice: number }
  | { action: "acknowledge_data_check"; id: number; issue: "missing-cost-basis" | "missing-classification" | "stale-manual-price"; geography?: boolean; sector?: boolean }
  | ({ action: "save_account"; name: string; kind: AccountKind; cashCurrency: Currency; cashBalance: number; annualManagementFeePercent?: number | null; flowClassification?: CashFlowClassification; flow?: Omit<FlowInput, "relatedAccountId"> } & ({ id: number } | { id?: undefined }))
  | ({ action: "save_wealth_flow" } & FlowInput & ({ id: number } | { id?: undefined }))
  | { action: "delete_wealth_flow"; id: number }
  | ({ action: "save_asset" } & AssetInput)
  | { action: "refresh_us_prices" }
  | { action: "refresh_market_prices" }
  | { action: "refresh_valuation" }
  | { action: "archive_asset" | "restore_asset" | "delete_asset" | "archive_account" | "restore_account" | "delete_account"; id: number }
  | { action: "rate"; usdIlsRate: number }
  | { action: "automatic_rate" }
  | { action: "snapshot" };

export type ParsePortfolioRequestResult = { ok: true; value: PortfolioRequest } | { ok: false; error: string };
type Input = Record<string, unknown>;

const isObject = (value: unknown): value is Input => typeof value === "object" && value !== null && !Array.isArray(value);
const oneOf = <T extends readonly string[]>(value: unknown, options: T): value is T[number] => typeof value === "string" && (options as readonly string[]).includes(value);
const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const optionalString = (value: unknown) => value === undefined || value === false || typeof value === "string";
const optionalNullableString = (value: unknown) => value === undefined || value === false || value === null || typeof value === "string";
const finiteNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
const wealthFlowId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value !== 0;
const fail = (error: string): ParsePortfolioRequestResult => ({ ok: false, error });
const noPayloadActions = ["export_backup", "refresh_us_prices", "refresh_market_prices", "refresh_valuation", "automatic_rate", "snapshot"] as const;
const idActions = ["archive_asset", "restore_asset", "delete_asset", "archive_account", "restore_account", "delete_account"] as const;

function parseFlow(value: Input): FlowInput | null {
  if (!oneOf(value.direction, ["in", "out"] as const) || !finiteNonNegative(value.originalAmount) || value.originalAmount <= 0 || !oneOf(value.currency, currencies) || !finiteNonNegative(value.ilsValue) || value.ilsValue <= 0 || (value.currency === "ILS" && value.ilsValue !== value.originalAmount) || !isAcceptableWealthFlowOccurredAt(value.occurredAt) || !optionalString(value.note) || (value.relatedAccountId !== undefined && value.relatedAccountId !== null && !positiveInteger(value.relatedAccountId))) return null;
  return { direction: value.direction, originalAmount: value.originalAmount, currency: value.currency, ilsValue: value.ilsValue, ...(typeof value.relatedAccountId === "number" ? { relatedAccountId: value.relatedAccountId } : {}), occurredAt: new Date(value.occurredAt).toISOString(), ...(typeof value.note === "string" && value.note.trim() ? { note: value.note.trim() } : {}) };
}

function parseOnboardingAccount(value: unknown): OnboardingAccount | null {
  if (!isObject(value) || !nonEmptyString(value.clientId) || !nonEmptyString(value.name) || !oneOf(value.kind, accountKinds) || !oneOf(value.cashCurrency, currencies) || !finiteNonNegative(value.cashBalance)) return null;
  const annualManagementFeePercent = normalizeAnnualManagementFeeInput(value.annualManagementFeePercent);
  if (!isValidAnnualManagementFeePercent(annualManagementFeePercent)) return null;
  return { clientId: value.clientId.trim(), name: value.name.trim(), kind: value.kind, cashCurrency: value.cashCurrency, cashBalance: value.cashBalance, ...(annualManagementFeePercent === undefined ? {} : { annualManagementFeePercent }) };
}

function parseOnboardingHolding(value: unknown): OnboardingHolding | null {
  if (!isObject(value) || !nonEmptyString(value.accountClientId) || !oneOf(value.assetType, assetTypes) || !nonEmptyString(value.name) || !oneOf(value.currency, currencies) || !oneOf(value.liquidity, liquidities) || !finiteNonNegative(value.quantity) || !finiteNonNegative(value.averagePrice) || !finiteNonNegative(value.currentPrice) || !optionalString(value.symbol) || !optionalString(value.geography) || !optionalString(value.sector)) return null;
  if (value.assetType === "deposit") return null;
  const needsSymbol = !["cash", "real_estate", "other", "deposit", "pension"].includes(value.assetType);
  if (needsSymbol && !nonEmptyString(value.symbol)) return null;
  const pension = value.assetType === "pension";
  return { accountClientId: value.accountClientId.trim(), assetType: value.assetType, symbol: pension ? "" : typeof value.symbol === "string" ? value.symbol.trim() : "", name: value.name.trim(), currency: value.currency, liquidity: pension ? "locked" : value.liquidity, quantity: pension ? 1 : value.quantity, averagePrice: pension ? 0 : value.averagePrice, currentPrice: value.currentPrice, geography: pension ? "unspecified" : typeof value.geography === "string" ? value.geography : "unspecified", sector: pension ? "unspecified" : typeof value.sector === "string" ? value.sector : "unspecified" };
}

function parseAsset(value: Input): AssetInput | null {
  if (!isValidHoldingAlias(value.displayAlias)) return null;
  if (!positiveInteger(value.accountId) || !oneOf(value.assetType, assetTypes) || !nonEmptyString(value.name) || !oneOf(value.currency, currencies) || !finiteNonNegative(value.quantity) || !finiteNonNegative(value.averagePrice) || !finiteNonNegative(value.currentPrice) || !oneOf(value.liquidity, liquidities) || !oneOf(value.costMode, ["average", "total"] as const) || !oneOf(value.priceUnit, ["currency", "agorot"] as const) || !optionalString(value.symbol) || !optionalString(value.geography) || !optionalString(value.sector) || !optionalString(value.instrumentProvider) || !optionalString(value.providerInstrumentId) || !optionalString(value.quoteProvider) || !optionalString(value.quoteProviderInstrumentId) || !optionalString(value.instrumentExchange) || !optionalString(value.instrumentMarket) || !optionalString(value.instrumentMic) || !optionalNullableString(value.instrumentIsin)) return null;
  if (value.id !== undefined && !positiveInteger(value.id)) return null;
  if (value.costMode === "total" && !finiteNonNegative(value.totalCost)) return null;
  if (value.instrumentProvider !== undefined && value.instrumentProvider !== false && !oneOf(value.instrumentProvider, ["yahoo", "keren44", "tase"] as const)) return null;
  if (value.quoteProvider !== undefined && value.quoteProvider !== false && !oneOf(value.quoteProvider, ["yahoo", "keren44"] as const)) return null;
  const needsSymbol = !["cash", "real_estate", "other", "deposit", "pension"].includes(value.assetType);
  if (needsSymbol && !nonEmptyString(value.symbol)) return null;
  const string = (field: keyof Input) => typeof value[field] === "string" ? value[field].trim() : undefined;
  const totalCost = finiteNonNegative(value.totalCost) ? value.totalCost : undefined;
  const instrumentProvider = oneOf(value.instrumentProvider, ["yahoo", "keren44", "tase"] as const) ? value.instrumentProvider : undefined;
  const quoteProvider = oneOf(value.quoteProvider, ["yahoo", "keren44"] as const) ? value.quoteProvider : undefined;
  const providerInstrumentId = string("providerInstrumentId");
  const quoteProviderInstrumentId = string("quoteProviderInstrumentId");
  const providerCombinationValid = Boolean(instrumentProvider) !== Boolean(providerInstrumentId)
    ? false
    : !instrumentProvider
      ? !quoteProvider && !quoteProviderInstrumentId
    : instrumentProvider === "tase"
      ? value.currency === "ILS" && ["stock", "etf"].includes(String(value.assetType)) && ((!quoteProvider && !quoteProviderInstrumentId) || (quoteProvider === "yahoo" && Boolean(quoteProviderInstrumentId)))
      : (!quoteProvider || quoteProvider === instrumentProvider) && (!quoteProviderInstrumentId || quoteProviderInstrumentId === providerInstrumentId);
  if (!providerCombinationValid) return null;
  let deposit: DepositInput | undefined;
  if (value.assetType === "deposit") {
    if (value.deposit === undefined) {
      // Only the mutation layer can verify that this ID is an owned legacy manual deposit.
      if (value.id === undefined) return null;
    } else {
      if (!isObject(value.deposit) || !finiteNonNegative(value.deposit.principal) || value.deposit.principal <= 0 || !nonEmptyString(value.deposit.startDate) || !nonEmptyString(value.deposit.maturityDate) || !finiteNonNegative(value.deposit.annualInterestRate) || !oneOf(value.deposit.interestMethod, ["simple", "compound"] as const) || !Array.isArray(value.deposit.exitPoints) || !value.deposit.exitPoints.every((point) => typeof point === "string") || !optionalString(value.deposit.note)) return null;
      const frequency = oneOf(value.deposit.compoundingFrequency, ["annual", "monthly", "daily"] as const) ? value.deposit.compoundingFrequency : undefined;
      if (value.deposit.interestMethod === "compound" && !frequency) return null;
      deposit = { principal: value.deposit.principal, startDate: value.deposit.startDate.trim(), maturityDate: value.deposit.maturityDate.trim(), annualInterestRate: value.deposit.annualInterestRate, interestMethod: value.deposit.interestMethod, ...(frequency ? { compoundingFrequency: frequency } : {}), exitPoints: value.deposit.exitPoints, ...(typeof value.deposit.note === "string" && value.deposit.note.trim() ? { note: value.deposit.note.trim() } : {}) };
      const terms = { ...deposit, currency: value.currency, compoundingFrequency: deposit.compoundingFrequency ?? null };
      if (!validateFixedDepositTerms(terms) || !validateExitPoints(deposit.exitPoints, terms)) return null;
    }
  } else if (value.deposit !== undefined) return null;
  return { ...(value.id === undefined ? {} : { id: value.id }), ...(value.displayAlias === undefined ? {} : { displayAlias: normalizeHoldingAlias(value.displayAlias) }), accountId: value.accountId, assetType: value.assetType, symbol: string("symbol") ?? "", name: value.name.trim(), currency: value.currency, quantity: value.quantity, averagePrice: value.averagePrice, currentPrice: value.currentPrice, liquidity: value.liquidity, costMode: value.costMode, ...(totalCost === undefined ? {} : { totalCost }), priceUnit: value.priceUnit, ...(value.reviewManualPrice === true ? { reviewManualPrice: true } : {}), ...(string("geography") ? { geography: string("geography") } : {}), ...(string("sector") ? { sector: string("sector") } : {}), ...(instrumentProvider ? { instrumentProvider } : {}), ...(providerInstrumentId ? { providerInstrumentId } : {}), ...(quoteProvider ? { quoteProvider } : {}), ...(quoteProviderInstrumentId ? { quoteProviderInstrumentId } : {}), ...(string("instrumentExchange") ? { instrumentExchange: string("instrumentExchange") } : {}), ...(string("instrumentMarket") ? { instrumentMarket: string("instrumentMarket") } : {}), ...(string("instrumentMic") ? { instrumentMic: string("instrumentMic") } : {}), ...(string("instrumentIsin") ? { instrumentIsin: string("instrumentIsin") } : {}), ...(deposit ? { deposit } : {}) };
}

export function parsePortfolioRequest(value: unknown): ParsePortfolioRequestResult {
  if (!isObject(value)) return fail("Request body must be an object");
  if (typeof value.action !== "string") return fail("Missing action");
  if (oneOf(value.action, noPayloadActions)) return { ok: true, value: { action: value.action } };
  if (value.action === "restore_backup") return Object.hasOwn(value, "backup") ? { ok: true, value: { action: "restore_backup", backup: value.backup } } : fail("Missing backup");
  if (oneOf(value.action, idActions)) return positiveInteger(value.id) ? { ok: true, value: { action: value.action, id: value.id } } : fail("Invalid id");
  if (value.action === "delete_wealth_flow") return wealthFlowId(value.id) ? { ok: true, value: { action: "delete_wealth_flow", id: value.id } } : fail("Invalid id");
  if (value.action === "save_wealth_flow") { const flow = parseFlow(value); return flow && (value.id === undefined || wealthFlowId(value.id)) ? { ok: true, value: { action: "save_wealth_flow", ...(value.id === undefined ? {} : { id: value.id }), ...flow } } : fail("Invalid wealth flow"); }
  if (value.action === "liquidity") return positiveInteger(value.id) && oneOf(value.liquidity, liquidities) ? { ok: true, value: { action: "liquidity", id: value.id, liquidity: value.liquidity } } : fail("Invalid liquidity update");
  if (value.action === "language") return oneOf(value.language, languages) ? { ok: true, value: { action: "language", language: value.language } } : fail("Invalid language");
  if (value.action === "cash") {
    if (value.flowClassification !== undefined && !oneOf(value.flowClassification, ["external_in", "external_out", "correction"] as const)) return fail("Invalid cash classification");
    const classification = oneOf(value.flowClassification, ["external_in", "external_out", "correction"] as const) ? value.flowClassification : undefined;
    const flow = isObject(value.flow) ? parseFlow(value.flow) : null; const external = classification === "external_in" || classification === "external_out";
    return positiveInteger(value.id) && finiteNonNegative(value.balance) && oneOf(value.currency, currencies) && (!external || (flow && flow.direction === (classification === "external_in" ? "in" : "out"))) && (external || !flow) ? { ok: true, value: { action: "cash", id: value.id, balance: value.balance, currency: value.currency, ...(classification ? { flowClassification: classification } : {}), ...(flow ? { flow } : {}) } } : fail("Invalid cash update");
  }
  if (value.action === "internal_transfer") {
    const sourceAnnualManagementFeePercent = normalizeAnnualManagementFeeInput(value.sourceAnnualManagementFeePercent);
    if (!isValidAnnualManagementFeePercent(sourceAnnualManagementFeePercent)) return fail("Invalid annual management fee percentage");
    const sourceMetadataSupplied = value.sourceName !== undefined || value.sourceKind !== undefined;
    if (!positiveInteger(value.sourceAccountId) || !positiveInteger(value.destinationAccountId) || value.sourceAccountId === value.destinationAccountId || !finiteNonNegative(value.sourceBalance) || !finiteNonNegative(value.destinationBalance) || !oneOf(value.sourceCurrency, currencies) || !oneOf(value.destinationCurrency, currencies)) return fail("Invalid internal transfer");
    if (sourceMetadataSupplied && (!nonEmptyString(value.sourceName) || !oneOf(value.sourceKind, accountKinds))) return fail("Invalid internal transfer source account");
    return { ok: true, value: { action: "internal_transfer", sourceAccountId: value.sourceAccountId, destinationAccountId: value.destinationAccountId, sourceBalance: value.sourceBalance, destinationBalance: value.destinationBalance, sourceCurrency: value.sourceCurrency, destinationCurrency: value.destinationCurrency, ...(sourceMetadataSupplied ? { sourceName: value.sourceName.trim(), sourceKind: value.sourceKind } : {}), ...(sourceAnnualManagementFeePercent === undefined ? {} : { sourceAnnualManagementFeePercent }) } };
  }
  if (value.action === "holding") return positiveInteger(value.id) && finiteNonNegative(value.quantity) && finiteNonNegative(value.averagePrice) && finiteNonNegative(value.currentPrice) ? { ok: true, value: { action: "holding", id: value.id, quantity: value.quantity, averagePrice: value.averagePrice, currentPrice: value.currentPrice } } : fail("Invalid holding update");
  if (value.action === "acknowledge_data_check") {
    if (!positiveInteger(value.id) || !oneOf(value.issue, ["missing-cost-basis", "missing-classification", "stale-manual-price"] as const)) return fail("Invalid Data Check acknowledgement");
    if (value.issue === "missing-classification" && value.geography !== true && value.sector !== true) return fail("Missing classification dimension");
    return { ok: true, value: { action: "acknowledge_data_check", id: value.id, issue: value.issue, ...(value.geography === true ? { geography: true } : {}), ...(value.sector === true ? { sector: true } : {}) } };
  }
  if (value.action === "rate") return typeof value.usdIlsRate === "number" && Number.isFinite(value.usdIlsRate) && value.usdIlsRate >= 0.01 ? { ok: true, value: { action: "rate", usdIlsRate: value.usdIlsRate } } : fail("Invalid exchange rate");
  if (value.action === "save_account") {
    const annualManagementFeePercent = normalizeAnnualManagementFeeInput(value.annualManagementFeePercent);
    if (!isValidAnnualManagementFeePercent(annualManagementFeePercent)) return fail("Invalid annual management fee percentage");
    if (!nonEmptyString(value.name) || !oneOf(value.kind, accountKinds) || !oneOf(value.cashCurrency, currencies) || !finiteNonNegative(value.cashBalance) || (value.id !== undefined && !positiveInteger(value.id))) return fail("Invalid account");
    const classification = oneOf(value.flowClassification, ["external_in", "external_out", "correction"] as const) ? value.flowClassification : undefined;
    const flow = isObject(value.flow) ? parseFlow(value.flow) : null; const external = classification === "external_in" || classification === "external_out";
    if (value.flowClassification !== undefined && !classification) return fail("Invalid cash classification");
    if (value.id !== undefined && ((external && (!flow || flow.direction !== (classification === "external_in" ? "in" : "out"))) || (!external && flow))) return fail("Invalid cash classification");
    return { ok: true, value: { action: "save_account", ...(value.id === undefined ? {} : { id: value.id }), name: value.name.trim(), kind: value.kind, cashCurrency: value.cashCurrency, cashBalance: value.cashBalance, ...(annualManagementFeePercent === undefined ? {} : { annualManagementFeePercent }), ...(classification ? { flowClassification: classification } : {}), ...(flow ? { flow } : {}) } };
  }
  if (value.action === "save_asset") { const asset = parseAsset(value); return asset ? { ok: true, value: { action: "save_asset", ...asset } } : fail("Invalid asset"); }
  if (value.action === "onboard") {
    if (!Array.isArray(value.accounts) || !Array.isArray(value.holdings) || !oneOf(value.usdIlsRateMode, ["automatic", "manual"] as const) || !oneOf(value.language, languages) || (value.usdIlsRate !== undefined && !finiteNonNegative(value.usdIlsRate))) return fail("Invalid onboarding request");
    const parsedAccounts: OnboardingAccount[] = [];
    for (const account of value.accounts) { const parsed = parseOnboardingAccount(account); if (!parsed) return fail("Invalid onboarding data"); parsedAccounts.push(parsed); }
    const parsedHoldings: OnboardingHolding[] = [];
    for (const holding of value.holdings) { const parsed = parseOnboardingHolding(holding); if (!parsed) return fail("Invalid onboarding data"); parsedHoldings.push(parsed); }
    if (!parsedAccounts.length) return fail("Invalid onboarding data");
    const clientIds = new Set(parsedAccounts.map((account) => account.clientId));
    if (clientIds.size !== parsedAccounts.length || parsedHoldings.some((holding) => !clientIds.has(holding.accountClientId))) return fail("Invalid onboarding account reference");
    return { ok: true, value: { action: "onboard", accounts: parsedAccounts, holdings: parsedHoldings, usdIlsRateMode: value.usdIlsRateMode, ...(value.usdIlsRate === undefined ? {} : { usdIlsRate: value.usdIlsRate }), language: value.language } };
  }
  return fail("Unknown action");
}
