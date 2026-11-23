import { and, eq, inArray, isNull } from "drizzle-orm";
import { holdings, instruments, instrumentQuotes, settings } from "../../../db/schema";
import { marketData, marketPriceAfterRefresh } from "../../../lib/market-data";
import type { PortfolioRequest } from "../../../lib/portfolio-request";
import type { PortfolioContext } from "./context";
import { saveDailySnapshot } from "./snapshots";

export type RefreshRequest = Extract<PortfolioRequest, { action: "refresh_us_prices" | "refresh_market_prices" | "refresh_valuation" }>;

export async function refreshValuation(_payload: RefreshRequest, context: PortfolioContext) {
  const { db, owner } = context;
  const [[currentSettings], automaticHoldings] = await Promise.all([
    db.select().from(settings).where(eq(settings.ownerEmail, owner)).limit(1),
    db.select().from(holdings).where(and(eq(holdings.ownerEmail, owner), eq(holdings.priceMode, "automatic"), isNull(holdings.archivedAt))),
  ]);
  let rate = currentSettings?.usdIlsRate ?? 3.65;
  let rateUpdated = false;
  let rateFailed = false;
  const ids = Array.from(new Set(automaticHoldings.map((row) => row.instrumentId).filter((id): id is number => typeof id === "number")));
  const instrumentRows = ids.length ? await db.select().from(instruments).where(inArray(instruments.id, ids)) : [];
  const fxPromise = currentSettings?.usdIlsRateMode === "manual"
    ? Promise.resolve({ ok: true as const, fx: null })
    : marketData.getUsdIlsRate().then((fx) => ({ ok: true as const, fx })).catch(() => ({ ok: false as const, fx: null }));
  const pricesPromise = Promise.all(instrumentRows.map(async (instrument) => {
    const quoteProvider = instrument.quoteProvider ?? (["yahoo", "keren44"].includes(instrument.provider) ? instrument.provider : null);
    const quoteProviderInstrumentId = instrument.quoteProviderInstrumentId ?? (quoteProvider ? instrument.providerInstrumentId : null);
    if (!quoteProvider || !quoteProviderInstrumentId) return { instrument, quote: null };
    try { return { instrument, quote: await marketData.getDailyClose(quoteProviderInstrumentId, quoteProvider as "yahoo" | "keren44") }; }
    catch { return { instrument, quote: null }; }
  }));
  const [fxResult, priceResults] = await Promise.all([fxPromise, pricesPromise]);
  if (fxResult.ok && fxResult.fx) {
    rate = fxResult.fx.rate;
    rateUpdated = true;
    await db.update(settings).set({ usdIlsRate: rate, usdIlsRateAsOf: fxResult.fx.priceAsOf, usdIlsRateSource: fxResult.fx.provider }).where(eq(settings.ownerEmail, owner));
  } else if (!fxResult.ok) {
    rateFailed = true;
    await db.update(settings).set({ usdIlsRateSource: "automatic_failed" }).where(eq(settings.ownerEmail, owner));
  }
  let updated = 0;
  const failures: string[] = [];
  const previousPriceByInstrument=new Map(automaticHoldings.map((holding)=>[holding.instrumentId,holding.currentPrice]));
  for (const { instrument, quote } of priceResults) {
    const previousPrice=previousPriceByInstrument.get(instrument.id)??0;
    const nextPrice=marketPriceAfterRefresh(previousPrice,quote);
    if (quote) {
      const receivedAt = new Date().toISOString();
      await db.insert(instrumentQuotes).values({ instrumentId: instrument.id, price: quote.price, currency: quote.currency, priceAsOf: quote.priceAsOf, receivedAt, provider: quote.provider, status: "close" })
        .onConflictDoUpdate({ target: instrumentQuotes.instrumentId, set: { price: quote.price, currency: quote.currency, priceAsOf: quote.priceAsOf, receivedAt, provider: quote.provider, status: "close" } });
      await db.update(holdings).set({ currentPrice: nextPrice, updatedAt: receivedAt }).where(and(eq(holdings.ownerEmail, owner), eq(holdings.instrumentId, instrument.id), eq(holdings.priceMode, "automatic")));
      updated += 1;
    } else {
      failures.push(instrument.symbol);
      await db.update(instrumentQuotes).set({ status: "refresh_failed", receivedAt: new Date().toISOString() }).where(eq(instrumentQuotes.instrumentId, instrument.id));
    }
  }
  const checkedAt = new Date().toISOString();
  await db.update(settings).set({ valuationCheckedAt: checkedAt, updatedAt: checkedAt }).where(eq(settings.ownerEmail, owner));
  const snapshot = await saveDailySnapshot(context, rate);
  return Response.json({ ok: true, updated, failed: failures.length, failures, rateUpdated, rateFailed, rate, checkedAt, snapshot });
}
