import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, CircleDollarSign, Landmark, PencilLine, RefreshCw, ShieldCheck, X } from "lucide-react";
import { cashClassificationReady, type CashChangeClassification } from "../../lib/cash-change";
import { dataCheckHoldingIds, dataCheckIssues, missingClassificationDimensions, type HoldingDataCheckIssueType } from "../../lib/data-check";
import { localDateTimeToStoredIso, storedIsoToLocalDateTime } from "../../lib/datetime-local";
import { holdingUnrealizedPl } from "../../lib/finance";
import { supportsGenericHoldingCorrection } from "../../lib/holding-correction";
import { hasPairedTransferDirection, pairedTransferDestinationBalance } from "../../lib/internal-transfer";
import { ExposureTags, HoldingIdentity } from "./PortfolioView";
import { accessLabel, copy, holdingDisplayName, holdingCanonicalName, dataCheckIssueLabel, investmentPlInput, money, signedPercentage, supportsPriceChangeComparison, unitPrice, usd, type Access, type Account, type Holding } from "./portfolio-ui";
export function DataCheckSheet({ t, holdings, valuation, close, fix, acknowledge, refresh, refreshing }: {
    t: typeof copy.en;
    holdings: Holding[];
    valuation: {
        failedCount: number;
        staleCount: number;
        rateFailed: boolean;
    };
    close: () => void;
    fix: (holding: Holding, type: HoldingDataCheckIssueType) => void;
    acknowledge: (holding: Holding, type: Exclude<HoldingDataCheckIssueType, "missing-value">) => Promise<void>;
    refresh: () => void;
    refreshing: boolean;
}) {
    const he = t.language === "English";
    const issues = dataCheckIssues(holdings, valuation);
    const holdingTypes: HoldingDataCheckIssueType[] = ["missing-value", "matured-deposit", "stale-manual-price", "missing-classification", "missing-cost-basis"];
    const problem = (holding: Holding, type: HoldingDataCheckIssueType) => type === "missing-value" ? (he ? "חסר מחיר או שווי נוכחי" : "Current price or value is missing") : type === "matured-deposit" ? (he ? "הפיקדון הגיע לפדיון ויש לעדכן או להעביר אותו לארכיון" : "The deposit matured and should be updated or archived") : type === "stale-manual-price" ? (he ? "המחיר הידני לא נבדק יותר מ־30 יום" : "Manual price has not been reviewed for over 30 days") : type === "missing-cost-basis" ? (he ? "לא הוזן בסיס עלות" : "Cost basis is missing") : (() => { const d = missingClassificationDimensions(holding); return d.geography && d.sector ? (he ? "חסרים גיאוגרפיה וענף" : "Geography and sector are missing") : d.geography ? (he ? "חסר סיווג גיאוגרפי" : "Geography is missing") : (he ? "חסר סיווג ענפי" : "Sector is missing"); })();
    return <div className="modal-backdrop" onClick={close}>
    <section className="choice-sheet data-check-sheet" onClick={e => e.stopPropagation()}>
    <div className="sheet-handle"/>
    <header>
    <div>
    <span>{he ? "בריאות הנתונים" : "Data health"}</span>
    <h2>{he ? "בדיקת נתונים" : "Data check"}</h2>
    </div>
    <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
    </header>{issues.length === 0 ? <div className="empty-state">
        <ShieldCheck size={24}/>
        <strong>{he ? "הכול מעודכן" : "No issues found"}</strong>
        </div> : <div className="data-check-groups">{holdingTypes.map(type => {
                const ids = new Set(dataCheckHoldingIds(holdings, type));
                const affected = holdings.filter(h => ids.has(h.id));
                if (!affected.length)
                    return null;
                return <section key={type}>
                <h3>{dataCheckIssueLabel(type, he)}</h3>{affected.map(h => <article key={`${type}-${h.id}`}>
                    <div className="data-check-problem">
                    <AlertTriangle size={16}/>
                    <div>
                    <strong>{holdingDisplayName(h)} · {h.account}</strong>
                    {h.displayAlias && <small><bdi>{holdingCanonicalName(h)}</bdi></small>}
                    <small>{problem(h, type)}</small>
                    </div>
                    </div>
                    <div className="data-check-actions">
                    <button className="secondary" onClick={() => fix(h, type)}>{he ? "תיקון" : "Fix"}</button>{type !== "missing-value" && type !== "matured-deposit" && <button className="text-btn" onClick={() => void acknowledge(h, type)}>{type === "missing-cost-basis" ? (he ? "להשאיר לא ידוע" : "Leave unknown") : type === "missing-classification" ? (he ? "להשאיר לא מסווג" : "Keep unclassified") : (he ? "להשאיר את הערך כרגע" : "Keep current value for now")}</button>}</div>
                    </article>)}</section>;
            })}{issues.filter(i => i.action === "refresh-valuation").map(issue => <section key={issue.type}>
            <article>
            <div className="data-check-problem">
            <AlertTriangle size={16}/>
            <div>
            <strong>{dataCheckIssueLabel(issue.type, he)}</strong>
            <small>{issue.count} {he ? "פריטים" : "items"}</small>
            </div>
            </div>
            <button className="secondary" disabled={refreshing} onClick={refresh}>
            <RefreshCw size={15} className={refreshing ? "spin" : ""}/>{he ? "רענון שווי" : "Refresh valuation"}</button>
            </article>
            </section>)}</div>}<button className="cancel" onClick={close}>{t.cancel}</button>
    </section>
    </div>;
}
export function UpdateSheet({ t, close, select }: {
    t: typeof copy.en;
    close: () => void;
    select: (mode: "cash" | "holding" | "rate" | "flow") => void;
}) {
    const he = t.language === "English";
    const actions = [
        [Landmark, t.reconcile, "cash"], [CircleDollarSign, he ? "תיעוד כסף שנכנס / יצא" : "Record money in / out", "flow"], [PencilLine, t.correction, "holding"], [CircleDollarSign, he ? "שער דולר–שקל ידני" : "Manual USD–ILS rate", "rate"],
    ] as const;
    return <div className="modal-backdrop" onClick={close}>
    <section className="update-sheet" onClick={(e) => e.stopPropagation()}>
    <div className="sheet-handle"/>
    <header>
    <div>
    <span>{t.update}</span>
    <h2>{t.choose}</h2>
    </div>
    <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
    </header>
    <div className="update-groups">
    <section>
    <h3>{t.language === "English" ? "עדכון ערכים" : "UPDATE VALUES"}</h3>
    <div className="update-grid">{actions.map(([Icon, label, mode]) => <button key={mode} onClick={() => select(mode)}>
        <span>
        <Icon size={18}/>
        </span>{label}<ChevronLeft size={16}/>
        </button>)}</div>
    </section>
    </div>
    <button className="cancel" onClick={close}>{t.cancel}</button>
    </section>
    </div>;
}
export function HoldingSheetV2({ t, holding, rate, totalTrackedWealth, close, editAccess, editAsset }: {
    t: typeof copy.en;
    holding: Holding;
    totalTrackedWealth: number;
    rate: number;
    close: () => void;
    editAccess: () => void;
    editAsset: () => void;
}) {
    const he = t.language === "English";
    const pl = holdingUnrealizedPl(investmentPlInput(holding), rate);
    const gain = pl ? signedPercentage(pl.percentage) : (he ? "לא זמין" : "Unavailable");
    const showsPriceChange = supportsPriceChangeComparison(holding);
    const priceDate = holding.status === "auto" && holding.priceAsOf ? holding.priceAsOf : holding.updatedAt;
    const wealthShare = totalTrackedWealth ? holding.ils / totalTrackedWealth * 100 : 0;
    if (holding.instrumentKind === "deposit" || holding.instrumentKind === "pension") {
        const deposit = holding.deposit;
        const date = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString(he ? "he-IL" : "en-GB") : "—";
        return <div className="modal-backdrop" onClick={close}>
        <section className="detail-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle"/>
        <header>
        <button className="back-sheet" onClick={close} aria-label={he ? "חזרה" : "Back"}>
        <ChevronRight size={21}/>
        </button>
        <span>{he ? "פרטי הנכס" : "Asset details"}</span>
        <div className="detail-header-actions">
        <button className="detail-edit" onClick={editAsset} aria-label={he ? "עריכת הנכס" : "Edit asset"} title={he ? "עריכת הנכס" : "Edit asset"}>
        <PencilLine size={17}/>
        </button>
        <button onClick={close} aria-label={t.cancel}>
        <X size={20}/>
        </button>
        </div>
        </header>
        <div className="holding-detail-head">
        <HoldingIdentity h={holding}/>
        <strong>{holding.currency === "USD" ? usd(holding.native) : money(holding.native)}</strong>
        </div>{deposit?.matured && <section className="confidence-card">
            <div>
            <span className="confidence-dot warning"/>
            <div>
            <strong>{he ? "הפיקדון הגיע לפדיון" : "Deposit matured"}</strong>
            <small>{he ? "יש לעדכן, להעביר לארכיון או להחליף את פרטי הפיקדון." : "Update, archive, or replace the deposit terms."}</small>
            </div>
            </div>
            </section>}<button className={`detail-access ${holding.access}`} onClick={editAccess}>
        <span className={`access-dot ${holding.access}`}/>{accessLabel(t, holding.access)}<ChevronLeft size={17}/>
        </button>
        <div className="detail-grid">
        <div>
        <span>{t.account}</span>
        <b>{holding.account}</b>
        </div>{deposit ? <>
            <div>
            <span>{he ? "קרן" : "Principal"}</span>
            <b>{holding.currency === "USD" ? usd(deposit.principal) : money(deposit.principal)}</b>
            </div>
            <div>
            <span>{he ? "שווי נצבר נוכחי" : "Accrued current value"}</span>
            <b>{holding.currency === "USD" ? usd(holding.native) : money(holding.native)}</b>
            </div>
            <div>
            <span>{he ? "ריבית שנתית קבועה" : "Annual fixed rate"}</span>
            <b>{deposit.annualInterestRate}%</b>
            </div>
            <div>
            <span>{he ? "התחלה" : "Start"}</span>
            <b>{date(deposit.startDate)}</b>
            </div>
            <div>
            <span>{he ? "פדיון" : "Maturity"}</span>
            <b>{date(deposit.maturityDate)}</b>
            </div>
            <div>
            <span>{he ? "נקודת יציאה הבאה" : "Next exit point"}</span>
            <b>{date(deposit.nextExitPoint)}</b>
            </div>
            </> : <>
            <div>
            <span>{he ? "יתרה נוכחית" : "Current balance"}</span>
            <b>{holding.currency === "USD" ? usd(holding.native) : money(holding.native)}</b>
            </div>{holding.instrumentKind === "pension" && <div>
            <span>{he ? "היתרה אושרה לאחרונה" : "Balance last confirmed"}</span>
            <b>{holding.manualPriceReviewedAt ? new Date(holding.manualPriceReviewedAt).toLocaleString(he ? "he-IL" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : (he ? "טרם אושרה" : "Not yet confirmed")}</b>
            </div>}</>}</div>
        <div className="data-source-note">
        <span>{deposit ? (he ? "מקור: שווי מחושב" : "Source: calculated value") : (he ? "מקור: יתרה ידנית" : "Source: manual balance")}</span>
        <small>{deposit ? (he ? "צבירה לפי ACT/365, ללא צבירה אחרי הפדיון" : "ACT/365 accrual, capped at maturity") : (he ? "ללא נתוני שוק או מזהי נייר" : "No market data or security identifiers")}</small>
        </div>
        </section>
        </div>;
    }
    return <div className="modal-backdrop" onClick={close}>
    <section className="detail-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-handle"/>
      <header>
        <button className="back-sheet" onClick={close} aria-label={he ? "חזרה" : "Back"}>
    <ChevronRight size={21}/>
    </button>
        <span>{he ? "פרטי הנכס" : "Asset details"}</span>
        <div className="detail-header-actions">
          <button className="detail-edit" onClick={editAsset} aria-label={he ? "עריכת הנכס" : "Edit asset"} title={he ? "עריכת הנכס" : "Edit asset"}>
    <PencilLine size={17}/>
    </button>
          <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
        </div>
      </header>
      <div className="holding-detail-head">
    <HoldingIdentity h={holding}/>
    <div>
    <strong>{money(holding.ils)}</strong>{showsPriceChange && pl && <span className={(pl?.unrealizedPlIls ?? 0) >= 0 ? "up" : "down"}>{gain}</span>}</div>
    </div>
      <section className="wealth-share">
    <div>
    <span>{he ? "חלק מההון הכולל" : "Share of total wealth"}</span>
    <small>{he ? "כולל את כל הנכסים ויתרות המזומן בחשבונות שבמעקב." : "Includes all tracked assets and account cash balances."}</small>
    </div>
    <strong>{wealthShare.toFixed(1)}%</strong>
    </section>
      <ConfidenceStatus holding={holding} he={he}/>
      <button className={`detail-access ${holding.access}`} onClick={editAccess}>
    <span className={`access-dot ${holding.access}`}/>{accessLabel(t, holding.access)}<ChevronLeft size={17}/>
    </button>
      <section className="exposure-card">
    <div>
    <h3>{he ? "סיווג חשיפה" : "Exposure classification"}</h3>
    <span className="profile-manual">{he ? "הערכה ידנית" : "Manual estimate"}</span>
    </div>
    <dl>
    <div>
    <dt>{he ? "גיאוגרפיה" : "Geography"}</dt>
    <dd>
    <ExposureTags holding={holding} dimension="geography" he={he} limit={1}/>
    </dd>
    </div>
    <div>
    <dt>{he ? "ענף" : "Sector"}</dt>
    <dd>
    <ExposureTags holding={holding} dimension="sector" he={he} limit={1}/>
    </dd>
    </div>
    </dl>
    <small>{he ? "הסיווג נבחר על ידך ואינו נגזר אוטומטית מהרכב הנכס." : "This classification is selected by you and is not automatically derived from the asset's composition."}</small>
    </section>
      <div className="detail-grid">
    <div>
    <span>{t.account}</span>
    <b>{holding.account}</b>
    </div>
    <div>
    <span>{t.nativeValue}</span>
    <b>{holding.currency === "USD" ? usd(holding.native) : money(holding.native)}</b>
    </div>
    <div>
    <span>{t.qty}</span>
    <b>{holding.qty}</b>
    </div>
    <div>
    <span>{t.avgPrice}</span>
    <b>{holding.avg > 0 ? unitPrice(holding.avg, holding.currency) : (he ? "לא הוזן" : "Not provided")}</b>
    </div>
    <div>
    <span>{t.current}</span>
    <b>{unitPrice(holding.price, holding.currency)}</b>
    </div>
    {showsPriceChange && <div>
    <span>{t.return}</span>
    <b className={pl ? ((pl?.unrealizedPlIls ?? 0) >= 0 ? "up" : "down") : ""}>{gain}</b>
    </div>}
    </div>
      {holding.status === "auto" && <section className="identifier-card">
        <h3>{he ? "זיהוי נייר" : "Instrument identifiers"}</h3>
        <dl>
        <div>
        <dt>{he ? "זהות רשמית" : "Canonical ID"}</dt>
        <dd>{holding.instrumentProvider}:{holding.providerInstrumentId}</dd>
        </div>{holding.quoteProvider && <div>
            <dt>{he ? "מזהה תמחור" : "Quote ID"}</dt>
            <dd>{holding.quoteProvider}:{holding.quoteProviderInstrumentId}</dd>
            </div>}<div>
        <dt>{he ? "בורסה" : "Exchange"}</dt>
        <dd>{holding.instrumentExchange || "—"}{holding.instrumentMic ? ` · ${holding.instrumentMic}` : ""}</dd>
        </div>
        <div>
        <dt>ISIN</dt>
        <dd>{holding.instrumentIsin || (he ? "לא זמין כרגע" : "Not currently available")}</dd>
        </div>
        </dl>
        </section>}
      <div className="data-source-note">
    <span>{holding.status === "auto" ? (holding.instrumentProvider === "keren44" ? (he ? "מקור: NAV יומי אוטומטי" : "Source: automatic daily NAV") : (he ? "מקור: מחיר סגירה אוטומטי" : "Source: automatic market close")) : (he ? "מקור: ידני" : "Source: manual")}</span>
    <small>{holding.status === "auto" ? (holding.instrumentProvider === "keren44" ? (he ? "NAV נכון ל־" : "NAV as of ") : (he ? "מחיר נכון לסגירת " : "Price as of close ")) : (he ? "עודכן " : "Updated ")}{new Date(priceDate).toLocaleDateString(he ? "he-IL" : "en-US")}</small>
    </div>
    </section>
  </div>;
}
export function AccessSheet({ t, holding, close, choose }: {
    t: typeof copy.en;
    holding: Holding;
    close: () => void;
    choose: (a: Access) => void;
}) {
    const he = t.language === "English";
    const description = (a: Access) => a === "available" ? (he ? "ניתן לשימוש מיידי" : "Spendable immediately") : a === "near" ? (he ? "זמין לאחר פעולה קצרה" : "Available after a small action") : a === "invested" ? (he ? "לא מיועד להוצאה שוטפת" : "Not intended for spending") : (he ? "מוגבל או לא זמין" : "Restricted or unavailable");
    return <div className="modal-backdrop" onClick={close}>
    <section className="choice-sheet" onClick={(e) => e.stopPropagation()}>
    <div className="sheet-handle"/>
    <header>
    <div>
    <span>{holdingDisplayName(holding)}</span>
    {holding.displayAlias && <small className="canonical-identity"><bdi>{holdingCanonicalName(holding)}</bdi></small>}
    <h2>{t.editClass}</h2>
    </div>
    <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
    </header>
    <div className="choice-list">{(["available", "near", "invested", "locked"] as Access[]).map((a) => <button className={holding.access === a ? "selected" : ""} key={a} onClick={() => choose(a)}>
        <span className={`access-dot ${a}`}/>
        <div>
        <strong>{accessLabel(t, a)}</strong>
        <small>{description(a)}</small>
        </div>{holding.access === a && <ShieldCheck size={19}/>}</button>)}</div>
    </section>
    </div>;
}
export function MaintenanceSheet({ t, mode, accounts, holdings, rate, close, save }: {
    t: typeof copy.en;
    mode: "cash" | "holding" | "rate" | "flow";
    accounts: Account[];
    holdings: Holding[];
    rate: number;
    close: () => void;
    save: (payload: Record<string, unknown>) => Promise<void>;
}) {
    const he = t.language === "English";
    const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0);
    const correctableHoldings = holdings.filter((holding) => supportsGenericHoldingCorrection(holding.instrumentKind));
    const firstHolding = correctableHoldings[0];
    const [holdingId, setHoldingId] = useState(firstHolding?.id ?? 0);
    const account = accounts.find(a => a.id === accountId);
    const holding = correctableHoldings.find(h => h.id === holdingId);
    const [balance, setBalance] = useState(account?.cashBalance ?? 0);
    const [currency, setCurrency] = useState<"ILS" | "USD">(account?.cashCurrency ?? "ILS");
    const [quantity, setQuantity] = useState(firstHolding?.qty ?? 0);
    const [averagePrice, setAveragePrice] = useState(firstHolding?.avg ?? 0);
    const [currentPrice, setCurrentPrice] = useState(firstHolding?.price ?? 0);
    const [usdRate, setUsdRate] = useState(rate);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [classification, setClassification] = useState<CashChangeClassification>("");
    const [flowDirection, setFlowDirection] = useState<"in" | "out">("in");
    const [flowAmount, setFlowAmount] = useState(0);
    const [flowIls, setFlowIls] = useState(0);
    const [flowNote, setFlowNote] = useState("");
    const [occurredAt, setOccurredAt] = useState(() => storedIsoToLocalDateTime(new Date()));
    const transferAccounts = accounts.filter(candidate => candidate.id !== accountId);
    const [destinationAccountId, setDestinationAccountId] = useState(accounts.find(candidate => candidate.id !== accountId)?.id ?? 0);
    const [destinationBalance, setDestinationBalance] = useState(accounts.find(candidate => candidate.id !== accountId)?.cashBalance ?? 0);
    const chooseAccount = (id: number) => { setAccountId(id); const selected = accounts.find(a => a.id === id); const nextDestination = accounts.find(candidate => candidate.id !== id); setBalance(selected?.cashBalance ?? 0); setCurrency(selected?.cashCurrency ?? "ILS"); setDestinationAccountId(nextDestination?.id ?? 0); setDestinationBalance(nextDestination?.cashBalance ?? 0); setClassification(""); };
    const chooseHolding = (id: number) => { setHoldingId(id); const selected = correctableHoldings.find(h => h.id === id); setQuantity(selected?.qty ?? 0); setAveragePrice(selected?.avg ?? 0); setCurrentPrice(selected?.price ?? 0); };
    const cashChanged = Boolean(account && (balance !== account.cashBalance || currency !== account.cashCurrency));
    const classificationReady = cashClassificationReady(cashChanged, classification);
    const cashDelta = account && currency === account.cashCurrency ? balance - account.cashBalance : 0;
    const external = classification === "external_in" || classification === "external_out";
    const internal = classification === "internal";
    const destination = transferAccounts.find(candidate => candidate.id === destinationAccountId);
    const destinationTarget = account && destination && currency === destination.cashCurrency ? pairedTransferDestinationBalance(account.cashBalance, balance, destination.cashBalance) : destinationBalance;
    const transferDirectionValid = Boolean(account && destination && hasPairedTransferDirection(balance - account.cashBalance, destinationTarget - destination.cashBalance));
    const transferReady = Boolean(account && destination && currency === account.cashCurrency && destinationTarget >= 0 && transferDirectionValid);
    const suggestedAmount = Math.abs(cashDelta);
    const effectiveAmount = flowAmount || suggestedAmount;
    const effectiveIls = currency === "ILS" ? effectiveAmount : (flowIls || effectiveAmount * rate);
    const submit = async () => { setBusy(true); setError(""); try {
        if (mode === "cash")
            await save(internal && account && destination ? { action: "internal_transfer", sourceAccountId: account.id, destinationAccountId: destination.id, sourceBalance: balance, destinationBalance: destinationTarget, sourceCurrency: currency, destinationCurrency: destination.cashCurrency } : { action: "cash", id: accountId, balance, currency, ...(cashChanged ? { flowClassification: classification } : {}), ...(external ? { flow: { direction: classification === "external_in" ? "in" : "out", originalAmount: effectiveAmount, currency, ilsValue: effectiveIls, occurredAt: localDateTimeToStoredIso(occurredAt), note: flowNote } } : {}) });
        if (mode === "flow")
            await save({ action: "save_wealth_flow", direction: flowDirection, originalAmount: flowAmount, currency, ilsValue: currency === "ILS" ? flowAmount : flowIls, relatedAccountId: accountId || undefined, occurredAt: localDateTimeToStoredIso(occurredAt), note: flowNote });
        if (mode === "holding")
            await save({ action: "holding", id: holdingId, quantity, averagePrice, currentPrice });
        if (mode === "rate")
            await save({ action: "rate", usdIlsRate: usdRate });
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Update failed");
        setBusy(false);
    } };
    const title = mode === "cash" ? t.reconcile : mode === "flow" ? (he ? "תיעוד כסף חיצוני" : "Record external money") : mode === "holding" ? t.correction : (he ? "עדכון ידני של שער דולר–שקל" : "Manually override USD–ILS rate");
    return <div className="modal-backdrop" onClick={close}>
    <section className={`choice-sheet form-sheet ${mode === "rate" ? "rate-update-sheet" : ""}`} onClick={e => e.stopPropagation()}>
    <div className="sheet-handle"/>
    <header>
    <div>
    <span>{t.update}</span>
    <h2>{title}</h2>
    </div>
    <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
    </header>
    <div className="sheet-form">
    {mode === "cash" && <>
        <label>
        <span>{t.account}</span>
        <select value={accountId} onChange={e => chooseAccount(Number(e.target.value))}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
        <label className={cashChanged ? "cash-balance-changed" : undefined}>
        <span>{t.cashBalance}</span>
        <div className="money-input">
        <input type="number" min="0" step="any" value={balance} onChange={e => { setBalance(Number(e.target.value)); setClassification(""); }}/>
        <select value={currency} onChange={e => { setCurrency(e.target.value as "ILS" | "USD"); setClassification(""); }}>
        <option>ILS</option>
        <option>USD</option>
        </select>
        </div>
        </label>{cashChanged && <label className={`cash-classification ${classification ? "complete" : "needs-selection"}`}>
            <span>{he ? "סיווג השינוי" : "Classify this change"}</span>
            <select value={classification} aria-invalid={!classification} aria-describedby="quick-cash-classification-help" onChange={e => setClassification(e.target.value as CashChangeClassification)}>
            <option value="" disabled>{he ? "בחירת סיווג…" : "Choose classification…"}</option>
            <option value="external_in">{he ? "כסף חיצוני נכנס" : "External money in"}</option>
            <option value="external_out">{he ? "כסף חיצוני יצא" : "External money out"}</option>
            <option value="internal" disabled={currency !== account?.cashCurrency || transferAccounts.length === 0}>{he ? "העברה פנימית בין חשבונות" : "Internal transfer between accounts"}</option>
            <option value="correction">{he ? "תיקון / אחר" : "Correction / other"}</option>
            </select>
            <small id="quick-cash-classification-help" className="field-help classification-help">{classification ? (he ? "הסיווג יישמר יחד עם היתרה החדשה." : "This classification will be saved with the new balance.") : (he ? "כדי להפעיל את השמירה, יש לבחור אם זה כסף חיצוני, העברה פנימית או תיקון." : "To enable Save, choose whether this is external money, an internal transfer, or a correction.")}</small>
            </label>}{external && <>
            <label>
            <span>{he ? "סכום במטבע המקור" : "Original amount"}</span>
            <div className="money-input">
            <input type="number" min="0" step="any" value={flowAmount || suggestedAmount} onChange={e => setFlowAmount(Number(e.target.value))}/>
            <select value={currency} disabled>
            <option>{currency}</option>
            </select>
            </div>
            </label>{currency === "USD" && <label>
                <span>{he ? "שווי מיוחס בש״ח" : "Attributed ILS value"}</span>
                <input type="number" min="0" step="any" value={flowIls || effectiveIls} onChange={e => setFlowIls(Number(e.target.value))}/>
                <small className="field-help">{he ? "אפשר לתקן ידנית את שווי השקל." : "You can correct the ILS value manually."}</small>
                </label>}<label>
            <span>{he ? "מועד מעבר הכסף" : "When the money crossed the boundary"}</span>
            <input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)}/>
            </label>
            <label>
            <span>{he ? "הערה (אופציונלי)" : "Note (optional)"}</span>
            <input value={flowNote} onChange={e => setFlowNote(e.target.value)}/>
            </label>
            </>}{internal && destination && <div className="form-grid transfer-pair">
            <label>
            <span>{he ? "חשבון יעד" : "Destination account"}</span>
            <select value={destinationAccountId} onChange={e => { const id = Number(e.target.value); const selected = transferAccounts.find(candidate => candidate.id === id); setDestinationAccountId(id); setDestinationBalance(selected?.cashBalance ?? 0); }}>{transferAccounts.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.cashCurrency}</option>)}</select>
            </label>
            <label>
            <span>{he ? "יתרת היעד לאחר ההעברה" : "Destination balance after transfer"}</span>
            <div className="money-input"><input type="number" min="0" step="any" readOnly={currency === destination.cashCurrency} value={destinationTarget} onChange={e => setDestinationBalance(Number(e.target.value))}/><select disabled value={destination.cashCurrency}><option>{destination.cashCurrency}</option></select></div>
            <small className="field-help">{currency === destination.cashCurrency ? (he ? "היתרה מחושבת מאותו סכום; סך שתי היתרות נשמר." : "Calculated from the same amount; the combined balance is preserved.") : (he ? "יש להזין את יתרת היעד במטבע שלה. לא מחושב שער המרה." : "Enter the destination balance in its own currency. No exchange rate is inferred.")}</small>
            {!transferDirectionValid && <small className="field-help form-error">{he ? "יתרת המקור חייבת לרדת ויתרת היעד חייבת לעלות." : "The source balance must decrease and the destination balance must increase."}</small>}
            </label>
            </div>}</>}
    {mode === "flow" && <>
        <div className="flow-direction">
        <button type="button" className={flowDirection === "in" ? "active" : ""} onClick={() => setFlowDirection("in")}>{he ? "כסף נכנס" : "Money in"}</button>
        <button type="button" className={flowDirection === "out" ? "active" : ""} onClick={() => setFlowDirection("out")}>{he ? "כסף יצא" : "Money out"}</button>
        </div>
        <label>
        <span>{he ? "חשבון קשור (אופציונלי)" : "Related account (optional)"}</span>
        <select value={accountId} onChange={e => setAccountId(Number(e.target.value))}>
        <option value={0}>{he ? "ללא חשבון" : "No account"}</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
        <label>
        <span>{he ? "סכום ומטבע מקור" : "Original amount and currency"}</span>
        <div className="money-input">
        <input type="number" min="0" step="any" value={flowAmount || ""} onChange={e => { const amount = Number(e.target.value); setFlowAmount(amount); setFlowIls(currency === "USD" ? amount * rate : amount); }}/>
        <select value={currency} onChange={e => { const next = e.target.value as "ILS" | "USD"; setCurrency(next); setFlowIls(next === "USD" ? flowAmount * rate : flowAmount); }}>
        <option>ILS</option>
        <option>USD</option>
        </select>
        </div>
        </label>{currency === "USD" && <label>
            <span>{he ? "שווי מיוחס בש״ח" : "Attributed ILS value"}</span>
            <input type="number" min="0" step="any" value={flowIls || ""} onChange={e => setFlowIls(Number(e.target.value))}/>
            </label>}<label>
        <span>{he ? "מועד" : "Occurred at"}</span>
        <input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)}/>
        </label>
        <label>
        <span>{he ? "הערה (אופציונלי)" : "Note (optional)"}</span>
        <input value={flowNote} onChange={e => setFlowNote(e.target.value)}/>
        </label>
        </>}
    {mode === "holding" && <>{correctableHoldings.length ? <>
            <label>
            <span>{t.holding}</span>
            <select value={holdingId} onChange={e => chooseHolding(Number(e.target.value))}>{correctableHoldings.map(h => <option key={h.id} value={h.id}>{h.displayAlias ? `${h.displayAlias} · ` : ""}{h.symbol} · {h.name}</option>)}</select>
            </label>
            <div className="form-grid">
            <label>
            <span>{t.qty}</span>
            <input type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(Number(e.target.value))}/>
            </label>
            <label>
            <span>{t.avgPrice} ({holding?.currency})</span>
            <input type="number" min="0" step="any" value={averagePrice} onChange={e => setAveragePrice(Number(e.target.value))}/>
            </label>
            <label className="wide">
            <span>{t.current} ({holding?.currency})</span>
            <input type="number" min="0" step="any" value={currentPrice} onChange={e => setCurrentPrice(Number(e.target.value))}/>
            </label>
            </div>
            </> : <div className="empty-state">{he ? "אין נכסים לעדכון" : "No assets to update"}</div>}</>}
    {mode === "rate" && <>
        <p className="field-help">{he ? "השער מתעדכן בדרך כלל אוטומטית. אין צורך להזין אותו ידנית. שמירה כאן מחליפה את השער במעקב בשער ידני; ניתן לחזור לאוטומטי בהגדרות." : "USD–ILS normally refreshes automatically; no manual entry is needed. Saving here overrides the tracked rate until you switch back to automatic in Settings."}</p>
        <label>
        <span>{he ? "כמה שקלים שווה דולר אחד" : "ILS per 1 USD"}</span>
        <input type="number" min="0.1" step="0.0001" value={usdRate} onChange={e => setUsdRate(Number(e.target.value))}/>
        </label></>}
  {error && <p className="form-error">{error}</p>}</div><button className="primary sheet-save" aria-describedby={mode === "cash" && !classificationReady ? "quick-cash-classification-help" : undefined} disabled={busy || (mode === "holding" && !correctableHoldings.length) || (mode === "cash" && !classificationReady) || (mode === "cash" && external && (!effectiveAmount || !effectiveIls)) || (mode === "cash" && internal && !transferReady) || (mode === "flow" && (!flowAmount || !flowIls))} onClick={() => void submit()}>{busy ? (he ? "שומר…" : "Saving…") : mode === "rate" ? (he ? "שמירת שער ידני" : "Save manual rate") : (he ? "שמירה" : "Save")}</button>
    </section>
    </div>;
}
function ConfidenceStatus({ holding, he }: {
    holding: Holding;
    he: boolean;
}) {
    const priceState = holding.price <= 0 ? "error" : holding.status === "manual" ? "manual" : holding.quoteStatus === "refresh_failed" ? "error" : holding.priceStale ? "warning" : "ok";
    const priceLabel = holding.price <= 0 ? (he ? "חסר מחיר" : "Price missing") : holding.status === "manual" ? (he ? "מחיר ידני" : "Manual price") : holding.quoteStatus === "refresh_failed" ? (he ? "רענון המחיר נכשל — הערך הקודם נשמר" : "Price refresh failed — previous value retained") : holding.priceStale ? (he ? "מחיר אוטומטי ממתין לעדכון" : "Automatic price awaiting refresh") : (he ? "מחיר אוטומטי מעודכן" : "Automatic price up to date");
    return <section className="confidence-card">
    <div>
    <span className={`confidence-dot ${priceState}`}/>
    <div>
    <strong>{he ? "מצב המחיר" : "Price status"}</strong>
    <small>{priceLabel}</small>
    </div>
    <b>{new Date(holding.status === "auto" && holding.priceAsOf ? holding.priceAsOf : holding.updatedAt).toLocaleDateString(he ? "he-IL" : "en-US")}</b>
    </div>
    </section>;
}
