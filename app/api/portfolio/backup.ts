import { asc, eq, inArray } from "drizzle-orm";
import { changeLogInsertValues } from "../../../db/change-log";
import { accounts, depositDetails, depositExitPoints, holdings, instruments, instrumentQuotes, settings, snapshots, wealthFlows } from "../../../db/schema";
import { backupRestoredEvent } from "../../../lib/change-log";
import { normalizeHoldingAlias } from "../../../lib/holding-alias";
import { isValidBackupV1 } from "../../../lib/finance";
import { restoredHoldingDataCheckState } from "../../../lib/data-check";
import type { PortfolioRequest } from "../../../lib/portfolio-request";
import { remapWealthFlowAccountId, restoredWealthFlowTrackingState, validWealthFlowBackupRows } from "../../../lib/wealth-flow";
import type { PortfolioContext } from "./context";
import { ownedDepositBackupData } from "../../../lib/fixed-deposit";

type BackupRecord = Record<string, unknown>;
type BackupRequest = Extract<PortfolioRequest, { action: "export_backup" | "restore_backup" }>;

const isBackupRecord = (value: unknown): value is BackupRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const backupRows = (value: unknown): BackupRecord[] => Array.isArray(value) ? value.filter(isBackupRecord) : [];
const validNumber = (value: unknown, minimum = 0) => typeof value === "number" && Number.isFinite(value) && value >= minimum;
const validOptionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
const validOptionalTimestamp = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !Number.isNaN(new Date(value).getTime()));

async function exportBackup({ db, owner }: PortfolioContext) {
  const [accountRows, holdingRows, allDepositRows, allExitPointRows, settingRows, snapshotRows, wealthFlowRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.ownerEmail, owner)).orderBy(asc(accounts.id)),
    db.select().from(holdings).where(eq(holdings.ownerEmail, owner)).orderBy(asc(holdings.id)),
    db.select().from(depositDetails),
    db.select().from(depositExitPoints).orderBy(asc(depositExitPoints.exitDate)),
    db.select().from(settings).where(eq(settings.ownerEmail, owner)).limit(1),
    db.select().from(snapshots).where(eq(snapshots.ownerEmail, owner)).orderBy(asc(snapshots.id)),
    db.select().from(wealthFlows).where(eq(wealthFlows.ownerEmail, owner)).orderBy(asc(wealthFlows.id)),
  ]);
  const depositData = ownedDepositBackupData(holdingRows.map((row) => row.id), allDepositRows, allExitPointRows);
  const instrumentIds = Array.from(new Set(holdingRows.map((row) => row.instrumentId).filter((id): id is number => typeof id === "number")));
  const instrumentRows = instrumentIds.length ? await db.select().from(instruments).where(inArray(instruments.id, instrumentIds)) : [];
  const quoteRows = instrumentIds.length ? await db.select().from(instrumentQuotes).where(inArray(instrumentQuotes.instrumentId, instrumentIds)) : [];
  const stripOwner = <T extends { ownerEmail: string }>(row: T): Omit<T, "ownerEmail"> => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "ownerEmail")) as Omit<T, "ownerEmail">;
  return Response.json({
    schema: "my-wealth-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      accounts: accountRows.map(stripOwner),
      holdings: holdingRows.map(stripOwner),
      instruments: instrumentRows,
      quotes: quoteRows,
      settings: settingRows[0] ? stripOwner(settingRows[0]) : null,
      snapshots: snapshotRows.map(stripOwner),
      wealthFlows: wealthFlowRows.map(stripOwner),
      ...depositData,
    },
  });
}

async function restoreBackup(payload: Extract<BackupRequest, { action: "restore_backup" }>, owner: string) {
  const backup = isBackupRecord(payload.backup) ? payload.backup : null;
  const data = backup && isBackupRecord(backup.data) ? backup.data : null;
  const accountRows = backupRows(data?.accounts);
  const holdingRows = backupRows(data?.holdings);
  const instrumentRows = backupRows(data?.instruments);
  const quoteRows = backupRows(data?.quotes);
  const snapshotRows = backupRows(data?.snapshots);
  const wealthFlowRows = backupRows(data?.wealthFlows);
  const depositRows = backupRows(data?.depositDetails);
  const exitPointRows = backupRows(data?.depositExitPoints);
  if (!isValidBackupV1(backup)) return Response.json({ error: "Invalid or unsupported backup file" }, { status: 400 });
  const backupSettings = isBackupRecord(data?.settings) ? data.settings : {};
  const restoredTracking = restoredWealthFlowTrackingState({ hasWealthFlows: Boolean(data && Object.hasOwn(data, "wealthFlows")), wealthFlows: data?.wealthFlows, trackingStartedAt: backupSettings.wealthFlowTrackingStartedAt });
  if (!restoredTracking.valid) return Response.json({ error: "Flow-enabled backup is missing valid flow data or its UTC tracking baseline" }, { status: 400 });
  const oldAccountIds = new Set(accountRows.map((row) => Number(row.id)));
  const validHoldingMetadata = holdingRows.every((row) => validOptionalBoolean(row.costBasisIntentionallyUnknown) && validOptionalBoolean(row.geographyIntentionallyUnclassified) && validOptionalBoolean(row.sectorIntentionallyUnclassified) && validOptionalTimestamp(row.manualPriceReviewedAt));
  const validWealthFlows = !restoredTracking.restoreFlows || validWealthFlowBackupRows(data?.wealthFlows, oldAccountIds);
  if (!validHoldingMetadata || !validWealthFlows) return Response.json({ error: "Backup validation failed; no data was changed" }, { status: 400 });

  const { env } = await import("cloudflare:workers");
  const d1 = env.DB;
  if (!d1) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const [accountMaxResult, holdingMaxResult, instrumentMaxResult, existingInstrumentResult] = await Promise.all([
    d1.prepare("SELECT COALESCE(MAX(id),0) AS max_id FROM accounts").first<{ max_id: number }>(),
    d1.prepare("SELECT COALESCE(MAX(id),0) AS max_id FROM holdings").first<{ max_id: number }>(),
    d1.prepare("SELECT COALESCE(MAX(id),0) AS max_id FROM instruments").first<{ max_id: number }>(),
    d1.prepare("SELECT id, provider, provider_instrument_id FROM instruments").all<{ id: number; provider: string; provider_instrument_id: string }>(),
  ]);
  let nextAccount = Number(accountMaxResult?.max_id ?? 0);
  let nextHolding = Number(holdingMaxResult?.max_id ?? 0);
  let nextInstrument = Number(instrumentMaxResult?.max_id ?? 0);
  const accountMap = new Map<number, number>();
  for (const row of accountRows) accountMap.set(Number(row.id), ++nextAccount);
  const instrumentMap = new Map<number, number>();
  const holdingMap = new Map<number, number>();
  const existingByKey = new Map<string, number>(existingInstrumentResult.results.map((row: { id: number; provider: string; provider_instrument_id: string }) => [`${row.provider}|${row.provider_instrument_id}`, row.id]));
  const statements: ReturnType<typeof d1.prepare>[] = [
    d1.prepare("DELETE FROM wealth_flows WHERE owner_email = ?").bind(owner),
    d1.prepare("DELETE FROM deposit_exit_points WHERE holding_id IN (SELECT id FROM holdings WHERE owner_email = ?)").bind(owner),
    d1.prepare("DELETE FROM deposit_details WHERE holding_id IN (SELECT id FROM holdings WHERE owner_email = ?)").bind(owner),
    d1.prepare("DELETE FROM holdings WHERE owner_email = ?").bind(owner),
    d1.prepare("DELETE FROM accounts WHERE owner_email = ?").bind(owner),
    d1.prepare("DELETE FROM snapshots WHERE owner_email = ?").bind(owner),
    d1.prepare("DELETE FROM settings WHERE owner_email = ?").bind(owner),
  ];
  for (const row of instrumentRows) {
    const key = `${row.provider}|${row.providerInstrumentId}`;
    let id: number | undefined = existingByKey.get(key);
    if (!id) {
      id = ++nextInstrument;
      existingByKey.set(key, id);
      statements.push(d1.prepare("INSERT INTO instruments (id,market,symbol,name,asset_class,exchange,mic,isin,currency,provider,provider_instrument_id,quote_provider,quote_provider_instrument_id,geography_profile,sector_profile,exposure_source,exposure_as_of,active,metadata_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, String(row.market ?? "US"), String(row.symbol), String(row.name), String(row.assetClass ?? "other"), row.exchange ?? null, row.mic ?? null, row.isin ?? null, String(row.currency), String(row.provider), String(row.providerInstrumentId), row.quoteProvider ?? null, row.quoteProviderInstrumentId ?? null, null, null, null, null, row.active === false ? 0 : 1, String(row.metadataUpdatedAt ?? new Date().toISOString())));
    } else {
      statements.push(d1.prepare("UPDATE instruments SET market=?,symbol=?,name=?,asset_class=?,exchange=?,mic=?,isin=?,currency=?,quote_provider=?,quote_provider_instrument_id=?,active=?,metadata_updated_at=? WHERE id=?").bind(String(row.market ?? "US"), String(row.symbol), String(row.name), String(row.assetClass ?? "other"), row.exchange ?? null, row.mic ?? null, row.isin ?? null, String(row.currency), row.quoteProvider ?? null, row.quoteProviderInstrumentId ?? null, row.active === false ? 0 : 1, String(row.metadataUpdatedAt ?? new Date().toISOString()), id));
    }
    instrumentMap.set(Number(row.id), id);
  }
  for (const row of quoteRows) {
    const id = instrumentMap.get(Number(row.instrumentId));
    if (id) statements.push(d1.prepare("INSERT INTO instrument_quotes (instrument_id,price,currency,price_as_of,received_at,provider,status) VALUES (?,?,?,?,?,?,?) ON CONFLICT(instrument_id) DO UPDATE SET price=excluded.price,currency=excluded.currency,price_as_of=excluded.price_as_of,received_at=excluded.received_at,provider=excluded.provider,status=excluded.status").bind(id, Number(row.price), String(row.currency), String(row.priceAsOf), String(row.receivedAt ?? new Date().toISOString()), String(row.provider), String(row.status ?? "close")));
  }
  for (const row of accountRows) {
    const id = accountMap.get(Number(row.id))!;
    statements.push(d1.prepare("INSERT INTO accounts (id,owner_email,name,kind,cash_balance,cash_currency,annual_management_fee_percent,archived_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, owner, String(row.name).trim(), String(row.kind), Number(row.cashBalance), String(row.cashCurrency), row.annualManagementFeePercent ?? null, row.archivedAt ?? null, String(row.createdAt ?? new Date().toISOString()), String(row.updatedAt ?? new Date().toISOString())));
  }
  for (const row of holdingRows) {
    const generated = row.exposureMode === "automatic";
    const restoredState = restoredHoldingDataCheckState(row);
    const restoredHoldingId = ++nextHolding;
    holdingMap.set(Number(row.id), restoredHoldingId);
    statements.push(d1.prepare("INSERT INTO holdings (id,owner_email,account_id,instrument_id,symbol,name,display_alias,instrument_kind,asset_type,geography,sector,exposure_mode,currency,quantity,average_price,current_price,price_mode,attention_reason,cost_basis_intentionally_unknown,geography_intentionally_unclassified,sector_intentionally_unclassified,manual_price_reviewed_at,liquidity,archived_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(restoredHoldingId, owner, accountMap.get(Number(row.accountId)), row.instrumentId == null ? null : instrumentMap.get(Number(row.instrumentId)) ?? null, String(row.symbol ?? ""), String(row.name), normalizeHoldingAlias(row.displayAlias as string | null | undefined), String(row.instrumentKind), String(row.assetType ?? "other"), generated ? "unspecified" : String(row.geography ?? "unspecified"), generated ? "unspecified" : String(row.sector ?? "unspecified"), "manual", String(row.currency), Number(row.quantity), Number(row.averagePrice), Number(row.currentPrice), String(row.priceMode), row.attentionReason ?? null, restoredState.costBasisIntentionallyUnknown ? 1 : 0, restoredState.geographyIntentionallyUnclassified ? 1 : 0, restoredState.sectorIntentionallyUnclassified ? 1 : 0, restoredState.manualPriceReviewedAt, String(row.liquidity), row.archivedAt ?? null, String(row.updatedAt ?? new Date().toISOString())));
  }
  for (const row of depositRows) statements.push(d1.prepare("INSERT INTO deposit_details (holding_id,principal,currency,start_date,maturity_date,annual_interest_rate,interest_method,compounding_frequency,note) VALUES (?,?,?,?,?,?,?,?,?)").bind(holdingMap.get(Number(row.holdingId)), Number(row.principal), String(row.currency), String(row.startDate), String(row.maturityDate), Number(row.annualInterestRate), String(row.interestMethod), row.compoundingFrequency ?? null, row.note ?? null));
  for (const row of exitPointRows) statements.push(d1.prepare("INSERT INTO deposit_exit_points (holding_id,exit_date) VALUES (?,?)").bind(holdingMap.get(Number(row.holdingId)), String(row.exitDate)));
  const trackingStartedAt = restoredTracking.trackingStartedAt;
  statements.push(d1.prepare("INSERT INTO settings (owner_email,language,base_currency,usd_ils_rate,usd_ils_rate_mode,usd_ils_rate_as_of,usd_ils_rate_source,valuation_checked_at,onboarding_complete,wealth_flow_tracking_started_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(owner, backupSettings.language === "en" ? "en" : "he", "ILS", validNumber(Number(backupSettings.usdIlsRate), 0.01) ? Number(backupSettings.usdIlsRate) : 3.65, backupSettings.usdIlsRateMode === "manual" ? "manual" : "automatic", backupSettings.usdIlsRateAsOf ?? null, backupSettings.usdIlsRateSource ?? null, backupSettings.valuationCheckedAt ?? null, 1, trackingStartedAt, new Date().toISOString()));
  for (const row of snapshotRows) statements.push(d1.prepare("INSERT INTO snapshots (owner_email,total_ils,captured_at) VALUES (?,?,?)").bind(owner, Number(row.totalIls), String(row.capturedAt)));
  if (restoredTracking.restoreFlows) for (const row of wealthFlowRows) statements.push(d1.prepare("INSERT INTO wealth_flows (owner_email,direction,original_amount,currency,ils_value,related_account_id,occurred_at,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(owner, String(row.direction), Number(row.originalAmount), String(row.currency), Number(row.ilsValue), remapWealthFlowAccountId(row.relatedAccountId, accountMap), String(row.occurredAt), row.note ?? null, String(row.createdAt ?? new Date().toISOString()), String(row.updatedAt ?? new Date().toISOString())));
  const restoreLog = changeLogInsertValues(owner, backupRestoredEvent(backup!));
  statements.push(d1.prepare("INSERT INTO change_log (owner_email,event_type,entity_type,entity_id,changed_fields_json,before_json,after_json,metadata_json) VALUES (?,?,?,?,?,?,?,?)").bind(restoreLog.ownerEmail, restoreLog.eventType, restoreLog.entityType, restoreLog.entityId, restoreLog.changedFieldsJson, restoreLog.beforeJson, restoreLog.afterJson, restoreLog.metadataJson));
  try {
    await d1.batch(statements);
    return Response.json({ ok: true, accounts: accountRows.length, holdings: holdingRows.length });
  } catch {
    return Response.json({ error: "Restore failed; the existing portfolio was kept" }, { status: 500 });
  }
}

export function handleBackup(payload: BackupRequest, context: PortfolioContext) {
  return payload.action === "export_backup" ? exportBackup(context) : restoreBackup(payload, context.owner);
}
