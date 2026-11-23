"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  History as HistoryIcon,
  Landmark,
  LayoutDashboard,
  LineChart,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { cashValueIls, holdingValueIls } from "../lib/finance";
import type { HoldingDataCheckIssueType } from "../lib/data-check";
import { Accounts, History } from "./components/AccountsHistory";
import { Overview } from "./components/Overview";
import { PortfolioManager } from "./components/PortfolioManager";
import {
  AccessSheet,
  DataCheckSheet,
  HoldingSheetV2,
  MaintenanceSheet,
  UpdateSheet,
} from "./components/PortfolioSheets";
import { Portfolio } from "./components/PortfolioView";
import { DataSettingsSheetV2 } from "./components/SettingsSheet";
import { SetupWizard } from "./components/SetupWizard";
import {
  copy,
  type Access,
  type Account,
  type Composition,
  type Holding,
  type Language,
  type Snapshot,
  type ValuationMeta,
  type View,
  type WealthFlow,
  type WealthFlowAttribution,
} from "./components/portfolio-ui";

const navIcons = {
  overview: LayoutDashboard,
  portfolio: LineChart,
  accounts: Landmark,
  history: HistoryIcon,
};

export default function Home() {
  const [lang, setLang] = useState<Language>("he");
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState(false);
  const [composition, setComposition] = useState<Composition>("access");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [wealthFlows, setWealthFlows] = useState<WealthFlow[]>([]);
  const [wealthFlowAttribution, setWealthFlowAttribution] = useState<WealthFlowAttribution|null>(null);
  const [usdIlsRate, setUsdIlsRate] = useState(3.65);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [accessTarget, setAccessTarget] = useState<Holding | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerAccountId, setManagerAccountId] = useState<number|null>(null);
  const [managerStart,setManagerStart]=useState<"new-account"|"new-asset"|number|null>(null);
  const [notice,setNotice]=useState("");
  const [refreshingPrices,setRefreshingPrices]=useState(false);
  const [valuationMeta,setValuationMeta]=useState<ValuationMeta>({latestPriceAsOf:null,lastRefreshAt:null,automaticCount:0,staleCount:0,failedCount:0,rateAsOf:null,rateMode:"automatic",rateSource:null,rateStale:true,rateFailed:false});
  const [editor, setEditor] = useState<"cash"|"holding"|"rate"|"flow"|null>(null);
  const [dataCheckOpen,setDataCheckOpen]=useState(false);
  const [dataCheckFocus,setDataCheckFocus]=useState<HoldingDataCheckIssueType|null>(null);
  const refreshPricesRef=useRef<(silent?:boolean)=>Promise<void>>(async()=>{});
  const t = copy[lang];
  const dir = lang === "he" ? "rtl" : "ltr";
  const notifySaved=()=>{setNotice(lang==="he"?"השינויים נשמרו":"Changes saved");window.setTimeout(()=>setNotice(""),2400)};

  const loadPortfolio=useCallback(async(allowAutomaticRefresh=true)=>{
    setLoading(true); setLoadError("");
    try {
      const response = await fetch("/api/portfolio", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Please open this private app while signed in." : "Could not load your portfolio.");
      const data = await response.json();
      const accountRows = data.accounts as Account[];
      const rate = data.settings?.usdIlsRate ?? 3.65;
      const byId = new Map(accountRows.map((account) => [account.id, account.name]));
      const instrumentById=new Map<number,{provider:string;providerInstrumentId:string;quoteProvider:string|null;quoteProviderInstrumentId:string|null;exchange:string|null;mic:string|null;isin:string|null;market:string|null}>((data.instruments??[]).map((row:{id:number;provider:string;providerInstrumentId:string;quoteProvider:string|null;quoteProviderInstrumentId:string|null;exchange:string|null;mic:string|null;isin:string|null;market:string|null})=>[row.id,row]));
      const quoteByInstrument=new Map<number,{priceAsOf:string;status:string}>((data.quotes??[]).map((row:{instrumentId:number;priceAsOf:string;status:string})=>[row.instrumentId,row]));
      const needsRefresh=Boolean(data.marketData?.needsRefresh);
      setAccounts(accountRows); setSnapshots(data.snapshots ?? []); setWealthFlows(data.wealthFlows ?? []); setWealthFlowAttribution(data.wealthFlowAttribution??null); setUsdIlsRate(rate);
      setValuationMeta({latestPriceAsOf:data.marketData?.latestPriceAsOf??null,lastRefreshAt:data.marketData?.lastRefreshAt??null,automaticCount:data.marketData?.automaticCount??0,staleCount:data.marketData?.staleCount??0,failedCount:data.marketData?.failedCount??0,rateAsOf:data.settings?.usdIlsRateAsOf??null,rateMode:data.settings?.usdIlsRateMode??"automatic",rateSource:data.settings?.usdIlsRateSource??null,rateStale:Boolean(data.marketData?.rateStale),rateFailed:Boolean(data.marketData?.rateFailed)});
      if (data.settings?.language) setLang(data.settings.language);
      setOnboarded(Boolean(data.settings?.onboardingComplete));
      const nextHoldings=(data.holdings ?? []).map((row: {id:number;accountId:number;instrumentId:number|null;symbol:string|null;name:string;displayAlias?:string|null;instrumentKind:"security"|"crypto"|"deposit"|"pension"|"other";assetType:string;geography:string;sector:string;attentionReason:string|null;costBasisIntentionallyUnknown?:boolean;geographyIntentionallyUnclassified?:boolean;sectorIntentionallyUnclassified?:boolean;manualPriceReviewedAt?:string|null;currency:"ILS"|"USD";quantity:number;averagePrice:number;currentPrice:number;priceMode:"automatic"|"manual"|"calculated";liquidity:Access;archivedAt:string|null;updatedAt:string;deposit?:Holding["deposit"]}) => {
        const native = row.quantity * row.currentPrice;
        const instrument=row.instrumentId?instrumentById.get(row.instrumentId):null; const quote=row.instrumentId?quoteByInstrument.get(row.instrumentId):null;
        const graceDays=(instrument?.quoteProvider??instrument?.provider)==="keren44"?7:5;const priceStale=row.priceMode==="automatic"&&(!quote?.priceAsOf||Date.now()-new Date(quote.priceAsOf).getTime()>graceDays*864e5);
        return { id:row.id, accountId:row.accountId, instrumentId:row.instrumentId??null, symbol:row.symbol??"", name:row.name, displayAlias:row.displayAlias??null, account:byId.get(row.accountId) ?? "", instrumentKind:row.instrumentKind??"security", type:row.assetType, geography:row.geography??"unspecified", sector:row.sector??"unspecified", attentionReason:row.attentionReason, costBasisIntentionallyUnknown:Boolean(row.costBasisIntentionallyUnknown), geographyIntentionallyUnclassified:Boolean(row.geographyIntentionallyUnclassified), sectorIntentionallyUnclassified:Boolean(row.sectorIntentionallyUnclassified), manualPriceReviewedAt:row.manualPriceReviewedAt??null, currency:row.currency, qty:row.quantity, avg:row.averagePrice, price:row.currentPrice, native, ils:holdingValueIls({quantity:row.quantity,currentPrice:row.currentPrice,currency:row.currency},rate), gain:row.averagePrice ? ((row.currentPrice/row.averagePrice)-1)*100 : 0, status:row.priceMode==="automatic"?"auto":row.priceMode==="calculated"?"calculated":"manual", access:row.liquidity, archivedAt:row.archivedAt??null, updatedAt:row.updatedAt, priceAsOf:quote?.priceAsOf??null, quoteStatus:quote?.status??null, priceStale, instrumentProvider:instrument?.provider??null, providerInstrumentId:instrument?.providerInstrumentId??null, quoteProvider:instrument?.quoteProvider??instrument?.provider??null, quoteProviderInstrumentId:instrument?.quoteProviderInstrumentId??instrument?.providerInstrumentId??null, instrumentExchange:instrument?.exchange??null, instrumentMic:instrument?.mic??null, instrumentIsin:instrument?.isin??null, instrumentMarket:instrument?.market??null, deposit:row.deposit };
      });
      setHoldings(nextHoldings);
      if(data.settings?.onboardingComplete&&allowAutomaticRefresh&&needsRefresh)void refreshPricesRef.current(true);
      return nextHoldings;
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Could not load your portfolio."); }
    finally { setLoading(false); }
  },[]);

  const refreshPrices=useCallback(async(silent=false)=>{setRefreshingPrices(true);try{const response=await fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"refresh_valuation"})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Refresh failed");await loadPortfolio(false);if(!silent){const issues=data.failed+(data.rateFailed?1:0);setNotice(issues?(lang==="he"?`הרענון הושלם חלקית: ${issues} מקורות שמרו את הערך הקודם`:`Refresh partially completed: ${issues} sources kept their previous value`):(lang==="he"?"השער, המחירים ותמונת המצב היומית עודכנו":"Rate, prices and today’s snapshot updated"));window.setTimeout(()=>setNotice(""),4200)}}catch{if(!silent){setNotice(lang==="he"?"לא הצלחנו לרענן; הערכים הקודמים נשמרו":"Refresh failed; previous values were kept");window.setTimeout(()=>setNotice(""),3200)}}finally{setRefreshingPrices(false)}},[lang,loadPortfolio]);

  useEffect(()=>{refreshPricesRef.current=refreshPrices;},[refreshPrices]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadPortfolio());
    return () => window.cancelAnimationFrame(frame);
  }, [loadPortfolio]);

  useEffect(() => {
    const saved = window.localStorage.getItem("wealth-composition") as Composition | null;
    if (!saved || !["access", "currency", "account", "asset", "geography", "sector"].includes(saved)) return;
    const frame = window.requestAnimationFrame(() => setComposition(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setCompositionSaved = (next: Composition) => {
    setComposition(next);
    window.localStorage.setItem("wealth-composition", next);
  };

  const nav = (["overview", "portfolio", "accounts", "history"] as View[]).map((id) => ({ id, label: t[id], Icon: navIcons[id] }));
  const activeAccounts=accounts.filter(a=>!a.archivedAt);
  const activeAccountIds=new Set(activeAccounts.map(a=>a.id));
  const activeHoldings=holdings.filter(h=>!h.archivedAt&&activeAccountIds.has(h.accountId));
  const totalTrackedWealth=activeHoldings.reduce((sum,h)=>sum+h.ils,0)+activeAccounts.reduce((sum,a)=>sum+cashValueIls(a,usdIlsRate),0);
  const changeLanguage=(next:Language)=>{setLang(next);void fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"language",language:next})})};
  const restoreAutomaticRate=async()=>{await fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"automatic_rate"})});await refreshPrices(false);};
  const openManager=(accountId:number|null,start:"new-account"|"new-asset"|number|null=null)=>{setManagerAccountId(accountId);setManagerStart(start);openLayer("manager")};
  const openDataCheckIssue=()=>{window.history.pushState({layer:"data-check"},"");setDataCheckOpen(true);};
  const fixDataCheckIssue=(holding:Holding,type:HoldingDataCheckIssueType)=>{setDataCheckFocus(type);setManagerAccountId(holding.accountId);setManagerStart(holding.id);setManagerOpen(true);};
  const acknowledgeDataCheckIssue=async(holding:Holding,type:Exclude<HoldingDataCheckIssueType,"missing-value">)=>{if(type==="matured-deposit")return;const dimensions=type==="missing-classification"?{geography:(holding.geography===""||holding.geography==="unspecified")&&!holding.geographyIntentionallyUnclassified,sector:(holding.sector===""||holding.sector==="unspecified")&&!holding.sectorIntentionallyUnclassified}:{};const response=await fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"acknowledge_data_check",id:holding.id,issue:type,...dimensions})});if(!response.ok){setNotice(lang==="he"?"לא הצלחנו לשמור את הבחירה":"Could not save the choice");return;}await loadPortfolio(false);notifySaved();};

  const updateAccess = async (id: number, access: Access) => {
    const previous=holdings.find(h=>h.id===id)?.access;
    setHoldings((all) => all.map((h) => h.id === id ? { ...h, access } : h));
    try{
      const response=await fetch("/api/portfolio", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({action:"liquidity",id,liquidity:access}) });
      if(!response.ok)throw new Error();
      setNotice(lang==="he"?"רמת הנגישות נשמרה":"Accessibility saved");
    }catch{
      if(previous)setHoldings((all)=>all.map(h=>h.id===id?{...h,access:previous}:h));
      setNotice(lang==="he"?"השינוי לא נשמר; הערך הקודם הוחזר":"Change not saved; previous value restored");
    }finally{window.setTimeout(()=>setNotice(""),3000)}
  };

  const openLayer = (kind: "update" | "holding" | "access" | "settings" | "manager", holding?: Holding) => {
    window.history.pushState({ layer: kind }, "");
    if (kind === "update") setModal(true);
    if (kind === "holding" && holding) setSelectedHolding(holding);
    if (kind === "access" && holding) setAccessTarget(holding);
    if (kind === "settings") setSettingsOpen(true);
    if (kind === "manager") setManagerOpen(true);
  };
  const closeLayers = () => { setModal(false); setSelectedHolding(null); setAccessTarget(null); setSettingsOpen(false); setManagerOpen(false); setManagerStart(null); setDataCheckOpen(false); setDataCheckFocus(null); setEditor(null); };
  const closeLayer = () => window.history.back();

  useEffect(() => {
    const onBack = () => closeLayers();
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  if (loading) return <div className="app-loading" dir={dir}><span className="brand-mark"><TrendingUp size={19}/></span><strong>{t.app}</strong><small>{lang==="he"?"טוען את התיק שלך…":"Loading your portfolio…"}</small></div>;
  if (loadError) return <div className="app-loading" dir={dir}><strong>{lang==="he"?"לא הצלחנו לטעון את האפליקציה":"We couldn't load the app"}</strong><small>{loadError}</small><button className="primary" onClick={loadPortfolio}>{lang==="he"?"ניסיון נוסף":"Try again"}</button></div>;
  if (!onboarded) return <SetupWizard lang={lang} setLang={setLang} complete={() => loadPortfolio(false)}/>;

  return <div className="app-shell" dir={dir} lang={lang}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><TrendingUp size={18}/></span><span>{t.app}</span></div>
      <nav aria-label="Primary navigation">{nav.map(({ id, label, Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-foot"><button className="language" onClick={() => changeLanguage(lang === "he" ? "en" : "he")}>{t.language}</button><button className="profile" onClick={()=>openLayer("settings")}><span><Settings2 size={16}/></span><div><strong>{lang==="he"?"הגדרות":"Settings"}</strong><small>{lang==="he"?"שפה, גיבוי ושחזור":"Language, backup, and restore"}</small></div><Settings2 size={17}/></button></div>
    </aside>

    <main className="main">
      <header className="topbar"><div><small>{t.greeting}</small><h1>{nav.find((n) => n.id === view)?.label}</h1></div><div className="top-actions"><button className="mobile-settings" onClick={() => openLayer("settings")} aria-label={lang==="he"?"הגדרות":"Settings"}><Settings2 size={20}/></button><button className="primary" onClick={() => openLayer("update")}><RefreshCw size={16}/>{t.update}</button></div></header>
      {view === "overview" && <Overview t={t} composition={composition} setComposition={setCompositionSaved} setView={setView} holdings={activeHoldings} accounts={activeAccounts} snapshots={snapshots} attribution={wealthFlowAttribution} rate={usdIlsRate} valuationMeta={valuationMeta} refreshPrices={()=>void refreshPrices(false)} refreshingPrices={refreshingPrices} onIssueAction={openDataCheckIssue}/>}
      {view === "portfolio" && <Portfolio
        t={t}
        holdings={activeHoldings.map(holding=>({...holding,showDataCheckWarning:true,dataCheckHebrew:lang==="he"}))}
        accounts={activeAccounts}
        rate={usdIlsRate}
        openHolding={(h)=>openLayer("holding",h)}
        addAsset={()=>openManager(null,"new-asset")}
        refreshPrices={()=>void refreshPrices(false)}
        refreshingPrices={refreshingPrices}
      />}
      {view === "accounts" && <Accounts t={t} openAccount={(id)=>openManager(id)} addAccount={()=>openManager(null,"new-account")} manageArchived={()=>openManager(null)} accounts={activeAccounts} holdings={activeHoldings} archivedCount={accounts.filter(a=>a.archivedAt).length+holdings.filter(h=>h.archivedAt&&!accounts.find(a=>a.id===h.accountId)?.archivedAt).length} rate={usdIlsRate}/>} 
      {view === "history" && <History t={t} snapshots={snapshots} wealthFlows={wealthFlows} accounts={activeAccounts} rate={usdIlsRate} reload={loadPortfolio} saveSnapshot={async()=>{await fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"snapshot"})});await loadPortfolio();}}/>}
    </main>

    <nav className="bottom-nav" aria-label="Mobile navigation">
      {nav.slice(0,2).map(({ id, label, Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={20}/><span>{label}</span></button>)}
      <button className="nav-update" onClick={() => openLayer("update")}><span><Plus size={23}/></span><b>{t.update}</b></button>
      {nav.slice(2).map(({ id, label, Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={20}/><span>{label}</span></button>)}
    </nav>
    {modal && <UpdateSheet t={t} close={closeLayer} select={(mode)=>{setModal(false);setEditor(mode);}}/>}
    {selectedHolding && <HoldingSheetV2 t={t} holding={selectedHolding} rate={usdIlsRate} totalTrackedWealth={totalTrackedWealth} close={closeLayer} editAccess={() => { closeLayers(); setAccessTarget(selectedHolding); }} editAsset={()=>{const target=selectedHolding;closeLayers();openManager(target.accountId,target.id)}}/>}
    {accessTarget && <AccessSheet t={t} holding={accessTarget} close={closeLayer} choose={(access)=>{updateAccess(accessTarget.id,access);closeLayer();}}/>}
    {settingsOpen && <DataSettingsSheetV2
      t={t}
      lang={lang}
      setLang={changeLanguage}
      rateMode={valuationMeta.rateMode}
      restoreAutomaticRate={restoreAutomaticRate}
      restored={async()=>{await loadPortfolio();notifySaved();closeLayer()}}
      close={closeLayer}
    />}
    {dataCheckOpen&&<DataCheckSheet t={t} holdings={activeHoldings} valuation={valuationMeta} close={closeLayer} fix={fixDataCheckIssue} acknowledge={acknowledgeDataCheckIssue} refresh={()=>void refreshPrices(false)} refreshing={refreshingPrices}/>}
    {managerOpen && <PortfolioManager t={t} accounts={accounts} holdings={holdings} rate={usdIlsRate} initialAccountId={managerAccountId} start={managerStart} close={()=>{if(dataCheckOpen){setManagerOpen(false);setManagerStart(null);setDataCheckFocus(null);}else closeLayer();}} dataCheckFocus={dataCheckFocus} saved={async()=>{const refreshed=await loadPortfolio();notifySaved();return refreshed??[]}}/>}
    {editor&&<MaintenanceSheet t={t} mode={editor} accounts={activeAccounts} holdings={activeHoldings} rate={usdIlsRate} close={closeLayer} save={async(payload)=>{const response=await fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});if(!response.ok)throw new Error("Update failed");await loadPortfolio();window.history.back();}}/>}
    {notice&&<div className="save-toast" role="status"><ShieldCheck size={16}/>{notice}</div>}
  </div>;
}
