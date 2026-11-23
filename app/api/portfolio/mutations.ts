import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { appendChangeLog, changeLogInsert, changeLogInsertValues } from "../../../db/change-log";
import { accounts, changeLog, depositDetails, depositExitPoints, holdings, instruments, instrumentQuotes, settings, wealthFlows } from "../../../db/schema";
import { accountChangeEvent, assetChangeEvent, wealthFlowChangeEvent } from "../../../lib/change-log";
import { intentionalStateAfterHoldingSave } from "../../../lib/data-check";
import { validatePairedTransferBalances } from "../../../lib/internal-transfer";
import { marketData, UnverifiedMarketCloseError, type MarketClose } from "../../../lib/market-data";
import type { PortfolioRequest } from "../../../lib/portfolio-request";
import { wealthFlowCreateRecord, type WealthFlowInput } from "../../../lib/wealth-flow";
import { fixedDepositValue, sortedExitPoints } from "../../../lib/fixed-deposit";
import { jerusalemDay } from "../../../lib/finance";
import { supportsGenericHoldingCorrection } from "../../../lib/holding-correction";
import type { PortfolioContext } from "./context";
import { deriveAssetValues, isLegacyManualDepositState, quoteLocatorForInstrumentSave } from "./asset-values";
import { saveCurrentSnapshot, saveDailySnapshot } from "./snapshots";

export type MutationRequest = Exclude<PortfolioRequest,
  { action: "export_backup" | "restore_backup" | "onboard" | "refresh_us_prices" | "refresh_market_prices" | "refresh_valuation" }
>;

const validNumber = (value: unknown, minimum = 0) => typeof value === "number" && Number.isFinite(value) && value >= minimum;

function wealthFlowCreateStatements(context: PortfolioContext, flow: WealthFlowInput, relatedAccountId?: number) {
  const { db, owner } = context;
  const record = wealthFlowCreateRecord(owner, flow, relatedAccountId);
  return [db.insert(wealthFlows).values(record), changeLogInsert(db, owner, wealthFlowChangeEvent("wealth_flow.created", null, record)!)] as const;
}

export async function handleMutation(payload: MutationRequest, context: PortfolioContext) {
  const { db, owner } = context;
  if (payload.action === "acknowledge_data_check") {
    const [before] = await db.select().from(holdings).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner), isNull(holdings.archivedAt))).limit(1);
    if (!before) return Response.json({ error: "Asset not found" }, { status: 404 });
    const now = new Date().toISOString();
    const values = payload.issue === "missing-cost-basis"
      ? { costBasisIntentionallyUnknown: before.averagePrice <= 0, updatedAt: before.updatedAt }
      : payload.issue === "stale-manual-price"
        ? { manualPriceReviewedAt: before.priceMode === "manual" ? now : before.manualPriceReviewedAt, updatedAt: before.updatedAt }
        : { geographyIntentionallyUnclassified: payload.geography === true && (!before.geography || before.geography === "unspecified") ? true : before.geographyIntentionallyUnclassified, sectorIntentionallyUnclassified: payload.sector === true && (!before.sector || before.sector === "unspecified") ? true : before.sectorIntentionallyUnclassified, updatedAt: before.updatedAt };
    const after = { ...before, ...values };
    const event = assetChangeEvent("asset.updated", before, after);
    if (!event) return Response.json({ ok: true });
    await db.batch([db.update(holdings).set(values).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner))), changeLogInsert(db, owner, event)]);
    return Response.json({ ok: true });
  }
  if (payload.action === "liquidity") {
    const { id, liquidity } = payload;
    const [before] = await db.select().from(holdings).where(and(eq(holdings.id, id), eq(holdings.ownerEmail, owner))).limit(1);
    const update = db.update(holdings).set({ liquidity, updatedAt: new Date().toISOString() }).where(and(eq(holdings.id, id), eq(holdings.ownerEmail, owner)));
    const event = before ? assetChangeEvent("asset.updated", before, { ...before, liquidity }) : null;
    if (event) await db.batch([update, changeLogInsert(db, owner, event)]); else await update;
    return Response.json({ ok: true });
  }

  if (payload.action === "language") {
    await db.update(settings).set({ language: payload.language, updatedAt: new Date().toISOString() }).where(eq(settings.ownerEmail, owner));
    return Response.json({ ok: true });
  }

  if (payload.action === "internal_transfer") {
    const [sourceRows, destinationRows] = await Promise.all([
      db.select().from(accounts).where(and(eq(accounts.id, payload.sourceAccountId), eq(accounts.ownerEmail, owner), isNull(accounts.archivedAt))).limit(1),
      db.select().from(accounts).where(and(eq(accounts.id, payload.destinationAccountId), eq(accounts.ownerEmail, owner), isNull(accounts.archivedAt))).limit(1),
    ]);
    const sourceBefore = sourceRows[0];
    const destinationBefore = destinationRows[0];
    if (!sourceBefore || !destinationBefore) return Response.json({ error: "Both active transfer accounts are required" }, { status: 404 });
    const validation = validatePairedTransferBalances({
      sourceBefore: { balance: sourceBefore.cashBalance, currency: sourceBefore.cashCurrency },
      sourceAfter: { balance: payload.sourceBalance, currency: payload.sourceCurrency },
      destinationBefore: { balance: destinationBefore.cashBalance, currency: destinationBefore.cashCurrency },
      destinationAfter: { balance: payload.destinationBalance, currency: payload.destinationCurrency },
    });
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
    const now = new Date().toISOString();
    const sourceFee = payload.sourceAnnualManagementFeePercent === undefined ? {} : { annualManagementFeePercent: payload.sourceAnnualManagementFeePercent };
    const sourceAfter = { ...sourceBefore, cashBalance: payload.sourceBalance, ...(payload.sourceName ? { name: payload.sourceName, kind: payload.sourceKind! } : {}), ...sourceFee, updatedAt: now };
    const destinationAfter = { ...destinationBefore, cashBalance: payload.destinationBalance, updatedAt: now };
    const sourceEvent = accountChangeEvent("account.updated", sourceBefore, sourceAfter);
    const destinationEvent = accountChangeEvent("account.updated", destinationBefore, destinationAfter);
    const statements = [
      db.update(accounts).set({ cashBalance: payload.sourceBalance, ...(payload.sourceName ? { name: payload.sourceName, kind: payload.sourceKind! } : {}), ...sourceFee, updatedAt: now }).where(and(eq(accounts.id, sourceBefore.id), eq(accounts.ownerEmail, owner))),
      db.update(accounts).set({ cashBalance: payload.destinationBalance, updatedAt: now }).where(and(eq(accounts.id, destinationBefore.id), eq(accounts.ownerEmail, owner))),
    ];
    if (sourceEvent) statements.push(changeLogInsert(db, owner, sourceEvent));
    if (destinationEvent) statements.push(changeLogInsert(db, owner, destinationEvent));
    await db.batch(statements);
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "cash") {
    const { id, balance, currency } = payload;
    const [before] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerEmail, owner))).limit(1);
    if (!before) return Response.json({ error: "Account not found" }, { status: 404 });
    const cashChanged = before.cashBalance !== balance || before.cashCurrency !== currency;
    if (cashChanged && !payload.flowClassification) return Response.json({ error: "Cash-change classification is required" }, { status: 400 });
    if (!cashChanged && payload.flow) return Response.json({ error: "Record an independent flow separately" }, { status: 400 });
    const update = db.update(accounts).set({ cashBalance: balance, cashCurrency: currency, updatedAt: new Date().toISOString() }).where(and(eq(accounts.id, id), eq(accounts.ownerEmail, owner)));
    const event = accountChangeEvent("account.updated", before, { ...before, cashBalance: balance, cashCurrency: currency });
    const statements = [update];
    if (event) statements.push(changeLogInsert(db, owner, event));
    if (payload.flow) statements.push(...wealthFlowCreateStatements(context, payload.flow, id));
    await db.batch(statements);
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "save_wealth_flow") {
    const values = { direction: payload.direction, originalAmount: payload.originalAmount, currency: payload.currency, ilsValue: payload.ilsValue, relatedAccountId: payload.relatedAccountId ?? null, occurredAt: payload.occurredAt, note: payload.note ?? null, updatedAt: new Date().toISOString() };
    if (payload.relatedAccountId) {
      const [account] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, payload.relatedAccountId), eq(accounts.ownerEmail, owner))).limit(1);
      if (!account) return Response.json({ error: "Related account not found" }, { status: 400 });
    }
    if (payload.id !== undefined) {
      const [before] = await db.select().from(wealthFlows).where(and(eq(wealthFlows.id, payload.id), eq(wealthFlows.ownerEmail, owner))).limit(1);
      if (!before) return Response.json({ error: "Wealth flow not found" }, { status: 404 });
      const event = wealthFlowChangeEvent("wealth_flow.updated", before, { ...before, ...values });
      const update = db.update(wealthFlows).set(values).where(and(eq(wealthFlows.id, payload.id), eq(wealthFlows.ownerEmail, owner)));
      if (event) await db.batch([update, changeLogInsert(db, owner, event)]); else await update;
      return Response.json({ ok: true });
    }
    await db.batch(wealthFlowCreateStatements(context, payload, payload.relatedAccountId));
    return Response.json({ ok: true }, { status: 201 });
  }

  if (payload.action === "delete_wealth_flow") {
    const [before] = await db.select().from(wealthFlows).where(and(eq(wealthFlows.id, payload.id), eq(wealthFlows.ownerEmail, owner))).limit(1);
    if (!before) return Response.json({ error: "Wealth flow not found" }, { status: 404 });
    await db.batch([db.delete(wealthFlows).where(and(eq(wealthFlows.id, payload.id), eq(wealthFlows.ownerEmail, owner))), changeLogInsert(db, owner, wealthFlowChangeEvent("wealth_flow.deleted", before, null)!)]);
    return Response.json({ ok: true });
  }

  if (payload.action === "holding") {
    const { id, quantity, averagePrice, currentPrice } = payload;
    const [before] = await db.select().from(holdings).where(and(eq(holdings.id, id), eq(holdings.ownerEmail, owner))).limit(1);
    if (!before) return Response.json({ error: "Asset not found" }, { status: 404 });
    if (!supportsGenericHoldingCorrection(before.instrumentKind)) return Response.json({ error: "Use the asset editor for pensions and fixed deposits" }, { status: 409 });
    const now = new Date().toISOString();
    const dataCheckStatus = before.priceMode === "automatic" ? "auto" : before.priceMode === "calculated" ? "calculated" : "manual";
    const state = intentionalStateAfterHoldingSave({ id:before.id,instrumentKind:before.instrumentKind,type:before.assetType,avg:before.averagePrice,price:before.currentPrice,status:dataCheckStatus,updatedAt:before.updatedAt,geography:before.geography,sector:before.sector,costBasisIntentionallyUnknown:before.costBasisIntentionallyUnknown,geographyIntentionallyUnclassified:before.geographyIntentionallyUnclassified,sectorIntentionallyUnclassified:before.sectorIntentionallyUnclassified,manualPriceReviewedAt:before.manualPriceReviewedAt }, { avg:averagePrice,price:currentPrice,status:dataCheckStatus,geography:before.geography,sector:before.sector }, { now });
    const values = { quantity, averagePrice, currentPrice, ...state, updatedAt: now };
    const update = db.update(holdings).set(values).where(and(eq(holdings.id, id), eq(holdings.ownerEmail, owner)));
    const event = assetChangeEvent("asset.updated", before, { ...before, ...values });
    if (event) await db.batch([update, changeLogInsert(db, owner, event)]); else await update;
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "save_account") {
    const { id, name, kind, cashCurrency, cashBalance } = payload;
    const fee = payload.annualManagementFeePercent === undefined ? {} : { annualManagementFeePercent: payload.annualManagementFeePercent };
    let feeOnly = false;
    if (id !== undefined) {
      const [before] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerEmail, owner))).limit(1);
      if (!before) return Response.json({ error: "Account not found" }, { status: 404 });
      const cashChanged = before.cashBalance !== cashBalance || before.cashCurrency !== cashCurrency;
      if (cashChanged && !payload.flowClassification) return Response.json({ error: "Cash-change classification is required" }, { status: 400 });
      if (!cashChanged && payload.flow) return Response.json({ error: "Record an independent flow separately" }, { status: 400 });
      const update = db.update(accounts).set({ name, kind, cashCurrency, cashBalance, ...fee, updatedAt: new Date().toISOString() }).where(and(eq(accounts.id, id), eq(accounts.ownerEmail, owner)));
      const event = accountChangeEvent("account.updated", before, { ...before, name, kind, cashCurrency, cashBalance, ...fee });
      feeOnly = event?.changedFields?.length === 1 && event.changedFields[0] === "annualManagementFeePercent";
      const statements = [update];
      if (event) statements.push(changeLogInsert(db, owner, event));
      if (payload.flow) statements.push(...wealthFlowCreateStatements(context, payload.flow, id));
      await db.batch(statements);
    } else {
      const [created] = await db.insert(accounts).values({ ownerEmail: owner, name, kind, cashCurrency, cashBalance, ...fee }).returning();
      await appendChangeLog(db, owner, accountChangeEvent("account.created", null, created));
    }
    // Metadata-only edits must not create or refresh a wealth checkpoint.
    if (!feeOnly) await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "save_asset") {
    const { id, accountId, assetType } = payload;
    const { name, currency, liquidity } = payload;
    const [before] = id !== undefined ? await db.select().from(holdings).where(and(eq(holdings.id, id), eq(holdings.ownerEmail, owner))).limit(1) : [];
    if (id !== undefined && !before) return Response.json({ error: "Asset not found" }, { status: 404 });
    const [beforeDeposit] = before ? await db.select().from(depositDetails).where(eq(depositDetails.holdingId, before.id)).limit(1) : [];
    if (beforeDeposit && !payload.deposit) return Response.json({ error: "Fixed-deposit terms are required for this asset" }, { status: 409 });
    const requestsLegacyManualDeposit = assetType === "deposit" && !payload.deposit;
    const verifiedLegacyManualDeposit = requestsLegacyManualDeposit && isLegacyManualDepositState(before, Boolean(beforeDeposit));
    if (requestsLegacyManualDeposit && !verifiedLegacyManualDeposit) return Response.json({ error: "Manual deposit balances can only update an existing owned legacy deposit" }, { status: 400 });
    const { instrumentKind, symbol, quantity, currentPrice, averagePrice, providerInstrumentId, quoteProviderInstrumentId, automaticProvider, persistCanonicalInstrument, priceMode } = deriveAssetValues(payload, { verifiedLegacyManualDeposit });
    const provider = payload.instrumentProvider;
    const [ownedAccount] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.ownerEmail, owner), isNull(accounts.archivedAt))).limit(1);
    if (!ownedAccount || !validNumber(averagePrice) || (priceMode === "manual" && !validNumber(currentPrice))) {
      return Response.json({ error: "Invalid asset" }, { status: 400 });
    }
    let instrumentId: number | SQL | null = null;
    let automaticPrice: number | null = null;
    const automaticStatements: BatchItem<"sqlite">[] = [];
    if (automaticProvider || persistCanonicalInstrument) {
      const canonicalProvider = provider!;
      const [existingInstrument] = await db.select().from(instruments).where(and(eq(instruments.provider, canonicalProvider), eq(instruments.providerInstrumentId, providerInstrumentId))).limit(1);
      const quoteLocator=quoteLocatorForInstrumentSave({automaticProvider,quoteProviderInstrumentId,existingQuoteProvider:existingInstrument?.quoteProvider,existingQuoteProviderInstrumentId:existingInstrument?.quoteProviderInstrumentId});
      let freshQuote: MarketClose | null = null;
      if (automaticProvider) {
        // Resolve the price before any writes: unavailable saves must not create
        // orphan instruments or overwrite shared instrument metadata.
        try {
          const quote = await marketData.getDailyClose(quoteProviderInstrumentId, automaticProvider);
          if (!Number.isFinite(quote.price) || quote.price <= 0 || quote.currency !== currency || quote.provider !== automaticProvider || !Number.isFinite(Date.parse(quote.priceAsOf))) throw new UnverifiedMarketCloseError("Invalid closing price");
          freshQuote = quote;
          automaticPrice = quote.price;
        } catch (error) {
          if (!(error instanceof UnverifiedMarketCloseError) && existingInstrument && existingInstrument.quoteProvider === automaticProvider && existingInstrument.quoteProviderInstrumentId === quoteProviderInstrumentId) {
            const [cached] = await db.select().from(instrumentQuotes).where(eq(instrumentQuotes.instrumentId, existingInstrument.id)).limit(1);
            if (cached && Number.isFinite(cached.price) && cached.price > 0 && cached.currency === currency && cached.provider === automaticProvider && ["close", "refresh_failed"].includes(cached.status) && Number.isFinite(Date.parse(cached.priceAsOf))) automaticPrice = cached.price;
          }
        }
        if (automaticPrice === null) return Response.json({ error: "The instrument was verified, but its closing price is temporarily unavailable. Try again shortly or use manual pricing." }, { status: 503 });
      }
      const instrumentValues = {
        market: String(payload.instrumentMarket ?? (["keren44", "tase"].includes(provider ?? "") ? "IL" : "US")),
        symbol,
        name,
        assetClass: assetType,
        exchange: String(payload.instrumentExchange ?? (provider === "keren44" ? "Israeli mutual fund" : provider === "tase" ? "Tel Aviv Stock Exchange" : "US")),
        mic: payload.instrumentMic || null,
        isin: payload.instrumentIsin || null,
        currency,
        provider: canonicalProvider,
        providerInstrumentId,
        quoteProvider: quoteLocator.quoteProvider,
        quoteProviderInstrumentId: quoteLocator.quoteProviderInstrumentId,
        active: true,
        metadataUpdatedAt: new Date().toISOString(),
      };
      if (existingInstrument) {
        instrumentId = existingInstrument.id;
        const update = db.update(instruments).set(instrumentValues).where(eq(instruments.id, instrumentId));
        if (automaticProvider) automaticStatements.push(update); else await update;
      } else if (automaticProvider) {
        automaticStatements.push(db.insert(instruments).values(instrumentValues));
        // D1 executes a batch as one transaction. Resolve the inserted identity
        // inside that transaction rather than persisting it ahead of the asset.
        instrumentId = sql`(select id from instruments where provider = ${canonicalProvider} and provider_instrument_id = ${providerInstrumentId} order by id desc limit 1)`;
      } else {
        const [createdInstrument] = await db.insert(instruments).values(instrumentValues).returning();
        instrumentId = createdInstrument.id;
      }
      if (freshQuote) {
        const quoteValues = { price: freshQuote.price, currency: freshQuote.currency, priceAsOf: freshQuote.priceAsOf, receivedAt: new Date().toISOString(), provider: freshQuote.provider, status: "close" };
        automaticStatements.push(db.insert(instrumentQuotes).values({ instrumentId, ...quoteValues })
          .onConflictDoUpdate({ target: instrumentQuotes.instrumentId, set: quoteValues }));
      }
    }
    const now = new Date().toISOString();
    const geography = String(payload.geography ?? "unspecified");
    const sector = String(payload.sector ?? "unspecified");
    const previousDataCheckStatus = before?.priceMode === "automatic" ? "auto" : before?.priceMode === "calculated" ? "calculated" : "manual";
    const nextDataCheckStatus = priceMode === "automatic" ? "auto" : priceMode === "calculated" ? "calculated" : "manual";
    const state = intentionalStateAfterHoldingSave(before ? { id:before.id,instrumentKind:before.instrumentKind,type:before.assetType,avg:before.averagePrice,price:before.currentPrice,status:previousDataCheckStatus,updatedAt:before.updatedAt,geography:before.geography,sector:before.sector,costBasisIntentionallyUnknown:before.costBasisIntentionallyUnknown,geographyIntentionallyUnclassified:before.geographyIntentionallyUnclassified,sectorIntentionallyUnclassified:before.sectorIntentionallyUnclassified,manualPriceReviewedAt:before.manualPriceReviewedAt } : null, { avg:averagePrice,price:automaticPrice??currentPrice,status:nextDataCheckStatus,geography,sector }, { reviewManualPrice:payload.reviewManualPrice,now });
    const depositTerms = payload.deposit ? { ...payload.deposit, currency, compoundingFrequency: payload.deposit.compoundingFrequency ?? null } : null;
    const valuationDate = jerusalemDay(now);
    const effectiveCurrentPrice = depositTerms ? fixedDepositValue(depositTerms, valuationDate) : automaticPrice ?? currentPrice;
    const values = {
      accountId,
      symbol,
      name,
      displayAlias: payload.displayAlias === undefined ? before?.displayAlias ?? null : payload.displayAlias,
      instrumentKind,
      assetType,
      instrumentId,
      geography,
      sector,
      exposureMode: "manual" as const,
      currency,
      quantity,
      averagePrice,
      currentPrice: effectiveCurrentPrice,
      priceMode,
      liquidity,
      attentionReason: depositTerms && valuationDate >= depositTerms.maturityDate ? "deposit_matured" : null,
      ...state,
      updatedAt: now,
    };
    if (automaticProvider) {
      const write = id !== undefined
        ? db.update(holdings).set(values).where(and(eq(holdings.id, id), eq(holdings.ownerEmail, owner)))
        : db.insert(holdings).values({ ownerEmail: owner, ...values });
      // A pending new instrument is a real identity change even before its ID
      // resolves in the batch; replacing it with null here would hide that change.
      const event = assetChangeEvent(id !== undefined ? "asset.updated" : "asset.created", before ?? null, { ...before, ...values, id: id ?? null, depositDetails: null });
      const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [automaticStatements[0], ...automaticStatements.slice(1), write];
      if (event) {
        // Never serialize the SQL reference. The audit insert below supplies the
        // resolved numeric ID without changing the already-computed field list.
        if (event.after) event.after.instrumentId = typeof instrumentId === "number" ? instrumentId : null;
        const logValues = changeLogInsertValues(owner, event);
        const savedId = id !== undefined ? sql`${id}` : sql`last_insert_rowid()`;
        statements.push(db.insert(changeLog).values({ ...logValues, entityId: savedId, afterJson: sql`json_set(${logValues.afterJson}, '$.id', ${savedId}, '$.instrumentId', ${instrumentId})` }));
      }
      await db.batch(statements);
    } else if (id !== undefined) {
      const update = db.update(holdings).set(values).where(and(eq(holdings.id, id), eq(holdings.ownerEmail, owner)));
      const event = before ? assetChangeEvent("asset.updated", { ...before, depositDetails: beforeDeposit ?? null }, { ...before, ...values, depositDetails: depositTerms }) : null;
      const statements = [
        update,
        ...(depositTerms || beforeDeposit ? [db.delete(depositExitPoints).where(eq(depositExitPoints.holdingId, id)), db.delete(depositDetails).where(eq(depositDetails.holdingId, id))] : []),
      ];
      if (depositTerms) {
        const storedTerms = { principal: depositTerms.principal, currency: depositTerms.currency, startDate: depositTerms.startDate, maturityDate: depositTerms.maturityDate, annualInterestRate: depositTerms.annualInterestRate, interestMethod: depositTerms.interestMethod, compoundingFrequency: depositTerms.compoundingFrequency, note: depositTerms.note };
        statements.push(db.insert(depositDetails).values({ holdingId: id, ...storedTerms, note: storedTerms.note ?? null }));
        for (const exitDate of sortedExitPoints(depositTerms.exitPoints)) statements.push(db.insert(depositExitPoints).values({ holdingId: id, exitDate }));
      }
      if (event) statements.push(changeLogInsert(db, owner, event));
      await db.batch(statements);
    } else {
      const [created] = await db.insert(holdings).values({ ownerEmail: owner, ...values }).returning();
      if (depositTerms) {
        const storedTerms = { principal: depositTerms.principal, currency: depositTerms.currency, startDate: depositTerms.startDate, maturityDate: depositTerms.maturityDate, annualInterestRate: depositTerms.annualInterestRate, interestMethod: depositTerms.interestMethod, compoundingFrequency: depositTerms.compoundingFrequency, note: depositTerms.note };
        const statements = [db.insert(depositDetails).values({ holdingId: created.id, ...storedTerms, note: storedTerms.note ?? null })];
        for (const exitDate of sortedExitPoints(depositTerms.exitPoints)) statements.push(db.insert(depositExitPoints).values({ holdingId: created.id, exitDate }));
        try { await db.batch(statements); }
        catch {
          await db.delete(holdings).where(and(eq(holdings.id, created.id), eq(holdings.ownerEmail, owner)));
          return Response.json({ error: "Fixed-deposit terms could not be saved; no asset was created" }, { status: 500 });
        }
      }
      await appendChangeLog(db, owner, assetChangeEvent("asset.created", null, { ...created, depositDetails: depositTerms }));
    }
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "archive_asset") {
    const [before] = await db.select().from(holdings).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner))).limit(1);
    const now = new Date().toISOString();
    const update = db.update(holdings).set({ archivedAt: now, updatedAt: now }).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner)));
    const event = before ? assetChangeEvent("asset.archived", before, { ...before, archivedAt: now }) : null;
    if (event) await db.batch([update, changeLogInsert(db, owner, event)]); else await update;
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "restore_asset") {
    const [row] = await db.select().from(holdings).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner))).limit(1);
    if (!row) return Response.json({ error: "Asset not found" }, { status: 404 });
    const [account] = await db.select({ archivedAt: accounts.archivedAt }).from(accounts).where(and(eq(accounts.id, row.accountId), eq(accounts.ownerEmail, owner))).limit(1);
    if (account?.archivedAt) return Response.json({ error: "Restore the account first" }, { status: 409 });
    const update = db.update(holdings).set({ archivedAt: null, updatedAt: new Date().toISOString() }).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner)));
    const event = assetChangeEvent("asset.restored", row, { ...row, archivedAt: null });
    if (event) await db.batch([update, changeLogInsert(db, owner, event)]); else await update;
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "delete_asset") {
    const [row] = await db.select().from(holdings).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner))).limit(1);
    if (!row?.archivedAt) return Response.json({ error: "Archive the asset before deleting it permanently" }, { status: 409 });
    const deletionEvent = assetChangeEvent("asset.deleted", row, null)!;
    await db.batch([
      db.delete(holdings).where(and(eq(holdings.id, payload.id), eq(holdings.ownerEmail, owner))),
      changeLogInsert(db, owner, deletionEvent),
    ]);
    return Response.json({ ok: true });
  }

  if (payload.action === "archive_account") {
    const now = new Date().toISOString();
    const [before] = await db.select().from(accounts).where(and(eq(accounts.id, payload.id), eq(accounts.ownerEmail, owner))).limit(1);
    const cascaded = await db.select({ id: holdings.id }).from(holdings).where(and(eq(holdings.accountId, payload.id), eq(holdings.ownerEmail, owner), isNull(holdings.archivedAt)));
    const accountUpdate = db.update(accounts).set({ archivedAt: now, updatedAt: now }).where(and(eq(accounts.id, payload.id), eq(accounts.ownerEmail, owner)));
    const holdingsUpdate = db.update(holdings).set({ archivedAt: now, updatedAt: now }).where(and(eq(holdings.accountId, payload.id), eq(holdings.ownerEmail, owner)));
    const event = before ? accountChangeEvent("account.archived", before, { ...before, archivedAt: now }, { cascadedHoldingCount: cascaded.length, cascadedHoldingIds: cascaded.map((row) => row.id) }) : null;
    if (event) await db.batch([accountUpdate, holdingsUpdate, changeLogInsert(db, owner, event)]); else await db.batch([accountUpdate, holdingsUpdate]);
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "restore_account") {
    const now = new Date().toISOString();
    const [before] = await db.select().from(accounts).where(and(eq(accounts.id, payload.id), eq(accounts.ownerEmail, owner))).limit(1);
    const cascaded = await db.select({ id: holdings.id }).from(holdings).where(and(eq(holdings.accountId, payload.id), eq(holdings.ownerEmail, owner)));
    const accountUpdate = db.update(accounts).set({ archivedAt: null, updatedAt: now }).where(and(eq(accounts.id, payload.id), eq(accounts.ownerEmail, owner)));
    const holdingsUpdate = db.update(holdings).set({ archivedAt: null, updatedAt: now }).where(and(eq(holdings.accountId, payload.id), eq(holdings.ownerEmail, owner)));
    const event = before ? accountChangeEvent("account.restored", before, { ...before, archivedAt: null }, { cascadedHoldingCount: cascaded.length, cascadedHoldingIds: cascaded.map((row) => row.id) }) : null;
    if (event) await db.batch([accountUpdate, holdingsUpdate, changeLogInsert(db, owner, event)]); else await db.batch([accountUpdate, holdingsUpdate]);
    await saveCurrentSnapshot(context);
    return Response.json({ ok: true });
  }

  if (payload.action === "delete_account") {
    const [row] = await db.select().from(accounts).where(and(eq(accounts.id, payload.id), eq(accounts.ownerEmail, owner))).limit(1);
    if (!row?.archivedAt) return Response.json({ error: "Archive the account before deleting it permanently" }, { status: 409 });
    const linked = await db.select({ id: holdings.id }).from(holdings).where(and(eq(holdings.accountId, payload.id), eq(holdings.ownerEmail, owner))).limit(1);
    if (linked.length) return Response.json({ error: "Permanently remove the archived assets first" }, { status: 409 });
    const deletionEvent = accountChangeEvent("account.deleted", row, null)!;
    await db.batch([
      db.delete(accounts).where(and(eq(accounts.id, payload.id), eq(accounts.ownerEmail, owner))),
      changeLogInsert(db, owner, deletionEvent),
    ]);
    return Response.json({ ok: true });
  }

  if (payload.action === "rate") {
    await db.update(settings).set({ usdIlsRate: payload.usdIlsRate, usdIlsRateMode: "manual", usdIlsRateAsOf: new Date().toISOString(), usdIlsRateSource: "manual", updatedAt: new Date().toISOString() }).where(eq(settings.ownerEmail, owner));
    await saveDailySnapshot(context, payload.usdIlsRate);
    return Response.json({ ok: true });
  }

  if (payload.action === "automatic_rate") {
    await db.update(settings).set({ usdIlsRateMode: "automatic", updatedAt: new Date().toISOString() }).where(eq(settings.ownerEmail, owner));
    return Response.json({ ok: true });
  }

  if (payload.action === "snapshot") {
    const [settingRows] = await Promise.all([db.select().from(settings).where(eq(settings.ownerEmail, owner)).limit(1)]);
    const rate = settingRows[0]?.usdIlsRate ?? 3.65;
    return Response.json({ snapshot: await saveDailySnapshot(context, rate) }, { status: 201 });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
