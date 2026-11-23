import { allocationPercentage, isExposureEligible, supportsCostComparison, type holdingUnrealizedPl } from "../../lib/finance.ts";
import type { DataCheckIssueType } from "../../lib/data-check.ts";

export type View = "overview" | "portfolio" | "accounts" | "history";
export type Language = "he" | "en";
export type Composition = "access" | "currency" | "account" | "asset" | "geography" | "sector";
export type Access = "available" | "near" | "invested" | "locked";

export type Holding = {
  displayAlias?: string | null;
  id: number; accountId: number; instrumentId:number|null;
  symbol: string; name: string; account: string; type: string; instrumentKind:"security"|"crypto"|"deposit"|"pension"|"other"; geography:string; sector:string; attentionReason:string|null; currency: "USD" | "ILS";
  qty: number; avg: number; price: number; native: number; ils: number; gain: number;
  status: "auto" | "manual" | "calculated"; access: Access; archivedAt:string|null; updatedAt:string; priceAsOf:string|null; instrumentProvider:string|null; providerInstrumentId:string|null; quoteProvider:string|null; quoteProviderInstrumentId:string|null; instrumentExchange:string|null; instrumentMic:string|null; instrumentIsin:string|null; instrumentMarket:string|null;
  quoteStatus:string|null;priceStale:boolean;
  costBasisIntentionallyUnknown:boolean; geographyIntentionallyUnclassified:boolean; sectorIntentionallyUnclassified:boolean; manualPriceReviewedAt:string|null;
  showDataCheckWarning?:boolean;
  dataCheckHebrew?:boolean;
  deposit?:{principal:number;currency:"ILS"|"USD";startDate:string;maturityDate:string;annualInterestRate:number;interestMethod:"simple"|"compound";compoundingFrequency:"annual"|"monthly"|"daily"|null;note:string|null;matured:boolean;nextExitPoint:string|null;exitPoints:string[]};
};

export type InstrumentMatch={provider:"yahoo"|"keren44"|"tase";providerInstrumentId:string;quoteProvider?:"yahoo"|"keren44";quoteProviderInstrumentId?:string;symbol:string;name:string;exchange:string;exchangeCode:string;mic:string;isin:string|null;assetClass:"stock"|"etf"|"index_fund"|"money_market";currency:"USD"|"ILS";market:"US"|"GB"|"IL"};
export function instrumentSaveFields(instrument:InstrumentMatch|null,manualPrice:boolean){if(!instrument||manualPrice&&instrument.provider!=="tase")return{};return{instrumentProvider:instrument.provider,providerInstrumentId:instrument.providerInstrumentId,instrumentExchange:instrument.exchange,instrumentMarket:instrument.market,instrumentMic:instrument.mic,instrumentIsin:instrument.isin,...(!manualPrice&&instrument.quoteProvider&&instrument.quoteProviderInstrumentId?{quoteProvider:instrument.quoteProvider,quoteProviderInstrumentId:instrument.quoteProviderInstrumentId}:{})}}

export type Account = { id:number; name:string; kind:"bank"|"broker"|"crypto_wallet"|"cash"|"pension"|"deposit"|"other"; cashBalance:number; cashCurrency:"ILS"|"USD"; annualManagementFeePercent:number|null; archivedAt:string|null; updatedAt:string };
export type Snapshot = { id:number; totalIls:number; capturedAt:string };
export type WealthFlow = { id:number; direction:"in"|"out"; originalAmount:number; currency:"ILS"|"USD"; ilsValue:number; relatedAccountId:number|null; occurredAt:string; note:string|null; createdAt:string; updatedAt:string };
export type WealthFlowAttribution = { wealthChange:number; moneyInIls:number; moneyOutIls:number; netExternalFlow:number; residualChange:number };
export type ValuationMeta = { latestPriceAsOf:string|null; lastRefreshAt:string|null; automaticCount:number; staleCount:number; failedCount:number; rateAsOf:string|null; rateMode:"automatic"|"manual"; rateSource:string|null; rateStale:boolean; rateFailed:boolean };

export const copy = {
  en: {
    app: "My Wealth", overview: "Overview", portfolio: "Portfolio", accounts: "Accounts", history: "History",
    greeting: "Welcome back", total: "Tracked wealth", netChange: "Change", previous: "since the latest snapshot from an earlier day",
    updated: "Saved portfolio data", update: "Quick update", composition: "Wealth composition", access: "Personal accessibility", currency: "Quoted currency", geography:"Geography", sector:"Sector",
    account: "Account", asset: "Asset type", available: "Available now", near: "Near-cash", invested: "Invested", locked: "Locked",
    accessible: "Accessible if needed", quoteCurrency: "Based on the currency each asset is quoted in", attention: "Needs your attention",
    manualPrice: "Manual price", updateNow: "Update now", largest: "Largest assets", allHoldings: "View portfolio", holding: "Asset",
    value: "Value", return: "P/L vs cost", currentInvestmentPl: "Current investment P/L", allocation: "Allocation", search: "Search alias, name, ticker or security no.", filters: "Filters", all: "All",
    accessibility: "Personal accessibility", qty: "Quantity", avgPrice: "Average purchase price", current: "Current price", nativeValue: "Native value",
    portfolioTitle: "Portfolio", portfolioSub: "Investments and assets currently tracked", accountsTitle: "Accounts", accountsSub: "Cash balances and assets by account",
    updateAccounts: "Update accounts", cashBalance: "Cash balance", accountCash: "Account cash", holdingsAssets: "Assets", holdings: "assets", mix: "Quoted-currency mix", lastConfirmed: "Last confirmed",
    today: "Today", review: "Review", historyTitle: "History", historySub: "How your total wealth has changed", saveSnapshot: "Save snapshot",
    activity: "Activity log", snapshots: "Snapshots", allChanges: "All changes are preserved", buy: "Buy", sell: "Sell", transfer: "Transfer",
    deposit: "Deposit", withdrawal: "Withdrawal", reconcile: "Update cash balance", correction: "Correct asset", manualUpdate: "Update manual price",
    choose: "What would you like to update?", cancel: "Cancel", language: "עברית", sourceNote: "This change includes deposits and withdrawals because cash-flow tracking is not enabled yet.",
    stale: "Price last entered 12 days ago", bank: "Bank Leumi", physical: "Physical cash", editClass: "Change accessibility", snapshotHint: "Save another snapshot to see change", noSnapshots: "No snapshots yet",
  },
  he: {
    app: "ההון שלי", overview: "סקירה", portfolio: "תיק השקעות", accounts: "חשבונות", history: "היסטוריה",
    greeting: "ברוכים השבים", total: "הון במעקב", netChange: "שינוי", previous: "מאז תמונת המצב האחרונה מיום קודם",
    updated: "נתוני תיק שמורים", update: "עדכון מהיר", composition: "הרכב ההון", access: "נגישות אישית", currency: "מטבע נקוב", geography:"גיאוגרפיה", sector:"ענף",
    account: "חשבון", asset: "סוג נכס", available: "זמין עכשיו", near: "כמעט מזומן", invested: "מושקע", locked: "נעול",
    accessible: "נגיש במקרה הצורך", quoteCurrency: "לפי המטבע שבו כל נכס נקוב", attention: "דורש את תשומת לבך",
    manualPrice: "מחיר ידני", updateNow: "עדכון עכשיו", largest: "הנכסים הגדולים ביותר", allHoldings: "לכל התיק", holding: "נכס",
    value: "שווי", return: "רווח/הפסד מול עלות", currentInvestmentPl: "רווח/הפסד מהשקעות נוכחיות", allocation: "הקצאה", search: "חיפוש כינוי, שם, סימול או מספר נייר", filters: "סינון", all: "הכול",
    accessibility: "נגישות אישית", qty: "כמות", avgPrice: "מחיר קנייה ממוצע", current: "מחיר נוכחי", nativeValue: "שווי במטבע המקור",
    portfolioTitle: "תיק השקעות", portfolioSub: "השקעות ונכסים שנמצאים במעקב", accountsTitle: "חשבונות", accountsSub: "יתרות מזומן ונכסים לפי חשבון",
    updateAccounts: "עדכון חשבונות", cashBalance: "יתרת מזומן", accountCash: "מזומן בחשבונות", holdingsAssets: "נכסים", holdings: "נכסים", mix: "תמהיל מטבע נקוב", lastConfirmed: "אושר לאחרונה",
    today: "היום", review: "בדיקה", historyTitle: "היסטוריה", historySub: "איך ההון הכולל שלך השתנה", saveSnapshot: "שמירת תמונה",
    activity: "יומן פעילות", snapshots: "תמונות מצב", allChanges: "כל השינויים נשמרים", buy: "קנייה", sell: "מכירה", transfer: "העברה",
    deposit: "הפקדה", withdrawal: "משיכה", reconcile: "עדכון יתרת מזומן", correction: "תיקון נכס", manualUpdate: "עדכון מחיר ידני",
    choose: "מה תרצה לעדכן?", cancel: "ביטול", language: "English", sourceNote: "השינוי כולל הפקדות ומשיכות כי מעקב תזרים עדיין לא פעיל.",
    stale: "המחיר הוזן לאחרונה לפני 12 ימים", bank: "בנק לאומי", physical: "מזומן פיזי", editClass: "שינוי רמת נגישות", snapshotHint: "שמור תמונה נוספת כדי לראות את השינוי", noSnapshots: "עדיין אין תמונות מצב",
  },
};

export const money = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const unitPrice = (n:number,currency:"ILS"|"USD") => `${currency==="ILS"?"₪":"$"}${n.toLocaleString("en-US",{maximumFractionDigits:4})}`;
export const dataCheckIssueLabel=(type:DataCheckIssueType,he:boolean)=>({
  "missing-value":he?"נכסים ללא שווי נוכחי":"assets without a current value",
  "automatic-price-failed":he?"רענון מחירים אוטומטיים נכשל; הערך הקודם נשמר":"automatic price refreshes failed; previous values retained",
  "automatic-fx-failed":he?"שער המטבע לא התרענן; השער הקודם נשמר":"exchange rate refresh failed; previous rate retained",
  "automatic-price-stale":he?"מחירים אוטומטיים ממתינים לעדכון":"automatic prices awaiting refresh",
  "stale-manual-price":he?"מחירים ידניים שלא אושרו יותר מ־30 יום":"manual prices not confirmed for over 30 days",
  "missing-classification":he?"השקעות ללא סיווג גיאוגרפי או ענפי":"investments missing geography or sector classification",
  "missing-cost-basis":he?"ניירות ללא בסיס עלות — לא משפיע על השווי":"securities without cost basis — valuation unaffected",
  "matured-deposit":he?"פיקדונות שהגיעו לפדיון ודורשים בדיקה":"matured deposits needing review",
}[type]);

export const assetTypes = ["stock","etf","index_fund","money_market","bond","bond_fund","crypto","deposit","pension","cash","real_estate","other"] as const;
export type AssetType = typeof assetTypes[number];
export const normalizeAssetType=(value:string):AssetType=>{const key=value.toLowerCase().replaceAll("-","_");if(key==="money_market"||key==="money market")return "money_market";if(key==="stock")return "stock";if(key==="etf")return "etf";if(key==="deposit")return "deposit";if(key==="real estate")return "real_estate";return assetTypes.includes(key as AssetType)?key as AssetType:"other"};
export const assetTypeLabel=(he:boolean,type:AssetType)=>({stock:he?"מניה בודדת":"Individual stock",etf:he?"קרן סל (ETF)":"ETF",index_fund:he?"קרן מחקה / עוקבת":"Index-tracking fund",money_market:he?"קרן כספית":"Money-market fund",bond:he?"אג״ח":"Bond",bond_fund:he?"קרן אג״ח":"Bond fund",crypto:he?"מטבע קריפטו":"Cryptocurrency",deposit:he?"פיקדון":"Deposit",pension:he?"פנסיה":"Pension",cash:he?"מזומן":"Cash",real_estate:he?"נדל״ן":"Real estate",other:he?"נכס אחר":"Other asset"}[type]);
export const instrumentKindForType=(type:AssetType):"security"|"crypto"|"deposit"|"pension"|"other"=>type==="crypto"?"crypto":["stock","etf","index_fund","money_market","bond","bond_fund"].includes(type)?"security":type==="deposit"?"deposit":type==="pension"?"pension":"other";
export const supportsPriceChangeComparison = supportsCostComparison;
export const investmentPlInput = (holding: Pick<Holding, "instrumentKind" | "qty" | "avg" | "price" | "currency" | "costBasisIntentionallyUnknown" | "archivedAt">) => ({
  instrumentKind: holding.instrumentKind, quantity: holding.qty, averagePrice: holding.avg, currentPrice: holding.price,
  currency: holding.currency, costBasisIntentionallyUnknown: holding.costBasisIntentionallyUnknown, archivedAt: holding.archivedAt,
});
export const signedMoney = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;
export const signedPercentage = (value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(1)}%`;
export function compareInvestmentPl(a: { id: number; pl: ReturnType<typeof holdingUnrealizedPl> }, b: { id: number; pl: ReturnType<typeof holdingUnrealizedPl> }, direction: "asc" | "desc") {
  // Unavailable values stay last in both directions; equal values have a stable identity order.
  if (!a.pl) return b.pl ? 1 : a.id - b.id;
  if (!b.pl) return -1;
  return (direction === "asc" ? 1 : -1) * (a.pl.unrealizedPlIls - b.pl.unrealizedPlIls) || a.id - b.id;
}

export type ExposureProfile={geography:Record<string,number>;sector:Record<string,number>};
export type ExposureDimension = keyof ExposureProfile;
// Retain existing keys (including finance); no stored classifications are migrated.
const geographyLabels: Record<string, [string, string]> = {
  us: ["United States", "ארה״ב"], israel: ["Israel", "ישראל"], europe: ["Europe", "אירופה"],
  japan: ["Japan", "יפן"], china: ["China", "סין"], canada: ["Canada", "קנדה"], australia: ["Australia", "אוסטרליה"],
  emerging_markets: ["Emerging Markets", "שווקים מתעוררים"], developed_ex_us: ["Developed ex-US", "שווקים מפותחים ללא ארה״ב"],
  global: ["Global", "עולמי"], other: ["Other / Mixed", "אחר / מעורב"], unspecified: ["Unclassified", "לא מסווג"],
};
const sectorLabels: Record<string, [string, string]> = {
  technology: ["Technology", "טכנולוגיה"], finance: ["Financials", "פיננסים"], healthcare: ["Healthcare", "בריאות"],
  industrials: ["Industrials", "תעשייה"], consumer_discretionary: ["Consumer Discretionary", "צריכה מחזורית"],
  consumer_staples: ["Consumer Staples", "צריכה בסיסית"], communication_services: ["Communication Services", "שירותי תקשורת"],
  energy: ["Energy", "אנרגיה"], materials: ["Materials", "חומרי גלם"], utilities: ["Utilities", "תשתיות ושירותים ציבוריים"],
  real_estate: ["Real Estate", "נדל״ן"], broad: ["Broad / Mixed", "רחב / מעורב"], other: ["Other", "אחר"], unspecified: ["Unclassified", "לא מסווג"],
};
export const geographyOptions = Object.keys(geographyLabels);
export const sectorOptions = Object.keys(sectorLabels);
export function exposureLabel(he: boolean, dimension: ExposureDimension, key: string) {
  const labels = dimension === "geography" ? geographyLabels : sectorLabels;
  const normalized = dimension === "sector" && key === "financials" ? "finance" : key;
  return labels[normalized]?.[he ? 1 : 0] ?? key;
}
export function holdingDisplayName(holding: Pick<Holding, "displayAlias" | "symbol" | "name">) {
  return holding.displayAlias || holding.symbol || holding.name;
}
export function holdingCanonicalName(holding: Pick<Holding, "symbol" | "name">) {
  return holding.symbol ? `${holding.symbol} · ${holding.name}` : holding.name;
}
export function holdingMatchesSearch(holding: Pick<Holding, "displayAlias" | "symbol" | "name" | "providerInstrumentId">, query: string) {
  return `${holding.displayAlias ?? ""} ${holding.symbol} ${holding.name} ${holding.providerInstrumentId ?? ""}`.toLowerCase().includes(query.toLowerCase());
}
export function largestAssets<T extends { id: number; ils: number }>(holdings: T[], totalTrackedWealth: number) {
  const topHoldings = holdings.slice().sort((a, b) => b.ils - a.ils || a.id - b.id).slice(0, 4);
  return { topHoldings, percentage: Math.round(allocationPercentage(topHoldings.reduce((sum, h) => sum + h.ils, 0), totalTrackedWealth)) };
}
export function compareHoldingExposure(a: Holding, b: Holding, dimension: ExposureDimension, direction: "asc" | "desc", he: boolean) {
  const primary = (holding: Holding) => Object.entries(exposureProfile(holding)[dimension]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unspecified";
  const av = primary(a), bv = primary(b);
  // Apply direction only to classified values, then use stable identity order for ties.
  return compareExposureKeysWithUnclassifiedLast(av, bv, () =>
    (direction === "asc" ? 1 : -1) * exposureLabel(he, dimension, av).localeCompare(exposureLabel(he, dimension, bv), he ? "he" : "en")
  ) || a.id - b.id;
}
export const compareExposureKeysWithUnclassifiedLast=(a:string,b:string,compare:()=>number)=>{
  if(a==="unspecified")return b==="unspecified"?0:1;
  if(b==="unspecified")return -1;
  return compare();
};
export const exposureEligible=(holding:Holding)=>isExposureEligible({instrumentKind:holding.instrumentKind,assetType:holding.type});
export const exposureProfile=(holding:Holding):ExposureProfile=>{
  const geography=holding.geography||"unspecified";
  const sector=holding.sector==="financials"?"finance":holding.sector||"unspecified";
  return {geography:{[geography||"unspecified"]:100},sector:{[sector||"unspecified"]:100}};
};

export function accessLabel(t:typeof copy.en,access:Access){return access==="available"?t.available:access==="near"?t.near:access==="locked"?t.locked:t.invested;}
