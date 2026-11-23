import { useEffect, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, PencilLine, Plus, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { cashClassificationReady, type CashChangeClassification } from "../../lib/cash-change";
import { isExposureEligible } from "../../lib/finance";
import { fixedDepositValidationIssues, type FixedDepositValidationIssue } from "../../lib/fixed-deposit";
import { hasPairedTransferDirection, pairedTransferDestinationBalance } from "../../lib/internal-transfer";
import { localDateTimeToStoredIso, storedIsoToLocalDateTime } from "../../lib/datetime-local";
import { missingClassificationDimensions, type HoldingDataCheckIssueType } from "../../lib/data-check";
import { holdingAliasMaxLength } from "../../lib/holding-alias";
import { isValidAnnualManagementFeePercent } from "../../lib/account-management-fee";
import { HoldingIdentity } from "./PortfolioView";
import { accessLabel, assetTypeLabel, assetTypes, copy, exposureLabel, geographyOptions, sectorOptions, instrumentKindForType, instrumentSaveFields, money, normalizeAssetType, usd, type Access, type Account, type AssetType, type Holding, type InstrumentMatch } from "./portfolio-ui";
export function PortfolioManager({ t, accounts, holdings, rate, initialAccountId, start, close, saved, dataCheckFocus }: {
    t: typeof copy.en;
    accounts: Account[];
    holdings: Holding[];
    rate: number;
    initialAccountId: number | null;
    start: "new-account" | "new-asset" | number | null;
    close: () => void;
    saved: () => Promise<Holding[]>;
    dataCheckFocus: HoldingDataCheckIssueType | null;
}) {
    const he = t.language === "English";
    const activeAccounts = accounts.filter(a => !a.archivedAt);
    const activeIds = new Set(activeAccounts.map(a => a.id));
    const activeHoldings = holdings.filter(h => !h.archivedAt && activeIds.has(h.accountId));
    const archivedAccounts = accounts.filter(a => a.archivedAt);
    const archivedAssets = holdings.filter(h => h.archivedAt && !accounts.find(a => a.id === h.accountId)?.archivedAt);
    const [accountId, setAccountId] = useState<number | null>(initialAccountId);
    const [editingAccount, setEditingAccount] = useState<number | null | "new">(start === "new-account" ? "new" : null);
    const [editingAsset, setEditingAsset] = useState<number | null | "new">(start === "new-asset" ? (activeAccounts.length ? "new" : null) : typeof start === "number" ? start : null);
    const [error, setError] = useState(start === "new-asset" && !activeAccounts.length ? (he ? "יש להוסיף חשבון לפני הוספת נכס." : "Add an account before adding an asset.") : "");
    const account = activeAccounts.find(a => a.id === accountId);
    const owned = activeHoldings.filter(h => h.accountId === accountId);
    const back = () => {
        if (editingAsset !== null) {
            if (dataCheckFocus)
                return close();
            return setEditingAsset(null);
        }
        if (editingAccount !== null)
            return setEditingAccount(null);
        if (accountId !== null)
            return setAccountId(null);
        close();
    };
    const act = async (action: string, id: number) => {
        if (action.startsWith("delete_") && !window.confirm(he ? "למחוק לצמיתות? לא ניתן לבטל את הפעולה." : "Delete permanently? This cannot be undone."))
            return;
        setError("");
        const r = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id }) });
        const data = await r.json();
        if (!r.ok)
            return setError(data.error ?? "Action failed");
        await saved();
    };
    if (editingAccount !== null)
        return <AccountEditor t={t} rate={rate} accounts={activeAccounts} account={editingAccount === "new" ? null : activeAccounts.find(a => a.id === editingAccount) ?? null} close={back} saved={async () => { await saved(); setEditingAccount(null); }}/>;
    if (editingAsset !== null)
        return <AssetEditor t={t} asset={editingAsset === "new" ? null : activeHoldings.find(h => h.id === editingAsset) ?? null} defaultAccountId={accountId ?? activeAccounts[0]?.id ?? 0} accounts={activeAccounts} close={back} dataCheckFocus={dataCheckFocus} saved={async () => {
                await saved();
                if (dataCheckFocus)
                    close();
                else
                    setEditingAsset(null);
            }}/>;
    return <div className="modal-backdrop" onClick={close}>
    <section className="choice-sheet manager-sheet account-manager" onClick={e => e.stopPropagation()}>
    <div className="sheet-handle"/>
    <header>
    <button className="back-sheet" onClick={back} aria-label={he ? "חזרה" : "Back"}>
    <ChevronRight size={21}/>
    </button>
    <div>
    <span>{t.app}</span>
    <h2>{account?.name ?? (he ? "ניהול חשבונות" : "Manage accounts")}</h2>
    </div>
    <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
    </header>
  {account ? <>
        <div className="account-manager-summary">
        <div>
        <span>{he ? "מזומן פנוי בחשבון" : "Uninvested cash"}</span>
        <strong>{account.cashCurrency === "USD" ? usd(account.cashBalance) : money(account.cashBalance)}</strong>
        {account.annualManagementFeePercent != null && <small>{he ? "דמי ניהול: " : "Management fee: "}<bdi>{account.annualManagementFeePercent}%</bdi>{he ? " לשנה" : " / year"}</small>}
        </div>
        <button className="secondary" onClick={() => setEditingAccount(account.id)}>
        <PencilLine size={16}/>{he ? "עריכת החשבון" : "Edit account"}</button>
        </div>
        <div className="manager-section-head">
        <div>
        <h3>{he ? "נכסים בחשבון" : "Assets in this account"}</h3>
        <small>{owned.length} {t.holdings}</small>
        </div>
        <button className="primary" onClick={() => setEditingAsset("new")}>
        <Plus size={16}/>{he ? "הוספת נכס לחשבון" : "Add asset to account"}</button>
        </div>
        <div className="manager-asset-list">{owned.map(h => <button key={h.id} onClick={() => setEditingAsset(h.id)}>
            <HoldingIdentity h={h}/>
            <div>
            <strong>{money(h.ils)}</strong>
            <small>{accessLabel(t, h.access)}</small>
            </div>
            <PencilLine size={17}/>
            </button>)}{!owned.length && <div className="empty-state">{he ? "אין עדיין נכסים בחשבון הזה" : "No assets in this account yet"}</div>}</div>
        </> : <>
        <div className="manager-intro">
        <p>{he ? "בחר חשבון כדי לראות ולערוך את הנכסים שנמצאים בו." : "Choose an account to view and edit the assets held in it."}</p>
        <button className="primary" onClick={() => setEditingAccount("new")}>
        <Plus size={16}/>{he ? "הוספת חשבון" : "Add account"}</button>
        </div>{error && <p className="form-error">{error}</p>}<div className="manager-account-list">{activeAccounts.map(a => {
                const count = activeHoldings.filter(h => h.accountId === a.id).length;
                return <button key={a.id} onClick={() => setAccountId(a.id)}>
                <span className="account-symbol">{a.kind === "bank" ? "₪" : a.kind === "crypto_wallet" ? "₿" : a.name.slice(0, 2).toUpperCase()}</span>
                <div>
                <strong>{a.name}</strong>
                <small>{count} {t.holdings}</small>
                </div>
                <ChevronLeft size={18}/>
                </button>;
            })}</div>{(archivedAccounts.length > 0 || archivedAssets.length > 0) && <section className="archive-section">
            <h3>
            <Archive size={17}/>{he ? "ארכיון" : "Archive"}</h3>
            <p>{he ? "פריטים בארכיון אינם נכללים בחישובי ההון." : "Archived items are excluded from wealth calculations."}</p>{archivedAccounts.map(a => {
                    const linked = holdings.filter(h => h.accountId === a.id).length;
                    return <div className="archive-row" key={`a-${a.id}`}>
                    <div>
                    <strong>{a.name}</strong>
                    <small>{linked} {t.holdings}</small>
                    </div>
                    <div className="archive-actions">
                    <button onClick={() => void act("restore_account", a.id)}>
                    <RotateCcw size={15}/>{he ? "שחזור" : "Restore"}</button>{linked === 0 && <button className="danger-action" onClick={() => void act("delete_account", a.id)}>
                        <Trash2 size={15}/>{he ? "מחיקה לצמיתות" : "Delete permanently"}</button>}</div>
                    </div>;
                })}{archivedAssets.map(h => <div className="archive-row" key={`h-${h.id}`}>
                <div>
                {h.displayAlias ? <HoldingIdentity h={h}/> : <strong>{h.symbol || h.name}</strong>}
                <small>{accounts.find(a => a.id === h.accountId)?.name}</small>
                </div>
                <div className="archive-actions">
                <button onClick={() => void act("restore_asset", h.id)}>
                <RotateCcw size={15}/>{he ? "שחזור" : "Restore"}</button>
                <button className="danger-action" onClick={() => void act("delete_asset", h.id)}>
                <Trash2 size={15}/>{he ? "מחיקה לצמיתות" : "Delete permanently"}</button>
                </div>
                </div>)}</section>}</>}</section>
    </div>;
}
function AccountEditor({ t, rate, accounts, account, close, saved }: {
    t: typeof copy.en;
    rate: number;
    accounts: Account[];
    account: Account | null;
    close: () => void;
    saved: () => Promise<void>;
}) {
    const he = t.language === "English";
    const [name, setName] = useState(account?.name ?? "");
    const [kind, setKind] = useState<Account["kind"]>(account?.kind ?? "other");
    const [balance, setBalance] = useState(account?.cashBalance ?? 0);
    const [currency, setCurrency] = useState<"ILS" | "USD">(account?.cashCurrency ?? "ILS");
    const [feeInput, setFeeInput] = useState(account?.annualManagementFeePercent?.toString() ?? "");
    const [feeBadInput, setFeeBadInput] = useState(false);
    const showFee = kind === "broker" || account?.annualManagementFeePercent != null || feeInput !== "" || feeBadInput;
    const annualManagementFeePercent = feeInput.trim() === "" ? null : Number(feeInput);
    const feeValid = !feeBadInput && isValidAnnualManagementFeePercent(annualManagementFeePercent);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [classification, setClassification] = useState<CashChangeClassification>("");
    const [flowAmount, setFlowAmount] = useState(0);
    const [flowIls, setFlowIls] = useState(0);
    const [occurredAt, setOccurredAt] = useState(() => storedIsoToLocalDateTime(new Date()));
    const [note, setNote] = useState("");
    const transferAccounts = accounts.filter(candidate => candidate.id !== account?.id);
    const [destinationAccountId, setDestinationAccountId] = useState(transferAccounts[0]?.id ?? 0);
    const [destinationBalance, setDestinationBalance] = useState(transferAccounts[0]?.cashBalance ?? 0);
    const changed = Boolean(account && (balance !== account.cashBalance || currency !== account.cashCurrency));
    const classificationReady = cashClassificationReady(changed, classification);
    const delta = account && currency === account.cashCurrency ? balance - account.cashBalance : 0;
    const external = classification === "external_in" || classification === "external_out";
    const internal = classification === "internal";
    const destination = transferAccounts.find(candidate => candidate.id === destinationAccountId);
    const destinationTarget = account && destination && currency === destination.cashCurrency ? pairedTransferDestinationBalance(account.cashBalance, balance, destination.cashBalance) : destinationBalance;
    const transferDirectionValid = Boolean(account && destination && hasPairedTransferDirection(balance - account.cashBalance, destinationTarget - destination.cashBalance));
    const transferReady = Boolean(account && destination && currency === account.cashCurrency && destinationTarget >= 0 && transferDirectionValid);
    const suggested = Math.abs(delta);
    const amount = flowAmount || suggested;
    const ils = currency === "ILS" ? amount : (flowIls || amount * rate);
    const submit = async () => {
        if (!feeValid) return;
        setBusy(true);
        setError("");
        try {
            const payload = internal && account && destination ? { action: "internal_transfer", sourceAccountId: account.id, destinationAccountId: destination.id, sourceBalance: balance, destinationBalance: destinationTarget, sourceCurrency: currency, destinationCurrency: destination.cashCurrency, sourceName: name, sourceKind: kind, ...(showFee ? { sourceAnnualManagementFeePercent: annualManagementFeePercent } : {}) } : { action: "save_account", id: account?.id, name, kind, cashBalance: balance, cashCurrency: currency, ...(showFee ? { annualManagementFeePercent } : {}), ...(changed ? { flowClassification: classification } : {}), ...(changed && external ? { flow: { direction: classification === "external_in" ? "in" : "out", originalAmount: amount, currency, ilsValue: ils, occurredAt:localDateTimeToStoredIso(occurredAt), note } } : {}) };
            const r = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.error);
            await saved();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
            setBusy(false);
        }
    };
    const archive = async () => {
        if (!account || !window.confirm(he ? "להעביר את החשבון ואת כל הנכסים שבו לארכיון? ניתן לשחזר אחר כך." : "Archive this account and all its assets? You can restore them later."))
            return;
        setBusy(true);
        const r = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archive_account", id: account.id }) });
        const d = await r.json();
        if (!r.ok) {
            setError(d.error ?? "Archive failed");
            setBusy(false);
            return;
        }
        await saved();
    };
    return <div className="modal-backdrop">
    <section className="choice-sheet form-sheet">
    <div className="sheet-handle"/>
    <header>
    <button className="back-sheet" onClick={close} aria-label={he ? "חזרה" : "Back"}>
    <ChevronRight size={21}/>
    </button>
    <div>
    <span>{he ? "חשבון" : "Account"}</span>
    <h2>{account ? (he ? "עריכת חשבון" : "Edit account") : (he ? "הוספת חשבון" : "Add account")}</h2>
    </div>
    <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
    </header>
    <div className="sheet-form">
    <label>
    <span>{he ? "שם החשבון" : "Account name"}</span>
    <input value={name} onChange={e => setName(e.target.value)}/>
    </label>
    <div className="form-grid">
    <label>
    <span>{he ? "סוג החשבון" : "Account type"}</span>
    <select value={kind} onChange={e => setKind(e.target.value as Account["kind"])}>
    <option value="bank">{he ? "בנק" : "Bank"}</option>
    <option value="broker">{he ? "חשבון מסחר" : "Broker"}</option>
    <option value="crypto_wallet">{he ? "ארנק קריפטו" : "Crypto wallet"}</option>
    <option value="cash">{he ? "מזומן פיזי" : "Physical cash"}</option>
    <option value="pension">{he ? "פנסיה" : "Pension"}</option>
    <option value="deposit">{he ? "פיקדון עצמאי" : "Standalone deposit"}</option>
    <option value="other">{he ? "אחר" : "Other"}</option>
    </select>
    </label>
    <label className={changed ? "cash-balance-changed" : undefined}>
    <span>{he ? "יתרת מזומן שאינה מוזנת כנכס" : "Cash balance not entered as an asset"}</span>
    <div className="money-input">
    <input type="number" min="0" step="any" value={balance || ""} placeholder="0" onFocus={e => e.currentTarget.select()} onChange={e => { setBalance(Number(e.target.value)); setClassification(""); }}/>
    <select value={currency} onChange={e => { setCurrency(e.target.value as "ILS" | "USD"); setClassification(""); }}>
    <option>ILS</option>
    <option>USD</option>
    </select>
    </div>
    <small className="field-help">{he ? "יש להזין כאן רק כסף שאינו כבר מופיע כנכס, כולל קרן של פיקדון." : "Enter only money not already listed as an asset, including deposit principal."}</small>
    </label>
    </div>{showFee && <label>
        <span>{he ? "דמי ניהול שנתיים (%)" : "Annual management fee (%)"}</span>
        <input type="number" inputMode="decimal" min="0" max="100" step="any" value={feeInput} aria-invalid={!feeValid} aria-describedby="account-fee-help" onInput={e => setFeeBadInput(e.currentTarget.validity.badInput)} onChange={e => setFeeInput(e.target.value)}/>
        <small id="account-fee-help" className="field-help">{he ? "אופציונלי. אחוז משווי הנכסים בשנה. אם אין דמי ניהול, יש להזין 0. למידע בלבד; אינו מנוכה מההון במעקב." : "Optional. Percentage of assets per year. Enter 0 if this account has no management fee. Informational only; not deducted from tracked wealth."}</small>
        {!feeValid && <small className="field-help form-error" role="alert">{he ? "יש להזין אחוז בין 0 ל־100." : "Enter a percentage between 0 and 100."}</small>}
    </label>}{changed && <>
        <label className={`cash-classification ${classification ? "complete" : "needs-selection"}`}>
        <span>{he ? "סיווג שינוי המזומן" : "Classify the cash change"}</span>
        <select value={classification} aria-invalid={!classification} aria-describedby="account-cash-classification-help" onChange={e => setClassification(e.target.value as CashChangeClassification)}>
        <option value="" disabled>{he ? "בחירת סיווג…" : "Choose classification…"}</option>
        <option value="external_in">{he ? "כסף חיצוני נכנס" : "External money in"}</option>
        <option value="external_out">{he ? "כסף חיצוני יצא" : "External money out"}</option>
        <option value="internal" disabled={currency !== account?.cashCurrency || transferAccounts.length === 0}>{he ? "העברה פנימית בין חשבונות" : "Internal transfer between accounts"}</option>
        <option value="correction">{he ? "תיקון / אחר" : "Correction / other"}</option>
        </select>
        <small id="account-cash-classification-help" className="field-help classification-help">{classification ? (he ? "הסיווג יישמר יחד עם היתרה החדשה." : "This classification will be saved with the new balance.") : (he ? "כדי לשמור את היתרה החדשה, יש לבחור אם זה כסף חיצוני, העברה פנימית או תיקון." : "To save the new balance, choose whether this is external money, an internal transfer, or a correction.")}</small>
        </label>{external && <div className="form-grid">
            <label>
            <span>{he ? "סכום במטבע המקור" : "Original amount"}</span>
            <input type="number" min="0" step="any" value={flowAmount || suggested} onChange={e => setFlowAmount(Number(e.target.value))}/>
            </label>{currency === "USD" && <label>
                <span>{he ? "שווי מיוחס בש״ח" : "Attributed ILS value"}</span>
                <input type="number" min="0" step="any" value={flowIls || ils} onChange={e => setFlowIls(Number(e.target.value))}/>
                </label>}<label>
            <span>{he ? "מועד מעבר הכסף" : "When the money crossed the boundary"}</span>
            <input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)}/>
            </label>
            <label className="wide">
            <span>{he ? "הערה (אופציונלי)" : "Note (optional)"}</span>
            <input value={note} onChange={e => setNote(e.target.value)}/>
            </label>
            </div>}{internal && destination && <div className="form-grid transfer-pair">
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
            </div>}</>}</div>{error && <p className="form-error">{error}</p>}<div className="form-actions">{account && <button className="danger-action" disabled={busy} onClick={() => void archive()}>
        <Archive size={16}/>{he ? "העברה לארכיון" : "Archive account"}</button>}<button className="primary sheet-save" aria-describedby={!classificationReady ? "account-cash-classification-help" : undefined} disabled={busy || !name.trim() || !feeValid || !classificationReady || (changed && external && (!amount || !ils)) || (changed && internal && !transferReady)} onClick={() => void submit()}>{busy ? (he ? "שומר…" : "Saving…") : (he ? "שמירת החשבון" : "Save account")}</button>
    </div>
    </section>
    </div>;
}
function AssetEditor({ t, asset, defaultAccountId, accounts, close, saved, dataCheckFocus }: {
    t: typeof copy.en;
    asset: Holding | null;
    defaultAccountId: number;
    accounts: Account[];
    close: () => void;
    saved: () => Promise<void>;
    dataCheckFocus: HoldingDataCheckIssueType | null;
}) {
    const he = t.language === "English";
    const initialType = asset?.instrumentKind === "deposit" ? "deposit" : normalizeAssetType(asset?.type ?? "etf");
    const legacyManualDeposit = Boolean(asset?.instrumentKind === "deposit" && asset.status === "manual" && !asset.deposit);
    const [form, setForm] = useState({ accountId: asset?.accountId ?? defaultAccountId, symbol: asset?.symbol ?? "", name: asset?.name ?? "", displayAlias: asset?.displayAlias ?? "", assetType: initialType, currency: asset?.currency ?? "USD", quantity: asset?.qty ?? 0, averagePrice: asset?.avg ?? 0, currentPrice: asset?.price ?? 0, liquidity: asset?.access ?? (["pension", "deposit"].includes(initialType) ? "locked" : "invested"), geography: asset?.geography ?? "unspecified", sector: asset?.sector ?? "unspecified" });
    const [deposit, setDeposit] = useState({ principal: asset?.deposit?.principal ?? 0, startDate: asset?.deposit?.startDate ?? "", maturityDate: asset?.deposit?.maturityDate ?? "", annualInterestRate: asset?.deposit?.annualInterestRate ?? 0, interestMethod: asset?.deposit?.interestMethod ?? "simple" as "simple" | "compound", compoundingFrequency: asset?.deposit?.compoundingFrequency ?? "annual" as "annual" | "monthly" | "daily", exitPoints: asset?.deposit?.exitPoints ?? [] as string[], note: asset?.deposit?.note ?? "" });
    const [depositMode, setDepositMode] = useState<"manual" | "structured">(legacyManualDeposit ? "manual" : "structured");
    const [costMode, setCostMode] = useState<"average" | "total">("average");
    const [totalCost, setTotalCost] = useState((asset?.qty ?? 0) * (asset?.avg ?? 0));
    const [priceUnit, setPriceUnit] = useState<"currency" | "agorot">("currency");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const existingProvider = asset?.instrumentProvider === "keren44" ? "keren44" : asset?.instrumentProvider === "tase" ? "tase" : "yahoo";
    const [manualPrice, setManualPrice] = useState(asset ? asset.status !== "auto" : false);
    const [instrument, setInstrument] = useState<InstrumentMatch | null>((asset?.status === "auto" && asset.providerInstrumentId && asset.quoteProviderInstrumentId) || (asset?.instrumentProvider === "tase" && asset.providerInstrumentId) ? { provider: existingProvider, providerInstrumentId: asset.providerInstrumentId!, quoteProvider: asset.quoteProvider === "keren44" ? "keren44" : "yahoo", quoteProviderInstrumentId: asset.quoteProviderInstrumentId ?? "", symbol: asset.symbol, name: asset.name, exchange: asset.instrumentExchange ?? (existingProvider === "keren44" ? "קרן נאמנות ישראלית" : existingProvider === "tase" ? "Tel Aviv Stock Exchange" : "US"), exchangeCode: existingProvider === "keren44" ? "TASE_FUND" : existingProvider === "tase" ? "TLV" : asset.instrumentMarket === "GB" ? "LSE" : "US", mic: asset.instrumentMic ?? "", isin: asset.instrumentIsin ?? null, assetClass: initialType === "stock" ? "stock" : initialType === "money_market" ? "money_market" : initialType === "index_fund" ? "index_fund" : "etf", currency: existingProvider === "yahoo" ? "USD" : "ILS", market: existingProvider === "yahoo" ? (asset.instrumentMarket === "GB" ? "GB" : "US") : "IL" } : null);
    const [matches, setMatches] = useState<InstrumentMatch[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchAttempted, setSearchAttempted] = useState(false);
    const [searchError, setSearchError] = useState("");
    const marketLike = ["stock", "etf", "index_fund", "money_market", "bond", "bond_fund", "crypto"].includes(form.assetType);
    const needsSymbol = marketLike;
    const divisor = priceUnit === "agorot" ? 100 : 1;
    const normalizedPrice = form.currentPrice / divisor;
    const normalizedAverage = costMode === "total" ? (form.quantity ? totalCost / form.quantity : 0) : form.averagePrice / divisor;
    const previewValue = (marketLike ? form.quantity : 1) * normalizedPrice;
    const automaticEligible = (form.currency === "USD" && ["stock", "etf"].includes(form.assetType)) || (form.currency === "ILS" && ["stock", "etf", "index_fund", "money_market"].includes(form.assetType));
    const structuredDeposit = form.assetType === "deposit" && depositMode === "structured";
    const depositTerms = { principal: deposit.principal, currency: form.currency, startDate: deposit.startDate, maturityDate: deposit.maturityDate, annualInterestRate: deposit.annualInterestRate, interestMethod: deposit.interestMethod, compoundingFrequency: deposit.interestMethod === "compound" ? deposit.compoundingFrequency : null };
    const depositIssues = structuredDeposit ? fixedDepositValidationIssues(depositTerms, deposit.exitPoints) : [];
    const structuredDepositInvalid = depositIssues.length > 0;
    const hasDepositIssue = (...issues: FixedDepositValidationIssue[]) => issues.some(issue => depositIssues.includes(issue));
    const depositErrorText = (issue: FixedDepositValidationIssue) => ({
        principal_required: he ? "יש להזין סכום גדול מאפס." : "Enter an amount greater than zero.",
        start_date_required: he ? "יש לבחור תאריך התחלה תקין." : "Choose a valid start date.",
        maturity_date_required: he ? "יש לבחור תאריך פדיון תקין." : "Choose a valid maturity date.",
        maturity_after_start: he ? "תאריך הפדיון חייב להיות אחרי תאריך ההתחלה." : "Maturity must be after the start date.",
        interest_rate_invalid: he ? "הריבית השנתית אינה יכולה להיות שלילית." : "Annual interest cannot be negative.",
        interest_method_invalid: he ? "יש לבחור שיטת ריבית תקינה." : "Choose a valid interest method.",
        compounding_frequency_required: he ? "בדריבית יש לבחור תדירות צבירה." : "Choose a compounding frequency for compound interest.",
        exit_point_invalid: he ? "כל נקודת יציאה חייבת להיות אחרי ההתחלה ועד תאריך הפדיון." : "Every exit point must be after the start date and no later than maturity.",
    })[issue];
    const set = (key: string, value: string | number) => setForm(old => ({ ...old, [key]: value }));
    const toggleLegacyDepositMode = () => {
        if (depositMode === "manual") {
            setDeposit(old => ({ ...old, principal: form.currentPrice }));
            setDepositMode("structured");
            return;
        }
        setDepositMode("manual");
    };
    const chooseType = (next: AssetType) => { setInstrument(null); setMatches([]); setSearchAttempted(false); setSearchError(""); setForm(old => ({ ...old, assetType: next, liquidity: next === "money_market" ? "near" : next === "cash" ? "available" : ["deposit", "pension"].includes(next) ? "locked" : old.liquidity, currency: next === "crypto" ? "USD" : old.currency })); };
    const changeUnit = (unit: "currency" | "agorot") => {
        if (unit === priceUnit)
            return;
        const factor = unit === "agorot" ? 100 : .01;
        setForm(old => ({ ...old, averagePrice: old.averagePrice * factor, currentPrice: old.currentPrice * factor }));
        setPriceUnit(unit);
    };
    const changeCurrency = (currency: "ILS" | "USD") => {
        setInstrument(null);
        setMatches([]);
        setSearchAttempted(false);
        setSearchError("");
        set("currency", currency);
        if (currency !== "ILS")
            changeUnit("currency");
    };
    useEffect(() => {
        if (!automaticEligible || manualPrice || instrument || form.symbol.trim().length < 1)
            return;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setSearching(true);
            setSearchError("");
            try {
                const response = await fetch(`/api/instruments/search?q=${encodeURIComponent(form.symbol)}`, { signal: controller.signal });
                const data = await response.json();
                if (!response.ok)
                    throw new Error(data.error ?? "Search unavailable");
                setMatches(data.results ?? []);
                setSearchAttempted(true);
            }
            catch (e) {
                if (!controller.signal.aborted) {
                    setMatches([]);
                    setSearchAttempted(true);
                    setSearchError(e instanceof Error ? e.message : "Search unavailable");
                }
            }
            finally {
                if (!controller.signal.aborted)
                    setSearching(false);
            }
        }, 350);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [form.symbol, automaticEligible, manualPrice, instrument]);
    useEffect(() => {
        if (!dataCheckFocus)
            return;
        const sheet = document.querySelector<HTMLElement>(`.asset-editor-sheet[data-data-check-focus="${dataCheckFocus}"]`);
        if (dataCheckFocus === "missing-classification")
            sheet?.querySelector("details.advanced-fields")?.setAttribute("open", "");
        const target = dataCheckFocus === "missing-cost-basis" ? sheet?.querySelector<HTMLInputElement>(".cost-basis-block input") : dataCheckFocus === "missing-value" || dataCheckFocus === "stale-manual-price" ? sheet?.querySelector<HTMLInputElement>(".form-grid > label:last-child input") : null;
        target?.focus();
    }, [dataCheckFocus]);
    const selectInstrument = (match: InstrumentMatch) => { setInstrument(match); setMatches([]); setSearchAttempted(false); setManualPrice(match.provider === "tase" && !match.quoteProviderInstrumentId); setPriceUnit("currency"); setForm(old => ({ ...old, symbol: match.symbol, name: match.name, assetType: match.assetClass, currency: match.currency, liquidity: match.assetClass === "money_market" ? "near" : old.liquidity })); };
    const submit = async () => {
        if (structuredDepositInvalid) {
            setError(he ? "יש לתקן את פרטי הפיקדון המסומנים לפני השמירה." : "Fix the marked deposit terms before saving.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const specialized = ["deposit", "pension"].includes(form.assetType);
            const response = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save_asset", id: asset?.id, ...form, quantity: specialized ? 1 : form.quantity, averagePrice: structuredDeposit ? deposit.principal : form.averagePrice, currentPrice: structuredDeposit ? deposit.principal : form.currentPrice, costMode, totalCost, priceUnit, reviewManualPrice: dataCheckFocus === "stale-manual-price", ...(structuredDeposit ? { deposit: { ...deposit, compoundingFrequency: deposit.interestMethod === "compound" ? deposit.compoundingFrequency : undefined } } : {}), ...instrumentSaveFields(instrument, manualPrice) }) });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error ?? "Save failed");
            await saved();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
            setBusy(false);
        }
    };
    const archive = async () => {
        if (!asset || !window.confirm(he ? "להעביר את הנכס לארכיון? ניתן לשחזר אחר כך." : "Archive this asset? You can restore it later."))
            return;
        setBusy(true);
        const response = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archive_asset", id: asset.id }) });
        if (response.ok)
            await saved();
        else {
            setError(he ? "לא הצלחנו להעביר את הנכס לארכיון." : "Could not archive the asset.");
            setBusy(false);
        }
    };
    const numberProps = { type: "number", min: "0", step: "any", onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select() } as const;
    const missingClassification = asset ? missingClassificationDimensions(asset) : { geography: false, sector: false };
    return <div className="modal-backdrop">
    <section className="choice-sheet form-sheet asset-editor-sheet" data-data-check-focus={dataCheckFocus ?? undefined} data-missing-geography={missingClassification.geography || undefined} data-missing-sector={missingClassification.sector || undefined}>
    <div className="sheet-handle"/>
    <header>
    <button className="back-sheet" onClick={close} aria-label={he ? "חזרה" : "Back"}>
    <ChevronRight size={21}/>
    </button>
    <div>
    <span>{dataCheckFocus ? (he ? "בדיקת נתונים" : "Data check") : accounts.find(a => a.id === form.accountId)?.name}</span>
    <h2>{asset ? (he ? "עריכת נכס" : "Edit asset") : (he ? "הוספת נכס" : "Add asset")}</h2>
    </div>
    <button onClick={close} aria-label={t.cancel}>
    <X size={20}/>
    </button>
    </header>
    <div className="sheet-form">
    <div className="form-grid">
    <label>
    <span>{he ? "חשבון" : "Account"}</span>
    <select value={form.accountId} onChange={e => set("accountId", Number(e.target.value))}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    </label>
    <label>
    <span>{he ? "סוג הנכס" : "Asset type"}</span>
    <select value={form.assetType} disabled={asset?.instrumentKind === "deposit"} onChange={e => chooseType(e.target.value as AssetType)}>{assetTypes.map(type => <option key={type} value={type}>{assetTypeLabel(he, type)}</option>)}</select>
    </label>
    {automaticEligible && <div className="market-mode wide">
        <div>
        <strong>{form.currency === "ILS" ? (he ? "מחיר ישראלי יומי אוטומטי" : "Automatic daily Israeli price") : (he ? "מחיר סגירה אוטומטי" : "Automatic closing price")}</strong>
        <small>{form.currency === "ILS" ? (he ? "נתמכים קרנות Keren44 וכן מניות וקרנות סל מנייתיות בת״א עם תמחור Yahoo." : "Supports Keren44 funds plus TASE shares and equity ETFs valued through Yahoo.") : (he ? "נתמך כעת בארה״ב ובניירות דולריים בבורסת לונדון." : "Currently supports US instruments and USD listings on the London Stock Exchange.")}</small>
        </div>{(!instrument || instrument.quoteProviderInstrumentId) && <button type="button" className="text-btn" onClick={() => {
                    setManualPrice(v => !v);
                    if (instrument?.provider !== "tase")
                        setInstrument(null);
                    setMatches([]);
                    setSearchAttempted(false);
                    setSearchError("");
                }}>{manualPrice ? (he ? "שימוש במחיר אוטומטי" : "Use automatic price") : (he ? "הזנה ידנית" : "Enter manually")}</button>}</div>}
    {needsSymbol && <label className={automaticEligible && !manualPrice ? "wide instrument-search" : ""}>
        <span>{form.assetType === "crypto" ? (he ? "סימול המטבע" : "Crypto symbol") : (automaticEligible && !manualPrice ? (form.currency === "ILS" ? (he ? "חיפוש נייר או קרן ישראליים" : "Search Israeli security or fund") : (he ? "חיפוש מניה או ETF" : "Search stock or ETF")) : (he ? "סימול / מספר נייר" : "Symbol / security no."))}</span>
        <input value={form.symbol} onChange={e => { setInstrument(null); setSearchAttempted(false); setSearchError(""); set("symbol", e.target.value); }} placeholder={form.assetType === "crypto" ? "BTC" : form.currency === "ILS" ? "BEZQ, 230011 או 5137740" : "VTI, VWRA או FWRA"} autoComplete="off"/>{searching && <small>{he ? "מחפש…" : "Searching…"}</small>}{instrument && <div className="instrument-selected">
            <ShieldCheck size={16}/>
            <span>
            <strong>{instrument.symbol}</strong> · {instrument.name}</span>
            <small>{instrument.exchange} · {instrument.mic} · {instrument.currency}{instrument.isin ? ` · ${instrument.isin}` : ""}{(manualPrice || !instrument.quoteProviderInstrumentId) ? ` · ${he ? "מחיר ידני" : "Manual price"}` : ""}</small>
            <button type="button" onClick={() => setInstrument(null)} aria-label={he ? "ניקוי בחירת הנייר" : "Clear selected instrument"}>
            <X size={15}/>
            </button>
            </div>}{matches.length > 0 && <div className="instrument-results">{matches.map(match => <button type="button" key={`${match.provider}-${match.providerInstrumentId}`} onClick={() => selectInstrument(match)}>
                <span>
                <strong>{match.symbol}</strong>{match.name}</span>
                <small>{match.exchange} · {assetTypeLabel(he, match.assetClass)} · {match.quoteProviderInstrumentId ? match.currency : (he ? "מחיר ידני" : "Manual price")}</small>
                </button>)}</div>}{!searching && searchAttempted && !matches.length && !searchError && <div className="instrument-empty">
            <strong>{he ? "לא נמצא נייר נתמך" : "No supported instrument found"}</strong>
            <small>{form.currency === "ILS" ? (he ? "נסו מספר נייר, סימול, ISIN או שם. נייר שאינו נתמך ב־Yahoo יכול להישמר במחיר ידני." : "Try a security number, symbol, ISIN, or name. A security not covered by Yahoo can use manual pricing.") : (he ? "נסה סימול מלא כמו VWRA.L. כרגע נתמכים ארה״ב וניירות דולריים בבורסת לונדון." : "Try a full symbol such as VWRA.L. US instruments and USD London listings are currently supported.")}</small>
            </div>}{searchError && <div className="instrument-empty error">
            <strong>{he ? "החיפוש לא זמין כרגע" : "Search is temporarily unavailable"}</strong>
            <small>{he ? "אפשר לנסות שוב או לעבור למחיר ידני. הנתונים הקיימים לא נפגעו." : "Try again or use manual pricing. Existing data was not changed."}</small>
            </div>}</label>}
    <label>
    <span>{he ? "שם הנכס" : "Asset name"}</span>
    <input value={form.name} readOnly={Boolean(instrument && !manualPrice)} onChange={e => set("name", e.target.value)}/>
    </label>
    <label>
    <span>{he ? "שם תצוגה אישי (אופציונלי)" : "Personal display name (optional)"}</span>
    <input value={form.displayAlias} maxLength={holdingAliasMaxLength} onChange={e => set("displayAlias", e.target.value)} aria-describedby="holding-alias-help"/>
    <small id="holding-alias-help" className="field-help">{he ? "לתצוגה בלבד — זיהוי הנכס והתמחור אינם משתנים." : "Display only — asset identity and pricing stay unchanged."}</small>
    </label>
    <label>
    <span>{he ? "מטבע" : "Currency"}</span>
    <select value={form.currency} onChange={e => changeCurrency(e.target.value as "ILS" | "USD")}>
    <option>USD</option>
    <option>ILS</option>
    </select>
    </label>
    {form.assetType === "deposit" && legacyManualDeposit && <div className="market-mode wide legacy-deposit-conversion">
        <div>
        <strong>{depositMode === "manual" ? (he ? "יתרת פיקדון ידנית ותיקה" : "Legacy manual deposit balance") : (he ? "המרה לפיקדון בריבית קבועה" : "Converting to a fixed-rate deposit")}</strong>
        <small>{depositMode === "manual" ? (he ? "היתרה נשארת ידנית עד שתבחר להמיר ולהזין תנאים מלאים." : "This balance stays manual unless you explicitly convert it and enter complete terms.") : (he ? "הסכום הועתק מהיתרה הידנית. עכשיו יש להזין את שאר תנאי הפיקדון לפני השמירה." : "The amount was carried over from the manual balance. Now enter the remaining deposit terms before saving.")}</small>
        {depositMode === "structured" && <label className="conversion-amount">
            <span>{he ? "סכום" : "Amount"}</span>
            <input {...numberProps} value={deposit.principal || ""} aria-invalid={hasDepositIssue("principal_required")} aria-describedby={hasDepositIssue("principal_required") ? "deposit-principal-error" : undefined} onChange={e => setDeposit(old => ({ ...old, principal: Number(e.target.value) }))}/>
            {hasDepositIssue("principal_required") && <small id="deposit-principal-error" className="field-error">{depositErrorText("principal_required")}</small>}
        </label>}
        </div>
        <button type="button" className="text-btn" onClick={toggleLegacyDepositMode}>{depositMode === "manual" ? (he ? "המרה לפיקדון מובנה" : "Convert to fixed-rate") : (he ? "השארת יתרה ידנית" : "Keep manual balance")}</button>
        </div>}
    {form.assetType === "deposit" && depositMode === "manual" && <label>
        <span>{he ? "יתרה נוכחית" : "Current balance"}</span>
        <input {...numberProps} value={form.currentPrice || ""} placeholder="0" onChange={e => set("currentPrice", Number(e.target.value))}/>
        </label>}
    {form.assetType === "deposit" && depositMode === "structured" && <>
        {!legacyManualDeposit && <label>
        <span>{he ? "סכום" : "Amount"}</span>
        <input {...numberProps} value={deposit.principal || ""} aria-invalid={hasDepositIssue("principal_required")} aria-describedby={hasDepositIssue("principal_required") ? "deposit-principal-error" : undefined} onChange={e => setDeposit(old => ({ ...old, principal: Number(e.target.value) }))}/>
        {hasDepositIssue("principal_required") && <small id="deposit-principal-error" className="field-error">{depositErrorText("principal_required")}</small>}
        </label>}
        <label>
        <span>{he ? "תאריך התחלה" : "Start date"}</span>
        <input type="date" value={deposit.startDate} aria-invalid={hasDepositIssue("start_date_required")} aria-describedby={hasDepositIssue("start_date_required") ? "deposit-start-error" : undefined} onChange={e => setDeposit(old => ({ ...old, startDate: e.target.value }))}/>
        {hasDepositIssue("start_date_required") && <small id="deposit-start-error" className="field-error">{depositErrorText("start_date_required")}</small>}
        </label>
        <label>
        <span>{he ? "תאריך פדיון" : "Maturity date"}</span>
        <input type="date" value={deposit.maturityDate} aria-invalid={hasDepositIssue("maturity_date_required", "maturity_after_start")} aria-describedby={hasDepositIssue("maturity_date_required", "maturity_after_start") ? "deposit-maturity-error" : undefined} onChange={e => setDeposit(old => ({ ...old, maturityDate: e.target.value }))}/>
        {hasDepositIssue("maturity_date_required", "maturity_after_start") && <small id="deposit-maturity-error" className="field-error">{depositErrorText(hasDepositIssue("maturity_date_required") ? "maturity_date_required" : "maturity_after_start")}</small>}
        </label>
        <label>
        <span>{he ? "ריבית שנתית (%)" : "Annual interest (%)"}</span>
        <input {...numberProps} value={deposit.annualInterestRate} aria-invalid={hasDepositIssue("interest_rate_invalid")} aria-describedby={hasDepositIssue("interest_rate_invalid") ? "deposit-interest-error" : undefined} onChange={e => setDeposit(old => ({ ...old, annualInterestRate: Number(e.target.value) }))}/>
        {hasDepositIssue("interest_rate_invalid") && <small id="deposit-interest-error" className="field-error">{depositErrorText("interest_rate_invalid")}</small>}
        </label>
        <label>
        <span>{he ? "שיטת ריבית" : "Interest method"}</span>
        <select value={deposit.interestMethod} onChange={e => setDeposit(old => ({ ...old, interestMethod: e.target.value as "simple" | "compound" }))}>
        <option value="simple">{he ? "פשוטה" : "Simple"}</option>
        <option value="compound">{he ? "דריבית" : "Compound"}</option>
        </select>
        </label>{deposit.interestMethod === "compound" && <label>
            <span>{he ? "תדירות צבירה" : "Compounding frequency"}</span>
            <select value={deposit.compoundingFrequency} onChange={e => setDeposit(old => ({ ...old, compoundingFrequency: e.target.value as "annual" | "monthly" | "daily" }))}>
            <option value="annual">{he ? "שנתית" : "Annual"}</option>
            <option value="monthly">{he ? "חודשית" : "Monthly"}</option>
            <option value="daily">{he ? "יומית" : "Daily"}</option>
            </select>
            {hasDepositIssue("compounding_frequency_required") && <small className="field-error">{depositErrorText("compounding_frequency_required")}</small>}
            </label>}<div className="wide">
        <span>{he ? "נקודות יציאה (אופציונלי)" : "Exit points (optional)"}</span>{deposit.exitPoints.map((point, index) => <div className="money-input" key={index}>
            <input type="date" value={point} aria-invalid={hasDepositIssue("exit_point_invalid")} aria-describedby={hasDepositIssue("exit_point_invalid") ? "deposit-exit-error" : undefined} onChange={e => setDeposit(old => ({ ...old, exitPoints: old.exitPoints.map((value, i) => i === index ? e.target.value : value) }))}/>
            <button type="button" className="text-btn" onClick={() => setDeposit(old => ({ ...old, exitPoints: old.exitPoints.filter((_, i) => i !== index) }))}>{he ? "הסרה" : "Remove"}</button>
        </div>)}<button type="button" className="text-btn" onClick={() => setDeposit(old => ({ ...old, exitPoints: [...old.exitPoints, ""] }))}>
        <Plus size={14}/>{he ? "הוספת נקודת יציאה" : "Add exit point"}</button>
        {hasDepositIssue("exit_point_invalid") && <small id="deposit-exit-error" className="field-error">{depositErrorText("exit_point_invalid")}</small>}
        </div>
        <label className="wide">
        <span>{he ? "הערה (אופציונלי)" : "Note (optional)"}</span>
        <input value={deposit.note} onChange={e => setDeposit(old => ({ ...old, note: e.target.value }))}/>
        </label>
        <small className="field-help wide">{he ? "השווי נצבר אוטומטית לפי ACT/365. אין להשאיר את הקרן גם ביתרת המזומן של החשבון." : "Value accrues automatically using ACT/365. Do not also leave the principal in account cash."}</small>
        </>}
    {["deposit", "pension"].includes(form.assetType) && <label>
        <span>{t.accessibility}</span>
        <select value={form.liquidity} onChange={e => set("liquidity", e.target.value)}>{(["available", "near", "invested", "locked"] as Access[]).map(a => <option key={a} value={a}>{accessLabel(t, a)}</option>)}</select>
        </label>}
    {marketLike && <>
        <label>
        <span>{t.qty}</span>
        <input {...numberProps} value={form.quantity || ""} placeholder="0" onChange={e => set("quantity", Number(e.target.value))}/>
        </label>{form.currency === "ILS" && <label>
            <span>{he ? "יחידת מחיר" : "Price unit"}</span>
            <select value={priceUnit} onChange={e => changeUnit(e.target.value as "currency" | "agorot")}>
            <option value="currency">{he ? "שקלים (₪)" : "Shekels (₪)"}</option>
            <option value="agorot">{he ? "אגורות (אג׳)" : "Agorot (ag.)"}</option>
            </select>
            </label>}<div className="cost-basis-block wide">
        <span>{he ? "איך העלות מופיעה אצל הברוקר?" : "How does your broker show cost?"}</span>
        <div className="cost-mode">
        <button type="button" className={costMode === "average" ? "active" : ""} onClick={() => setCostMode("average")}>{he ? "מחיר קנייה ממוצע" : "Average buying price"}</button>
        <button type="button" className={costMode === "total" ? "active" : ""} onClick={() => setCostMode("total")}>{he ? "עלות כוללת" : "Total cost"}</button>
        </div>{costMode === "average" ? <label>
            <span>{t.avgPrice} ({priceUnit === "agorot" ? (he ? "אגורות" : "agorot") : form.currency})</span>
            <input {...numberProps} value={form.averagePrice || ""} placeholder="0" onChange={e => set("averagePrice", Number(e.target.value))}/>
            </label> : <label>
            <span>{he ? "עלות כוללת" : "Total cost"} ({form.currency})</span>
            <input {...numberProps} value={totalCost || ""} placeholder="0" onChange={e => setTotalCost(Number(e.target.value))}/>
            <small>{he ? `מחיר ממוצע מחושב: ${normalizedAverage.toFixed(4)} ${form.currency}` : `Calculated average: ${normalizedAverage.toFixed(4)} ${form.currency}`}</small>
            </label>}</div>
        </>}
    {form.assetType !== "deposit" && (!automaticEligible || manualPrice) && <label>
        <span>{form.assetType === "pension" ? (he ? "יתרה נוכחית" : "Current balance") : marketLike ? t.current : (he ? "שווי נוכחי" : "Current value")} {marketLike && `(${priceUnit === "agorot" ? (he ? "אגורות" : "agorot") : form.currency})`}</span>
        <input {...numberProps} value={form.currentPrice || ""} placeholder="0" onChange={e => set("currentPrice", Number(e.target.value))}/>
        </label>}
    </div>
    {structuredDepositInvalid && <p id="deposit-validation-summary" className="deposit-validation-summary" role="status">{he ? "יש להשלים או לתקן את השדות המסומנים לפני השמירה." : "Complete or correct the marked fields before saving."}</p>}
    {form.assetType === "deposit" && <div className="asset-preview"><div><span>{he ? "מקור שווי" : "Value source"}</span><strong>{depositMode === "manual" ? (he ? "יתרה ידנית" : "Manual balance") : (he ? "מחושב אוטומטית" : "Calculated automatically")}</strong></div><small>{depositMode === "manual" ? (he ? "השווי נשמר בדיוק כיתרה שהוזנה, ללא תנאי פיקדון מומצאים." : "The entered balance is stored as-is; no deposit terms are fabricated.") : (he ? "ACT/365, מוגבל לתאריך הפדיון. השווי הכלכלי אינו בהכרח זמין למשיכה מיידית." : "ACT/365, capped at maturity. Economic value is not necessarily immediately redeemable.")}</small></div>}
    {form.assetType === "pension" && <div className="asset-preview"><div><span>{he ? "מקור שווי" : "Value source"}</span><strong>{he ? "יתרה ידנית" : "Manual balance"}</strong></div></div>}
    <details className="advanced-fields">
    <summary>{he ? "סיווג ונגישות (מתקדם)" : "Classification & accessibility (advanced)"}</summary>
    <div className="form-grid">
    <label>
    <span>{t.accessibility}</span>
    <select value={form.liquidity} onChange={e => set("liquidity", e.target.value)}>{(["available", "near", "invested", "locked"] as Access[]).map(a => <option key={a} value={a}>{accessLabel(t, a)}</option>)}</select>
    </label>{isExposureEligible({ instrumentKind: instrumentKindForType(form.assetType), assetType: form.assetType }) && <>
        <label>
        <span>{he ? "חשיפה גיאוגרפית משוערת" : "Approx. geographic exposure"}</span>
        <select value={form.geography} onChange={e => set("geography", e.target.value)}>
        {(!geographyOptions.includes(form.geography) ? [...geographyOptions, form.geography] : geographyOptions).map(key => <option key={key} value={key}>{exposureLabel(he, "geography", key)}</option>)}
        </select>
        </label>
        <label>
        <span>{he ? "חשיפה ענפית משוערת" : "Approx. sector exposure"}</span>
        <select value={form.sector} onChange={e => set("sector", e.target.value)}>
        {(!sectorOptions.includes(form.sector) ? [...sectorOptions, form.sector] : sectorOptions).map(key => <option key={key} value={key}>{exposureLabel(he, "sector", key)}</option>)}
        </select>
        </label>
        </>}</div>
    <small>{he ? "הסיווג הוא הערכה ידנית שלך ואינו משפיע על עדכון המחיר האוטומטי." : "Classification is your manual estimate and does not affect automatic price updates."}</small>
    </details>{form.assetType !== "deposit" && (form.currentPrice > 0 || instrument) && <div className="asset-preview">
        <div>
        <span>{he ? "מקור מחיר" : "Price source"}</span>
        <strong>{instrument && !manualPrice ? (he ? "סגירת מסחר אוטומטית" : "Automatic market close") : (he ? "ידני" : "Manual")}</strong>
        </div>{form.currentPrice > 0 && <div>
            <span>{he ? "שווי מחושב" : "Calculated value"}</span>
            <strong>{form.currency === "USD" ? usd(previewValue) : money(previewValue)}</strong>
            </div>}<small>{instrument && !manualPrice ? (he ? "המחיר ייקלט בעת השמירה ויישמר אם הרענון ייכשל." : "The close is fetched on save and retained if a later refresh fails.") : (he ? "המחיר מוזן ידנית" : "Manual price source")}</small>
        </div>}{error && <p className="form-error">{error}</p>}</div>
    <div className="form-actions">{asset && <button className="danger-action" disabled={busy} onClick={() => void archive()}>
        <Archive size={16}/>{he ? "העברה לארכיון" : "Archive asset"}</button>}<button className="primary sheet-save" aria-describedby={structuredDepositInvalid ? "deposit-validation-summary" : undefined} disabled={busy || !form.name.trim() || structuredDepositInvalid || (needsSymbol && !form.symbol.trim()) || (automaticEligible && !manualPrice && !instrument) || (marketLike && !form.quantity) || (marketLike && costMode === "total" && !totalCost)} onClick={() => void submit()}>{busy ? (he ? "שומר…" : "Saving…") : (asset ? (he ? "שמירת השינויים" : "Save changes") : (he ? "הוספת הנכס" : "Add asset"))}</button>
    </div>
    </section>
    </div>;
}
