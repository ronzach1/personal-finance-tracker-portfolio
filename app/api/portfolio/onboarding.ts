import { eq } from "drizzle-orm";
import { appendChangeLog } from "../../../db/change-log";
import { accounts, holdings, settings, wealthFlows } from "../../../db/schema";
import { accountChangeEvent, assetChangeEvent } from "../../../lib/change-log";
import { resolveOnboardingRate } from "../../../lib/finance";
import { marketData } from "../../../lib/market-data";
import { onboardingHoldingValues } from "../../../lib/onboarding";
import type { PortfolioRequest } from "../../../lib/portfolio-request";
import type { PortfolioContext } from "./context";

type OnboardRequest = Extract<PortfolioRequest, { action: "onboard" }>;

export async function onboardPortfolio(payload: OnboardRequest, { db, owner }: PortfolioContext) {
  const requestedRateMode = payload.usdIlsRateMode;
  const automaticRate = requestedRateMode === "automatic" ? await marketData.getUsdIlsRate().catch(() => null) : null;
  const rateDecision = resolveOnboardingRate({ requestedMode: requestedRateMode, automaticRate, manualRate: payload.usdIlsRate, now: new Date().toISOString() });
  if (!rateDecision) {
    if (requestedRateMode === "automatic") return Response.json({ error: "Automatic USD–ILS lookup is temporarily unavailable", code: "fx_unavailable" }, { status: 503 });
    return Response.json({ error: "Enter a valid USD–ILS rate", code: "invalid_manual_fx" }, { status: 400 });
  }
  const onboardingTimestamp = new Date().toISOString();

  await db.delete(holdings).where(eq(holdings.ownerEmail, owner));
  await db.delete(accounts).where(eq(accounts.ownerEmail, owner));
  await db.delete(wealthFlows).where(eq(wealthFlows.ownerEmail, owner));
  const accountMap = new Map<string, number>();
  for (const item of payload.accounts) {
    const [created] = await db.insert(accounts).values({ ownerEmail: owner, name: item.name, kind: item.kind, cashCurrency: item.cashCurrency, cashBalance: item.cashBalance, annualManagementFeePercent: item.annualManagementFeePercent ?? null }).returning();
    await appendChangeLog(db, owner, accountChangeEvent("account.created", null, created));
    accountMap.set(item.clientId, created.id);
  }
  for (const item of payload.holdings) {
    const accountId = accountMap.get(item.accountClientId)!;
    const assetType = item.assetType;
    const values = onboardingHoldingValues(item);
    const [created] = await db.insert(holdings).values({
      ownerEmail: owner,
      accountId,
      symbol: values.symbol,
      name: item.name,
      instrumentKind: values.instrumentKind,
      assetType,
      geography: values.geography,
      sector: values.sector,
      exposureMode: "manual",
      currency: item.currency,
      quantity: values.quantity,
      averagePrice: values.averagePrice,
      currentPrice: item.currentPrice,
      priceMode: "manual",
      manualPriceReviewedAt: values.instrumentKind === "pension" ? onboardingTimestamp : null,
      liquidity: values.liquidity,
      attentionReason: null,
    }).returning();
    await appendChangeLog(db, owner, assetChangeEvent("asset.created", null, created));
  }
  const trackingStartedAt = onboardingTimestamp;
  await db.insert(settings).values({ ownerEmail: owner, language: payload.language, usdIlsRate: rateDecision.rate, usdIlsRateMode: rateDecision.mode, usdIlsRateAsOf: rateDecision.asOf, usdIlsRateSource: rateDecision.source, onboardingComplete: true, wealthFlowTrackingStartedAt: trackingStartedAt })
    .onConflictDoUpdate({ target: settings.ownerEmail, set: { language: payload.language, usdIlsRate: rateDecision.rate, usdIlsRateMode: rateDecision.mode, usdIlsRateAsOf: rateDecision.asOf, usdIlsRateSource: rateDecision.source, onboardingComplete: true, wealthFlowTrackingStartedAt: trackingStartedAt, updatedAt: trackingStartedAt } });
  return Response.json({ ok: true });
}
