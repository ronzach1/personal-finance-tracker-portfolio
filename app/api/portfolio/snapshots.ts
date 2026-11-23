import { and, desc, eq, isNull } from "drizzle-orm";
import { accounts, depositDetails, depositExitPoints, holdings, settings, snapshots } from "../../../db/schema";
import { isSameJerusalemDay, jerusalemDay, trackedWealthIls } from "../../../lib/finance";
import type { PortfolioContext } from "./context";
import { applyCalculatedDepositValues } from "./deposits";

export async function saveDailySnapshot({ db, owner }: PortfolioContext, rate: number, asOf = new Date()) {
  const [accountRows, storedHoldingRows, depositRows, exitPointRows] = await Promise.all([
    db.select().from(accounts).where(and(eq(accounts.ownerEmail, owner), isNull(accounts.archivedAt))),
    db.select().from(holdings).where(and(eq(holdings.ownerEmail, owner), isNull(holdings.archivedAt))),
    db.select().from(depositDetails),
    db.select().from(depositExitPoints),
  ]);
  const holdingRows = applyCalculatedDepositValues(storedHoldingRows, depositRows, exitPointRows, jerusalemDay(asOf));
  const totalIls = trackedWealthIls(accountRows, holdingRows, rate);
  const [existing] = await db.select().from(snapshots).where(eq(snapshots.ownerEmail, owner)).orderBy(desc(snapshots.capturedAt)).limit(1);
  if (existing && isSameJerusalemDay(existing.capturedAt, asOf)) {
    await db.update(snapshots).set({ totalIls, capturedAt: asOf.toISOString() }).where(eq(snapshots.id, existing.id));
    return { id: existing.id, totalIls, capturedAt: asOf.toISOString(), replaced: true };
  }
  const [snapshot] = await db.insert(snapshots).values({ ownerEmail: owner, totalIls, capturedAt: asOf.toISOString() }).returning();
  return { ...snapshot, replaced: false };
}

export async function saveCurrentSnapshot(context: PortfolioContext) {
  const [currentSettings] = await context.db.select().from(settings).where(eq(settings.ownerEmail, context.owner)).limit(1);
  return saveDailySnapshot(context, currentSettings?.usdIlsRate ?? 3.65);
}
