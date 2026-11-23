import { and, asc, desc, eq, sql } from "drizzle-orm";
import { accounts, depositDetails, depositExitPoints, holdings, instruments, instrumentQuotes, settings, snapshots, wealthFlows } from "../../../db/schema";
import { jerusalemDay, previousJerusalemDaySnapshot, trackedWealthIls, wealthFlowAttribution } from "../../../lib/finance";
import { quoteIsStale } from "../../../lib/market-data";
import type { PortfolioContext } from "./context";
import { applyCalculatedDepositValues } from "./deposits";

export async function readPortfolio({ db, owner }: PortfolioContext) {
  const [accountRows, storedHoldingRows, depositRows, exitPointRows, instrumentRows, quoteRows, settingRows, snapshotRows, wealthFlowRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ownerEmail, owner)).orderBy(asc(accounts.id)),
    db.select().from(holdings).where(eq(holdings.ownerEmail, owner)).orderBy(asc(holdings.id)),
    db.select().from(depositDetails),
    db.select().from(depositExitPoints).orderBy(asc(depositExitPoints.exitDate)),
    db.select().from(instruments),
    db.select().from(instrumentQuotes),
    db.select().from(settings).where(eq(settings.ownerEmail, owner)).limit(1),
    db.select().from(snapshots).where(eq(snapshots.ownerEmail, owner)).orderBy(desc(snapshots.capturedAt)).limit(500),
    db.select().from(wealthFlows).where(eq(wealthFlows.ownerEmail, owner)).orderBy(desc(wealthFlows.occurredAt)).limit(1000),
  ]);
  const now = new Date().toISOString();
  const ownedHoldingIds = new Set(storedHoldingRows.map((row) => row.id));
  const ownedDepositRows = depositRows.filter((row) => ownedHoldingIds.has(row.holdingId));
  const ownedExitPointRows = exitPointRows.filter((row) => ownedHoldingIds.has(row.holdingId));
  const holdingRows = applyCalculatedDepositValues(storedHoldingRows, ownedDepositRows, ownedExitPointRows, jerusalemDay(now));
  const activeAccountIds = new Set(accountRows.filter((row) => !row.archivedAt).map((row) => row.id));
  const activeHoldingRows = holdingRows.filter((row) => !row.archivedAt && activeAccountIds.has(row.accountId));
  const ownedInstrumentIds = new Set(holdingRows.map((row) => row.instrumentId).filter((id): id is number => typeof id === "number"));
  const activeInstrumentIds = new Set(activeHoldingRows.map((row) => row.instrumentId).filter((id): id is number => typeof id === "number"));
  const ownedInstruments = instrumentRows.filter((row) => ownedInstrumentIds.has(row.id));
  const ownedQuotes = quoteRows.filter((row) => ownedInstrumentIds.has(row.instrumentId));
  const quoteByInstrument = new Map(ownedQuotes.map((row) => [row.instrumentId, row]));
  const instrumentById = new Map(ownedInstruments.map((row) => [row.id, row]));
  const automatic = activeHoldingRows.filter((row) => row.priceMode === "automatic" && row.instrumentId);
  const staleCount = automatic.filter((row) => { const instrument=instrumentById.get(row.instrumentId!); return quoteIsStale(quoteByInstrument.get(row.instrumentId!)?.priceAsOf, (instrument?.quoteProvider??instrument?.provider) === "keren44" ? "keren44" : "yahoo"); }).length;
  const latestPriceAsOf = ownedQuotes.map((row) => row.priceAsOf).sort().at(-1) ?? null;
  const failedCount = ownedQuotes.filter((row) => activeInstrumentIds.has(row.instrumentId) && row.status === "refresh_failed").length;
  const rateStale = settingRows[0]?.usdIlsRateMode !== "manual" && (!settingRows[0]?.usdIlsRateAsOf || quoteIsStale(settingRows[0].usdIlsRateAsOf));
  const previousSnapshot = previousJerusalemDaySnapshot(snapshotRows, now);
  const trackingStartedAt = settingRows[0]?.wealthFlowTrackingStartedAt ?? null;
  let flowAttribution = null;
  if (previousSnapshot && trackingStartedAt && new Date(trackingStartedAt).getTime() <= new Date(previousSnapshot.capturedAt).getTime()) {
    const comparisonFlows = await db.select({ direction: wealthFlows.direction, ilsValue: wealthFlows.ilsValue, occurredAt: wealthFlows.occurredAt }).from(wealthFlows).where(and(eq(wealthFlows.ownerEmail, owner), sql`julianday(${wealthFlows.occurredAt}) > julianday(${previousSnapshot.capturedAt})`, sql`julianday(${wealthFlows.occurredAt}) <= julianday(${now})`));
    flowAttribution = wealthFlowAttribution({ currentTrackedWealth: trackedWealthIls(accountRows, holdingRows, settingRows[0]?.usdIlsRate ?? 3.65), previousSnapshot, trackingStartedAt, flows: comparisonFlows, now });
  }
  return {
    accounts: accountRows,
    holdings: holdingRows,
    depositDetails: ownedDepositRows,
    depositExitPoints: ownedExitPointRows,
    instruments: ownedInstruments,
    quotes: ownedQuotes,
    marketData: {
      needsRefresh: staleCount > 0 || rateStale || failedCount > 0 || settingRows[0]?.usdIlsRateSource === "automatic_failed",
      automaticCount: automatic.length,
      staleCount,
      failedCount,
      latestPriceAsOf,
      lastRefreshAt: settingRows[0]?.valuationCheckedAt ?? null,
      rateStale,
      rateFailed: settingRows[0]?.usdIlsRateSource === "automatic_failed",
    },
    settings: settingRows[0] ?? null,
    snapshots: snapshotRows,
    wealthFlows: wealthFlowRows,
    wealthFlowAttribution: flowAttribution,
  };
}
