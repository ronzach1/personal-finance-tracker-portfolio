import { useState } from "react";
import { CircleDollarSign, Landmark, ShieldCheck, TrendingUp } from "lucide-react";
import { firstRunAccountName, neutralFirstRunAccount } from "../../lib/first-run";
import { isValidAnnualManagementFeePercent } from "../../lib/account-management-fee";
import { copy, type Language } from "./portfolio-ui";
import { RestoreBackupControl } from "./RestoreBackupControl";

type FirstRunPath = "choice" | "new" | "restore";
type DraftAccount = { clientId: string; name: string; kind: "bank" | "broker" | "crypto_wallet" | "cash" | "pension" | "deposit" | "other"; cashBalance: number; cashCurrency: "ILS" | "USD" };

export function SetupWizard({ lang, setLang, complete }: { lang: Language; setLang: (lang: Language) => void; complete: () => Promise<void> }) {
  const he = lang === "he";
  const [path, setPath] = useState<FirstRunPath>("choice");
  const [account, setAccount] = useState<DraftAccount>(() => neutralFirstRunAccount(lang));
  const [feeInput, setFeeInput] = useState("");
  const [feeBadInput, setFeeBadInput] = useState(false);
  const showFee = account.kind === "broker" || feeInput !== "" || feeBadInput;
  const annualManagementFeePercent = feeInput.trim() === "" ? null : Number(feeInput);
  const feeValid = !feeBadInput && isValidAnnualManagementFeePercent(annualManagementFeePercent);
  const [rate, setRate] = useState(3.65);
  const [rateMode, setRateMode] = useState<"automatic" | "manual">("automatic");
  const [fxUnavailable, setFxUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changeLanguage = (next: Language) => {
    setAccount(current => {
      const defaultNames = [firstRunAccountName("he"), firstRunAccountName("en")];
      return defaultNames.includes(current.name) ? { ...current, name: firstRunAccountName(next) } : current;
    });
    setLang(next);
  };

  const save = async () => {
    if (!feeValid) return;
    if (!account.name.trim()) {
      setError(he ? "יש לתת לחשבון שם." : "Give the account a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "onboard", accounts: [{ ...account, ...(showFee ? { annualManagementFeePercent } : {}) }], holdings: [], usdIlsRateMode: rateMode, usdIlsRate: rateMode === "manual" ? rate : undefined, language: lang }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "fx_unavailable") setFxUnavailable(true);
        throw new Error(data.code === "fx_unavailable" ? (he ? "לא הצלחנו לקבל כרגע שער דולר–שקל אוטומטי." : "We could not fetch the automatic USD–ILS rate right now.") : data.error ?? "Save failed");
      }
      await complete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Save failed");
      setSaving(false);
    }
  };

  return <main className="setup-shell" dir={he ? "rtl" : "ltr"} lang={lang}>
    <header className="setup-top"><div className="setup-brand"><span className="brand-mark"><TrendingUp size={18}/></span><strong>{he ? "ההון שלי" : "My Wealth"}</strong></div><div className="language-toggle"><button aria-pressed={lang === "he"} className={lang === "he" ? "active" : ""} onClick={() => changeLanguage("he")}>עברית</button><button aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => changeLanguage("en")}>English</button></div></header>
    <section className={`setup-card first-run-card ${path === "choice" ? "decision" : ""}`}>
      {path === "choice" && <>
        <span className="setup-kicker">{he ? "ברוכים הבאים" : "WELCOME"}</span>
        <h1>{he ? "כל ההון שלך, בתמונה אחת" : "Your wealth, in one clear picture"}</h1>
        <p>{he ? "האפליקציה עוקבת אחר חשבונות ומזומן, השקעות ונכסים, פנסיה ופיקדונות — בלי להפוך לאפליקציית תקציב או להמציא נתונים." : "Track accounts and cash, investments and assets, pensions, and deposits—without turning this into a budgeting app or inventing financial data."}</p>
        <div className="first-run-paths">
          <button onClick={() => setPath("new")}><span><Landmark size={21}/></span><div><strong>{he ? "התחלת תיק חדש" : "Start a new portfolio"}</strong><small>{he ? "פותחים חשבון ראשון ניטרלי וממשיכים מיד לאפליקציה." : "Create one neutral first account, then continue straight into the app."}</small></div></button>
          <button onClick={() => setPath("restore")}><span><ShieldCheck size={21}/></span><div><strong>{he ? "שחזור מגיבוי קיים" : "Restore an existing backup"}</strong><small>{he ? "מחזירים חשבונות, נכסים, היסטוריה והגדרות מקובץ גיבוי." : "Bring back accounts, assets, history, and settings from a backup file."}</small></div></button>
        </div>
        <div className="first-run-note"><CircleDollarSign size={18}/><span>{he ? "אפשר להוסיף ולערוך חשבונות ונכסים בכל עת לאחר הכניסה." : "You can add or edit accounts and assets at any time after entering the app."}</span></div>
      </>}

      {path === "new" && <>
        <span className="setup-kicker">{he ? "תיק חדש" : "NEW PORTFOLIO"}</span>
        <h1>{he ? "יצירת חשבון ראשון" : "Create your first account"}</h1>
        <p>{he ? "חשבון הוא מקום שמרכז יתרת מזומן ונכסים. הוא יכול להיות בנק, ברוקר, ארנק או כל מסגרת אחרת — לא נדרש ספק מסוים. נכסים, פנסיה ופיקדונות מוסיפים מתוך האפליקציה." : "An account groups cash and assets. It can represent a bank, broker, wallet, or another place—no specific provider is required. Add investments, pensions, and deposits from inside the app."}</p>
        <div className="setup-account first-account">
          <label><span>{he ? "סוג חשבון" : "Account type"}</span><select value={account.kind} onChange={event => setAccount(current => ({ ...current, kind: event.target.value as DraftAccount["kind"] }))}><option value="other">{he ? "חשבון כללי" : "General account"}</option><option value="bank">{he ? "בנק" : "Bank"}</option><option value="broker">{he ? "ברוקר" : "Broker"}</option><option value="crypto_wallet">{he ? "ארנק קריפטו" : "Crypto wallet"}</option><option value="cash">{he ? "מזומן פיזי" : "Physical cash"}</option><option value="pension">{he ? "פנסיה" : "Pension"}</option><option value="deposit">{he ? "פיקדון עצמאי" : "Standalone deposit"}</option></select></label>
          <label><span>{he ? "שם החשבון" : "Account name"}</span><input value={account.name} onChange={event => setAccount(current => ({ ...current, name: event.target.value }))}/></label>
          <label><span>{he ? "יתרת מזומן התחלתית (אופציונלי)" : "Starting cash balance (optional)"}</span><div className="money-input"><input type="number" min="0" step="any" value={account.cashBalance || ""} placeholder="0" onFocus={event => event.currentTarget.select()} onChange={event => setAccount(current => ({ ...current, cashBalance: Number(event.target.value) }))}/><select value={account.cashCurrency} onChange={event => setAccount(current => ({ ...current, cashCurrency: event.target.value as "ILS" | "USD" }))}><option>ILS</option><option>USD</option></select></div></label>
        </div>
        <small className="account-cash-help standalone">{he ? "מזומן כאן הוא רק כסף שאינו כבר מוזן כנכס. אפשר להשאיר אפס ולהתחיל להוסיף נתונים באפליקציה." : "Cash here means money not already entered as an asset. Leave it at zero if you prefer to add data inside the app."}</small>
        {showFee && <label className="manual-rate">
          <span>{he ? "דמי ניהול שנתיים (%)" : "Annual management fee (%)"}</span>
          <input type="number" inputMode="decimal" min="0" max="100" step="any" value={feeInput} aria-invalid={!feeValid} aria-describedby="setup-fee-help" onInput={event => setFeeBadInput(event.currentTarget.validity.badInput)} onChange={event => setFeeInput(event.target.value)}/>
          <small id="setup-fee-help" className="field-help">{he ? "אופציונלי. אחוז משווי הנכסים בשנה. אם אין דמי ניהול, יש להזין 0. למידע בלבד; אינו מנוכה מההון במעקב." : "Optional. Percentage of assets per year. Enter 0 if this account has no management fee. Informational only; not deducted from tracked wealth."}</small>
          {!feeValid && <small className="field-help form-error" role="alert">{he ? "יש להזין אחוז בין 0 ל־100." : "Enter a percentage between 0 and 100."}</small>}
        </label>}
        {rateMode === "manual" && <label className="manual-rate"><span>{he ? "שער דולר–שקל ידני" : "Manual USD–ILS rate"}</span><input type="number" min="0.1" step="0.0001" value={rate} onChange={event => setRate(Number(event.target.value))}/></label>}
        {fxUnavailable && rateMode === "automatic" && <div className="privacy-note"><CircleDollarSign size={20}/><div><strong>{he ? "השער האוטומטי אינו זמין כרגע" : "Automatic FX is unavailable right now"}</strong><small>{he ? "אפשר לנסות שוב או להזין שער ידני זמני ולשנות אותו אחר כך בהגדרות." : "Retry, or enter a temporary manual rate and change it later in Settings."}</small><div className="backup-actions"><button className="secondary" disabled={saving} onClick={() => void save()}>{he ? "ניסיון נוסף" : "Retry"}</button><button className="secondary" disabled={saving} onClick={() => { setRateMode("manual"); setError(""); }}>{he ? "הזנת שער ידני" : "Enter manually"}</button></div></div></div>}
        {error && <p className="form-error">{error}</p>}
        <footer className="setup-actions"><button className="secondary" disabled={saving} onClick={() => { setPath("choice"); setError(""); }}>{he ? "חזרה" : "Back"}</button><button className="primary" disabled={saving || !feeValid} onClick={() => void save()}>{saving ? (he ? "יוצר את התיק…" : "Creating portfolio…") : (he ? "יצירת התיק וכניסה" : "Create portfolio and enter")}</button></footer>
      </>}

      {path === "restore" && <>
        <span className="setup-kicker">{he ? "שחזור" : "RESTORE"}</span>
        <h1>{he ? "שחזור תיק מגיבוי" : "Restore a portfolio backup"}</h1>
        <p>{he ? "בחרו קובץ גיבוי שנוצר באפליקציה. אותו מנגנון שחזור בטוח שמשמש בהגדרות יבדוק את הקובץ לפני החלפת נתונים." : "Choose a backup created by this app. The same safe restore used in Settings validates it before replacing any data."}</p>
        <RestoreBackupControl he={he} cancelLabel={copy[lang].cancel} replaceExisting={false} restored={complete}/>
        <footer className="setup-actions"><button className="secondary" onClick={() => setPath("choice")}>{he ? "חזרה" : "Back"}</button></footer>
      </>}
    </section>
  </main>;
}
