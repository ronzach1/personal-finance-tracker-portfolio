import { isValidHoldingAlias } from "./holding-alias.ts";
import { isValidAnnualManagementFeePercent } from "./account-management-fee.ts";
import { validateDepositBackupData } from "./fixed-deposit.ts";

export type Currency = "ILS" | "USD";

type Archivable = { archivedAt: string | null };
type Account = Archivable & { id: number; cashBalance: number; cashCurrency: Currency };
type Holding = Archivable & { accountId: number; quantity: number; currentPrice: number; currency: Currency };

export function holdingValueIls(holding: Pick<Holding, "quantity" | "currentPrice" | "currency">, usdIlsRate: number) {
  return holding.quantity * holding.currentPrice * (holding.currency === "USD" ? usdIlsRate : 1);
}

export type InvestmentHolding = Pick<Holding, "quantity" | "currentPrice" | "currency"> & {
  instrumentKind: string;
  averagePrice?: number | null;
  costBasisIntentionallyUnknown?: boolean;
  archivedAt?: string | null;
};

export function supportsCostComparison(holding: { instrumentKind: string }) {
  return holding.instrumentKind === "security" || holding.instrumentKind === "crypto";
}

function isCurrentInvestment(holding: InvestmentHolding) {
  return supportsCostComparison(holding) && !holding.archivedAt && Number.isFinite(holding.quantity) && holding.quantity > 0;
}

function investmentValueIls(holding: InvestmentHolding, usdIlsRate: number) {
  const rate = holding.currency === "USD" ? usdIlsRate : 1;
  // A zero price is an unresolved missing value in the existing product, not a total loss.
  if (!Number.isFinite(holding.currentPrice) || holding.currentPrice <= 0 || !Number.isFinite(rate) || rate <= 0) return null;
  const value = holdingValueIls(holding, usdIlsRate);
  return Number.isFinite(value) ? value : null;
}

/** Current holdings versus purchase cost, translated at current FX; not historical investment return. */
export function holdingUnrealizedPl(holding: InvestmentHolding, usdIlsRate: number) {
  if (!isCurrentInvestment(holding) || holding.costBasisIntentionallyUnknown || typeof holding.averagePrice !== "number" || !Number.isFinite(holding.averagePrice) || holding.averagePrice <= 0) return null;
  const currentValueIls = investmentValueIls(holding, usdIlsRate);
  const rate = holding.currency === "USD" ? usdIlsRate : 1;
  const nativeCost = holding.quantity * holding.averagePrice;
  const costBasisIls = nativeCost * rate;
  const unrealizedPlIls = (holding.quantity * holding.currentPrice - nativeCost) * rate;
  const percentage = unrealizedPlIls / costBasisIls * 100;
  if (currentValueIls === null || costBasisIls <= 0 || ![costBasisIls, unrealizedPlIls, percentage].every(Number.isFinite)) return null;
  return { unrealizedPlIls, costBasisIls, percentage, currentValueIls };
}

/** Pass holdings from active accounts (e.g. activePortfolio); archived and zero-quantity rows are excluded. */
export function currentInvestmentPl(holdings: InvestmentHolding[], usdIlsRate: number) {
  let eligibleHoldingCount = 0, coveredHoldingCount = 0;
  let eligibleValueIls: number | null = 0;
  let coveredValueIls = 0, coveredCostBasisIls = 0, totalPlIls = 0;
  for (const holding of holdings) {
    if (!isCurrentInvestment(holding)) continue;
    eligibleHoldingCount++;
    const value = investmentValueIls(holding, usdIlsRate);
    eligibleValueIls = eligibleValueIls === null || value === null ? null : eligibleValueIls + value;
    const pl = holdingUnrealizedPl(holding, usdIlsRate);
    if (!pl) continue;
    coveredHoldingCount++;
    coveredValueIls += pl.currentValueIls;
    coveredCostBasisIls += pl.costBasisIls;
    totalPlIls += pl.unrealizedPlIls;
  }
  return {
    unrealizedPlIls: coveredHoldingCount ? totalPlIls : null,
    percentage: coveredHoldingCount ? totalPlIls / coveredCostBasisIls * 100 : null,
    coveredCostBasisIls, coveredValueIls, eligibleValueIls, coveredHoldingCount, eligibleHoldingCount,
    coverage: !coveredHoldingCount ? "none" as const : coveredHoldingCount === eligibleHoldingCount ? "complete" as const : "partial" as const,
  };
}

export function cashValueIls(account: Pick<Account, "cashBalance" | "cashCurrency">, usdIlsRate: number) {
  return account.cashBalance * (account.cashCurrency === "USD" ? usdIlsRate : 1);
}

export function activePortfolio<TAccount extends Account, THolding extends Holding>(accounts: TAccount[], holdings: THolding[]) {
  const activeAccounts = accounts.filter((account) => !account.archivedAt);
  const activeAccountIds = new Set(activeAccounts.map((account) => account.id));
  return { accounts: activeAccounts, holdings: holdings.filter((holding) => !holding.archivedAt && activeAccountIds.has(holding.accountId)) };
}

export function trackedWealthIls(accounts: Account[], holdings: Holding[], usdIlsRate: number) {
  const active = activePortfolio(accounts, holdings);
  return active.accounts.reduce((sum, account) => sum + cashValueIls(account, usdIlsRate), 0) + active.holdings.reduce((sum, holding) => sum + holdingValueIls(holding, usdIlsRate), 0);
}

export function allocationPercentage(value: number, total: number) {
  return total > 0 ? value / total * 100 : 0;
}

const normalizeAssetType = (value: string) => {
  const normalized = value.trim().toLowerCase().replaceAll(/[\s-]+/g, "_");
  return normalized === "index_tracking_fund" ? "index_fund" : normalized;
};

export function isExposureEligible(holding: { instrumentKind: string; assetType: string }) {
  return holding.instrumentKind === "security" && ["stock", "etf", "index_fund"].includes(normalizeAssetType(holding.assetType));
}

export function jerusalemDay(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function isSameJerusalemDay(left: Date | string, right: Date | string) {
  return jerusalemDay(left) === jerusalemDay(right);
}

export function previousJerusalemDaySnapshot<T extends { capturedAt: string }>(snapshots: T[], now: Date | string = new Date()) {
  const today = jerusalemDay(now);
  return snapshots.reduce<T | null>((latest, snapshot) => {
    if (jerusalemDay(snapshot.capturedAt) >= today) return latest;
    if (!latest || new Date(snapshot.capturedAt).getTime() > new Date(latest.capturedAt).getTime()) return snapshot;
    return latest;
  }, null);
}

export type WealthFlowForAttribution = { direction: "in" | "out"; ilsValue: number; occurredAt: string };

export function wealthFlowAttribution({ currentTrackedWealth, previousSnapshot, trackingStartedAt, flows, now = new Date() }: {
  currentTrackedWealth: number; previousSnapshot: { totalIls: number; capturedAt: string } | null; trackingStartedAt: string | null; flows: WealthFlowForAttribution[]; now?: Date | string;
}) {
  if (!previousSnapshot || !trackingStartedAt || new Date(trackingStartedAt).getTime() > new Date(previousSnapshot.capturedAt).getTime()) return null;
  const start = new Date(previousSnapshot.capturedAt).getTime(); const end = new Date(now).getTime();
  const covered = flows.filter((flow) => { const occurred = new Date(flow.occurredAt).getTime(); return occurred > start && occurred <= end; });
  const moneyInIls = covered.filter((flow) => flow.direction === "in").reduce((sum, flow) => sum + flow.ilsValue, 0);
  const moneyOutIls = covered.filter((flow) => flow.direction === "out").reduce((sum, flow) => sum + flow.ilsValue, 0);
  const wealthChange = currentTrackedWealth - previousSnapshot.totalIls; const netExternalFlow = moneyInIls - moneyOutIls;
  return { wealthChange, moneyInIls, moneyOutIls, netExternalFlow, residualChange: wealthChange - netExternalFlow };
}

type AutomaticOnboardingRate = { rate: number; priceAsOf: string; provider: string };

export function resolveOnboardingRate({
  requestedMode,
  automaticRate,
  manualRate,
  now,
}: {
  requestedMode: "automatic" | "manual";
  automaticRate: AutomaticOnboardingRate | null;
  manualRate: unknown;
  now: string;
}) {
  if (requestedMode === "automatic" && automaticRate && Number.isFinite(automaticRate.rate) && automaticRate.rate > 0) {
    return { rate: automaticRate.rate, mode: "automatic" as const, asOf: automaticRate.priceAsOf, source: automaticRate.provider };
  }
  if (requestedMode === "manual" && typeof manualRate === "number" && Number.isFinite(manualRate) && manualRate > 0) {
    return { rate: manualRate, mode: "manual" as const, asOf: now, source: "manual" };
  }
  return null;
}

type BackupRecord = Record<string, unknown>;
const isBackupRecord = (value: unknown): value is BackupRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const backupRows = (value: unknown): BackupRecord[] => Array.isArray(value) ? value.filter(isBackupRecord) : [];
export function isValidInstrumentProviderConfiguration(row: BackupRecord) {
  const provider=String(row.provider??""), providerId=String(row.providerInstrumentId??"").trim();
  const quoteProvider=row.quoteProvider==null?null:String(row.quoteProvider), quoteId=row.quoteProviderInstrumentId==null?null:String(row.quoteProviderInstrumentId).trim();
  if(!provider||!providerId)return false;
  if(provider==="tase")return String(row.currency)==="ILS"&&["stock","etf"].includes(String(row.assetClass))&&((!quoteProvider&&!quoteId)||(quoteProvider==="yahoo"&&Boolean(quoteId)));
  if(!["yahoo","keren44"].includes(provider))return !quoteProvider&&!quoteId;
  return (!quoteProvider||quoteProvider===provider)&&(!quoteId||quoteId===providerId);
}
const validNumber = (value: unknown, minimum = 0) => typeof value === "number" && Number.isFinite(value) && value >= minimum;

export function isValidBackupV1(value: unknown) {
  if (!isBackupRecord(value) || value.schema !== "my-wealth-backup" || value.version !== 1 || !isBackupRecord(value.data)) return false;
  const data = value.data;
  const accountRows = backupRows(data.accounts); const holdingRows = backupRows(data.holdings); const instrumentRows = backupRows(data.instruments); const snapshotRows = backupRows(data.snapshots);
  if (!accountRows.length || accountRows.length > 200 || holdingRows.length > 5000 || instrumentRows.length > 5000 || snapshotRows.length > 5000) return false;
  const accountKinds = new Set(["bank", "broker", "crypto_wallet", "cash", "pension", "deposit", "other"]); const currencies = new Set(["ILS", "USD"]); const liquidityValues = new Set(["available", "near", "invested", "locked"]); const instrumentKinds = new Set(["security", "crypto", "deposit", "pension", "other"]); const priceModes = new Set(["automatic", "manual", "calculated"]);
  const oldAccountIds = new Set(accountRows.map((row) => Number(row.id))); const oldInstrumentIds = new Set(instrumentRows.map((row) => Number(row.id)));
  return accountRows.every((row) => isValidAnnualManagementFeePercent(row.annualManagementFeePercent) && Number.isInteger(Number(row.id)) && String(row.name ?? "").trim() && accountKinds.has(String(row.kind)) && currencies.has(String(row.cashCurrency)) && validNumber(Number(row.cashBalance)))
    && instrumentRows.every((row) => Number.isInteger(Number(row.id)) && String(row.symbol ?? "").trim() && String(row.name ?? "").trim() && isValidInstrumentProviderConfiguration(row) && currencies.has(String(row.currency)))
    && holdingRows.every((row) => isValidHoldingAlias(row.displayAlias) && Number.isInteger(Number(row.id)) && oldAccountIds.has(Number(row.accountId)) && (row.instrumentId == null || oldInstrumentIds.has(Number(row.instrumentId))) && String(row.name ?? "").trim() && instrumentKinds.has(String(row.instrumentKind)) && currencies.has(String(row.currency)) && liquidityValues.has(String(row.liquidity)) && priceModes.has(String(row.priceMode)) && validNumber(Number(row.quantity)) && validNumber(Number(row.averagePrice)) && validNumber(Number(row.currentPrice)))
    && snapshotRows.every((row) => validNumber(Number(row.totalIls)) && !Number.isNaN(new Date(String(row.capturedAt)).getTime()))
    && (!Object.hasOwn(data, "depositDetails") || Array.isArray(data.depositDetails))
    && (!Object.hasOwn(data, "depositExitPoints") || Array.isArray(data.depositExitPoints))
    && validateDepositBackupData({ hasDepositData: Object.hasOwn(data, "depositDetails") || Object.hasOwn(data, "depositExitPoints"), holdings: holdingRows, details: backupRows(data.depositDetails), exitPoints: backupRows(data.depositExitPoints) });
}
