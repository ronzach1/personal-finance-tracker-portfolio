import { useState } from "react";
import { Banknote, ChevronLeft, RefreshCw } from "lucide-react";
import { allocationPercentage, cashValueIls, currentInvestmentPl, holdingUnrealizedPl, previousJerusalemDaySnapshot } from "../../lib/finance";
import { dataCheckIssues, type DataCheckIssue } from "../../lib/data-check";
import { HoldingIdentity } from "./PortfolioView";
import { accessLabel, assetTypeLabel, assetTypes, compareExposureKeysWithUnclassifiedLast, copy, exposureLabel, largestAssets, dataCheckIssueLabel, exposureEligible, exposureProfile, investmentPlInput, money, signedMoney, signedPercentage, normalizeAssetType, supportsPriceChangeComparison, type Account, type Composition, type Holding, type Snapshot, type ValuationMeta, type View, type WealthFlowAttribution } from "./portfolio-ui";

export function Overview({ t, composition, setComposition, setView, holdings, accounts, snapshots, attribution, rate, valuationMeta, refreshPrices, refreshingPrices, onIssueAction }: { t: typeof copy.en; composition: Composition; setComposition:(v:Composition)=>void; setView:(v:View)=>void; holdings:Holding[]; accounts:Account[]; snapshots:Snapshot[]; attribution:WealthFlowAttribution|null; rate:number;valuationMeta:ValuationMeta;refreshPrices:()=>void;refreshingPrices:boolean;onIssueAction:(issue:DataCheckIssue)=>void }) {
  const [now]=useState(()=>Date.now());
  const cashTotal = accounts.reduce((sum,a)=>sum+cashValueIls(a,rate),0);
  const holdingsTotal = holdings.reduce((sum,h)=>sum+h.ils,0);
  const total = cashTotal + holdingsTotal;
  const investmentPl = currentInvestmentPl(holdings.map(investmentPlInput), rate);
  const { topHoldings, percentage: topAllocation } = largestAssets(holdings, total);
  const previousSnapshot=previousJerusalemDaySnapshot(snapshots);
  const delta=previousSnapshot?total-previousSnapshot.totalIls:null;
  const he=t.language==="English";
  const issues=dataCheckIssues(holdings,valuationMeta,now);
  const actionIssueCount=issues.filter(issue=>issue.priority==="urgent").reduce((sum,issue)=>sum+issue.count,0);
  const reviewIssueCount=issues.filter(issue=>issue.priority==="review").reduce((sum,issue)=>sum+issue.count,0);
  const closeDate=valuationMeta.latestPriceAsOf;
  const refreshTime=valuationMeta.lastRefreshAt;
  return <div className="content overview-layout">
    <section className="wealth-hero">
      <div className="wealth-title"><span>{t.total}</span><button className="overview-refresh" disabled={refreshingPrices} onClick={refreshPrices}><RefreshCw size={14} className={refreshingPrices?"spin":""}/>{refreshingPrices?(he?`מעדכן ${valuationMeta.automaticCount} מחירים ושער…`:`Refreshing ${valuationMeta.automaticCount} prices and FX…`):(he?"רענון שווי":"Refresh valuation")}</button></div>
      <div className="wealth-value"><strong>{money(total)}</strong></div>
      <div className="investment-pl">
        <details className="investment-help"><summary><span>{t.currentInvestmentPl}</span><span className="info-dot" aria-hidden="true">i</span></summary><p>{he?"רווח/הפסד לא ממומש על השקעות שמוחזקות כעת מול עלות הרכישה. החזקות ללא בסיס עלות ידוע אינן נכללות. עלות במטבע זר מומרת לפי שער המטבע הנוכחי. החישוב אינו משחזר השפעות מט״ח היסטוריות, רווחים ממומשים, דיבידנדים או עמלות, ואינו תשואה לאורך חיי התיק.":"Unrealized gain/loss on investments currently held versus purchase cost. Holdings without known cost basis are excluded. Foreign-currency purchase cost is translated at the current FX rate. Historical FX effects, realized gains, dividends and fees are not reconstructed. This is not lifetime portfolio return."}</p></details>
        {investmentPl.unrealizedPlIls!==null&&investmentPl.percentage!==null?<div className={`investment-pl-value ${investmentPl.unrealizedPlIls>=0?"up":"down"}`}><strong dir="ltr">{signedMoney(investmentPl.unrealizedPlIls)}</strong><span dir="ltr">{signedPercentage(investmentPl.percentage)}</span></div>:<p className="investment-pl-empty">{investmentPl.eligibleHoldingCount===0?(he?"אין כרגע השקעות שמתאימות להשוואה מול עלות.":"No current investments eligible for cost comparison."):(he?"לא זמין — נדרשים בסיס עלות ידוע ושווי נוכחי תקין.":"Unavailable — known cost basis and a valid current value are needed.")}</p>}
        {investmentPl.coverage==="partial"&&<small className="investment-pl-coverage">{investmentPl.eligibleValueIls!==null?(he?<>כיסוי חלקי · מבוסס על <bdi>{money(investmentPl.coveredValueIls)}</bdi> מתוך <bdi>{money(investmentPl.eligibleValueIls)}</bdi> בהחזקות מתאימות</>:<>Partial coverage · Based on <bdi>{money(investmentPl.coveredValueIls)}</bdi> of <bdi>{money(investmentPl.eligibleValueIls)}</bdi> eligible holdings</>):(he?`כיסוי חלקי · ${investmentPl.coveredHoldingCount} מתוך ${investmentPl.eligibleHoldingCount} החזקות מתאימות; שווי נוכחי חסר בחלקן`:`Partial coverage · ${investmentPl.coveredHoldingCount} of ${investmentPl.eligibleHoldingCount} eligible holdings; some current values are unavailable`)}</small>}
      </div>
      <div className="wealth-breakdown" aria-label={he?"פירוט ההון במעקב":"Tracked wealth breakdown"}>
        <div><span>{t.accountCash}</span><strong>{money(cashTotal)}</strong><b>{Math.round(allocationPercentage(cashTotal,total))}%</b></div>
        <div><span>{t.holdingsAssets}</span><strong>{money(holdingsTotal)}</strong><b>{Math.round(allocationPercentage(holdingsTotal,total))}%</b></div>
      </div>
      <div className="valuation-status"><div className="valuation-line"><span className={valuationMeta.staleCount||valuationMeta.failedCount?"status-warning":"status-ok"}>{valuationMeta.staleCount||valuationMeta.failedCount?(he?"מחירי ניירות דורשים בדיקה":"Market prices need review"):(he?"מחירי ניירות מעודכנים":"Market prices up to date")}</span><small>{closeDate?(he?`סגירת ${new Date(closeDate).toLocaleDateString("he-IL")}`:`Close ${new Date(closeDate).toLocaleDateString("en-US")}`):(he?"אין מחירים אוטומטיים":"No automatic prices")}</small></div><div className="valuation-line"><span className={valuationMeta.rateMode==="manual"?"fx-manual":valuationMeta.rateFailed||valuationMeta.rateStale?"status-warning":"status-ok"}>{valuationMeta.rateMode==="manual"?(he?"שער מטבע ידני":"Manual FX rate"):(he?"שער מטבע אוטומטי":"Automatic FX rate")}</span><small>{rate.toFixed(4)} ₪ / USD</small></div>{refreshTime&&<small className="last-refresh">{he?"נבדק לאחרונה":"Last checked"}: {new Date(refreshTime).toLocaleString(he?"he-IL":"en-US",{dateStyle:"short",timeStyle:"short"})}</small>}</div>
    </section>

    <section className="composition-card">
      <div className="section-head"><div><h2>{t.composition}</h2><p>{composition === "currency" ? t.quoteCurrency : composition==="geography"||composition==="sector"?(he?"חשיפה משוערת של נכסים הוניים; נכסים שאינם הוניים אינם נכללים":"Estimated equity exposure; non-equity assets are excluded"):`${money(total)} · 100%`}</p></div></div>
      <div className="segmented-tabs" aria-label={he ? "אופן הצגת הרכב ההון" : "Wealth composition view"}>{(["access","currency","geography","sector","account","asset"] as Composition[]).map((id) => <button key={id} aria-pressed={composition === id} className={composition === id ? "active" : ""} onClick={() => setComposition(id)}>{t[id]}</button>)}</div>
      <CompositionContent mode={composition} t={t} holdings={holdings} accounts={accounts} rate={rate}/>
    </section>

    <section className="quality-card"><div className="section-head"><div><h2>{he?"בדיקת נתונים":"Data check"}</h2><p>{issues.length===0?(he?"הכול מעודכן":"No issues found"):actionIssueCount>0?(he?`${actionIssueCount} דורשים פעולה · ${reviewIssueCount} לבדיקה`:`${actionIssueCount} need action · ${reviewIssueCount} to review`):(he?`${reviewIssueCount} פריטים לבדיקה`:`${reviewIssueCount} items to review`)}</p></div></div>{issues.length>0&&<div className="quality-list">{issues.map(issue=><button key={issue.type} className={`quality-action ${issue.priority}`} disabled={issue.action==="refresh-valuation"&&refreshingPrices} onClick={()=>onIssueAction(issue)}><b>{issue.count}</b><span>{dataCheckIssueLabel(issue.type,he)}</span><ChevronLeft size={16}/></button>)}</div>}</section>

    <section className="holdings-card">
      <div className="section-head"><div><h2>{t.largest}</h2><p>{topAllocation}% {t.allocation.toLowerCase()}</p></div><button className="text-btn" onClick={() => setView("portfolio")}>{t.allHoldings}<ChevronLeft size={16}/></button></div>
      <div className="compact-holdings">{topHoldings.map((h) => {const pl=holdingUnrealizedPl(investmentPlInput(h),rate);return <article key={h.id}><HoldingIdentity h={h}/><div className="compact-value"><strong>{money(h.ils)}</strong>{supportsPriceChangeComparison(h)&&<span className={pl?(pl.unrealizedPlIls>=0?"up":"down"):""}>{pl?<>{t.return} <bdi>{signedPercentage(pl.percentage)}</bdi></>:(he?"רווח/הפסד מול עלות לא זמין":"P/L vs cost unavailable")}</span>}</div><span className={`access-chip ${h.access}`}>{accessLabel(t,h.access)}</span></article>})}</div>
    </section>
    <section className="recent-wealth-change"><div className="section-head"><h2>{he?"שינוי אחרון בהון":"Recent wealth change"}</h2></div>
      <div className="wealth-delta">{delta===null?<span>{he?"שמרו את תמונת המצב של היום; ההשוואה תתחיל ביום מאוחר יותר.":"Save today’s snapshot; comparison can begin on a later day."}</span>:<><strong className={delta>=0?"up":"down"}>{delta>=0?"+":""}{money(delta)}</strong><span>{t.previous}</span></>}<span className="info-dot" title={delta===null?(he?"תמונת מצב מתעדת את ההון במעקב ברגע השמירה. היא אינה גיבוי ואינה רשימת עסקאות.":"A snapshot records tracked wealth at the saved moment. It is not a backup or a transaction list."):attribution?(he?"השינוי בהון פחות תזרימי הכסף החיצוניים שתועדו. השינוי שנותר כולל שוק, מט״ח, צבירה, תיקונים, נכסים חדשים ותנועות שלא תועדו — ואינו תשואת השקעה.":"Wealth change minus recorded external money flows. Remaining change includes market, FX, accrual, corrections, new assets, and unrecorded movements—it is not investment return."):(he?"הפירוט יוצג לאחר שתמונת ההשוואה תהיה מכוסה במלואה במעקב התזרים.":"The breakdown appears once the comparison snapshot is fully covered by flow tracking.")}>i</span></div>
      {previousSnapshot&&(attribution?<><div className="flow-attribution"><div><span>{he?"שינוי בהון":"Wealth change"}</span><strong>{attribution.wealthChange>=0?"+":""}{money(attribution.wealthChange)}</strong></div><div><span>{he?"כסף חיצוני נטו שתועד":"Recorded net external money"}</span><strong>{attribution.netExternalFlow>=0?"+":""}{money(attribution.netExternalFlow)}</strong></div><div><span>{he?"השינוי שנותר":"Remaining change"}</span><strong>{attribution.residualChange>=0?"+":""}{money(attribution.residualChange)}</strong></div></div><small className="flow-attribution-help">{he?"השינוי שנותר הוא השינוי בהון פחות תזרימי כסף חיצוניים שתועדו. הוא כולל שינויי שוק ומט״ח, צבירה, תיקונים, נכסים חדשים ותנועות שלא תועדו — ואינו תשואת השקעה.":"Remaining change is wealth change minus recorded external money flows. It includes market and FX moves, accrual, corrections, new assets, and unrecorded movements—it is not investment return."}</small></>:<div className="flow-baseline-note">{he?"מעקב התזרים רק התחיל. הפירוט יוצג כשההשוואה תתחיל מתמונה שנשמרה לאחר תחילת המעקב.":"Flow tracking has just begun. The breakdown will appear once the comparison starts from a snapshot saved after tracking began."}</div>)}
    </section>
  </div>;
}

function CompositionContent({ mode, t, holdings, accounts, rate }:{mode:Composition;t:typeof copy.en;holdings:Holding[];accounts:Account[];rate:number}) {
  const values = new Map<string,number>();
  const add=(key:string,value:number)=>values.set(key,(values.get(key)??0)+value);
  const cashByAccount = new Map(accounts.map(a=>[a.id,cashValueIls(a,rate)]));
  if(mode==="access") { ["available","near","invested","locked"].forEach(key=>add(key,0)); accounts.forEach(a=>add("available",cashByAccount.get(a.id)??0)); holdings.forEach(h=>add(h.access,h.ils)); }
  if(mode==="currency") { ["USD","ILS"].forEach(key=>add(key,0)); accounts.forEach(a=>add(a.cashCurrency,cashByAccount.get(a.id)??0)); holdings.forEach(h=>add(h.currency,h.ils)); }
  if(mode==="geography"||mode==="sector") holdings.filter(exposureEligible).forEach(h=>{const profile=exposureProfile(h)[mode];Object.entries(profile).forEach(([key,weight])=>add(key,h.ils*weight/100))});
  if(mode==="account") { accounts.forEach(a=>add(a.name,cashByAccount.get(a.id)??0)); holdings.forEach(h=>add(h.account,h.ils)); }
  if(mode==="asset") { accounts.forEach(a=>add("cash",cashByAccount.get(a.id)??0)); holdings.forEach(h=>add(normalizeAssetType(h.type),h.ils)); }
  const total=Array.from(values.values()).reduce((a,b)=>a+b,0);
  const he=t.language==="English";
  const labels:Record<string,string>={available:t.available,near:t.near,invested:t.invested,locked:t.locked};
  if(mode==="asset") assetTypes.forEach(type=>{labels[type]=type==="cash"?(he?"מזומן לא מושקע":"Uninvested cash"):assetTypeLabel(he,type)});
  const data=Array.from(values.entries()).sort((a,b)=>mode==="geography"||mode==="sector"?compareExposureKeysWithUnclassifiedLast(a[0],b[0],()=>b[1]-a[1]):b[1]-a[1]).map(([key,value],index)=>[mode==="geography"||mode==="sector"?exposureLabel(he,mode,key):labels[key]??key,Math.round(allocationPercentage(value,total)),money(value),`c${index%4+1}`]);
  const accessible=(values.get("available")??0)+(values.get("near")??0);
  return <div className="composition-body"><div className="stacked-bar" aria-label="Composition">{data.filter((x)=>Number(x[1])>0).map((x)=><span key={String(x[0])} className={String(x[3])} style={{width:`${x[1]}%`}}/>)}</div><div className="composition-list">{data.map((x)=><div key={String(x[0])}><i className={String(x[3])}/><span>{x[0]}</span><b>{x[1]}%</b><strong>{x[2]}</strong></div>)}</div>{mode === "access" && <div className="accessible-callout"><Banknote size={18}/><span>{t.accessible}</span><strong>{money(accessible)}</strong><b>{Math.round(allocationPercentage(accessible,total))}%</b></div>}</div>;
}
