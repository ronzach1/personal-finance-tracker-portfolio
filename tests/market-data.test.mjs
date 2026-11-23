import assert from "node:assert/strict";
import test from "node:test";
import { combineInstrumentSearch, keren44ProviderInstrumentId, marketPriceAfterRefresh, parseKeren44ProviderInstrumentId, parseYahooClose, resolveTaseSearchMatches, searchKeren44Funds } from "../lib/market-data.ts";
import { mergeTaseSecurities, parseTaseSecurities, searchTaseSecurities, taseAssetClass, taseYahooSymbol } from "../lib/tase-market-data.ts";

const scannerFixture = { funds: [
  { fundId: "5143128", isin: "IL0051431281", name: "פורטה כספית", slug: "פורטה-כספית", fundType: "mutual", main: "קרן כספית", isTracking: false, isLeveraged: false, currency: "ILS" },
  { fundId: "5127600", isin: "IL0051276009", name: "תכלית ISE CTA Cloud Computing TTF מנוטרלת מט\"ח", slug: "תכלית-ise-cloud-ttf-ממ", fundType: "mutual", main: "מניות בחו\"ל", isTracking: true, isLeveraged: false, currency: "ILS" },
  { fundId: "5138698", isin: "IL0051386980", name: "דולפין כספית", slug: "דולפין-כספית", fundType: "mutual", main: "קרן כספית", isTracking: false, isLeveraged: false, currency: "ILS" },
  { fundId: "5133582", isin: "IL0051335821", name: "תכלית TTF ת\"א ביטוח ושירותים פיננסים", slug: "תכלית-ttf-תא-ביטוח-ופיננס", fundType: "mutual", main: "מניות בארץ", isTracking: true, isLeveraged: false, currency: "ILS" },
  { fundId: "5112404", isin: "IL0051124043", name: "MTF מחקה תל בונד 40 צמודות", slug: "mtf-מח-תלבונד-40-צמודות", fundType: "mutual", main: "אג\"ח בארץ - חברות והמרה", isTracking: true, isLeveraged: false, currency: "ILS" },
  { fundId: "1143767", isin: "IL0011437675", name: "תכלית סל EURO STOXX 50", slug: "תכלית-סל-eu-stoxx50", fundType: "etf", main: "מניות בחו\"ל", isTracking: true, isLeveraged: false, currency: "ILS" },
  { fundId: "5143000", isin: "IL0051430002", name: "קרן מנייתית אקטיבית", slug: "קרן-מנייתית-אקטיבית", fundType: "mutual", main: "מניות בארץ", isTracking: false, isLeveraged: false, currency: "ILS" },
].map(fund => ({ ...fund, unitsInUsd: false, isForeignEtf: false })) };

test("Keren44 dynamically finds an exact fund number and persists its detail locator", () => {
  const [fund] = searchKeren44Funds(scannerFixture, "5143128");
  assert.equal(fund.symbol, "5143128");
  assert.equal(fund.assetClass, "money_market");
  assert.deepEqual(parseKeren44ProviderInstrumentId(fund.providerInstrumentId), { fundId: "5143128", slug: "פורטה-כספית" });
});

test("Keren44 Hebrew name lookup normalizes harmless punctuation and spacing", () => {
  const [fund] = searchKeren44Funds(scannerFixture, "תכלית ISE CTA Cloud-Computing TTF מנוטרלת מטח");
  assert.equal(fund.symbol, "5127600");
  assert.equal(fund.assetClass, "index_fund");
});

test("Keren44 supports exact ISIN lookup and preserves metadata", () => {
  const [fund] = searchKeren44Funds(scannerFixture, "IL0051386980");
  assert.equal(fund.name, "דולפין כספית");
  assert.equal(fund.isin, "IL0051386980");
  assert.equal(fund.currency, "ILS");
});

test("Keren44 excludes ETFs and ambiguous active funds from automatic pricing", () => {
  assert.equal(searchKeren44Funds(scannerFixture, "EURO STOXX").length, 0);
  assert.equal(searchKeren44Funds(scannerFixture, "מנייתית אקטיבית").length, 0);
});

test("Keren44 excludes tracking bond funds rather than misclassifying them as equity index funds", () => {
  assert.equal(searchKeren44Funds(scannerFixture, "5112404").length, 0);
});

test("existing supported Israeli fund numbers remain discoverable", () => {
  const [fund] = searchKeren44Funds(scannerFixture, "5133582");
  assert.equal(fund.assetClass, "index_fund");
  assert.equal(keren44ProviderInstrumentId("5138698", "דולפין-כספית"), "5138698::דולפין-כספית");
});

test("a Keren44 search failure leaves Yahoo search results available", async () => {
  const yahoo = { provider: "yahoo", providerInstrumentId: "MSFT", symbol: "MSFT", name: "Microsoft", exchange: "Nasdaq", exchangeCode: "NMS", mic: "XNAS", isin: null, assetClass: "stock", currency: "USD", market: "US" };
  assert.deepEqual(await combineInstrumentSearch("MSFT", async () => { throw new Error("Keren44 unavailable"); }, async () => [yahoo]), [yahoo]);
});

const taseHeFixture={data:{securities:[
  {securityId:230011,securityFullTypeCode:"0101",isin:"IL0002300114",securityName:"בזק",symbol:"בזק"},
  {securityId:1159235,securityFullTypeCode:"0114",isin:"IL0011592354",securityName:"ריט 1",symbol:"RIT1"},
  {securityId:1200112,securityFullTypeCode:"3211",isin:"IL0012001124",securityName:"תכלית טכנולוגיה",symbol:"TCH.F11"},
  {securityId:1200120,securityFullTypeCode:"4201",isin:"IL0012001207",securityName:"קרן סל מניות",symbol:"EQ.F1"},
  {securityId:999001,securityFullTypeCode:"3601",isin:"IL0099900100",securityName:"קרן סל אגח",symbol:"BOND.F1"},
  {securityId:999002,securityFullTypeCode:"4301",isin:"IL0099900209",securityName:"קרן סל אגח אחרת",symbol:"BOND.F2"},
  {securityId:999003,securityFullTypeCode:"0201",isin:"IL0099900308",securityName:"כתב אופציה",symbol:"WARRANT"},
]}};
const taseEnFixture={results:[
  {securityId:"230011",securityFullTypeCode:"0101",isin:"IL0002300114",securityName:"Bezeq The Israel Telecommunication Corp",symbol:"BEZQ"},
  {securityId:"1200112",securityFullTypeCode:"3211",isin:"IL0012001124",securityName:"Tachlit Technology ETF",symbol:"TCH.F11"},
]};

test("TASE parsing maps only supported share, REIT, and equity-ETF types",()=>{
  const parsed=parseTaseSecurities(taseHeFixture);
  assert.deepEqual(parsed.map(item=>[item.securityId,item.assetClass]),[["230011","stock"],["1159235","stock"],["1200112","etf"],["1200120","etf"]]);
  assert.equal(taseAssetClass("0101"),"stock");assert.equal(taseAssetClass("0114"),"stock");assert.equal(taseAssetClass("3299"),"etf");assert.equal(taseAssetClass("4201"),"etf");
  assert.equal(taseAssetClass("101"),"stock");
  for(const code of ["3601","4301","0201","0102"])assert.equal(taseAssetClass(code),null);
});

test("TASE Hebrew and English universes merge by canonical security number",()=>{
  const merged=mergeTaseSecurities(parseTaseSecurities(taseHeFixture),parseTaseSecurities(taseEnFixture));
  assert.equal(merged.filter(item=>item.securityId==="230011").length,1);
  assert.equal(merged.find(item=>item.securityId==="230011").symbol,"BEZQ");
  assert.deepEqual(merged.find(item=>item.securityId==="230011").symbols,["בזק","BEZQ"]);
  assert.deepEqual(merged.find(item=>item.securityId==="230011").names,["בזק","Bezeq The Israel Telecommunication Corp"]);
});

test("TASE multilingual merge selects the same Latin canonical ticker in either order",()=>{
  const hebrew=parseTaseSecurities(taseHeFixture),english=parseTaseSecurities(taseEnFixture);
  for(const merged of [mergeTaseSecurities(hebrew,english),mergeTaseSecurities(english,hebrew)]){
    const bezeq=merged.find(item=>item.securityId==="230011");
    assert.equal(bezeq.symbol,"BEZQ");
    assert.equal(taseYahooSymbol(bezeq.symbol),"BEZQ.TA");
  }
});

test("TASE multilingual ETFs also retain a Latin canonical ticker and localized alias",()=>{
  const hebrew=parseTaseSecurities({data:{securities:[{securityId:"1200112",securityFullTypeCode:"3211",isin:"IL0012001124",securityName:"תכלית טכנולוגיה",symbol:"תכלית"}]}});
  const english=parseTaseSecurities({results:[{securityId:"1200112",securityFullTypeCode:"3211",isin:"IL0012001124",securityName:"Tachlit Technology ETF",symbol:"TCH.F11"}]});
  const [etf]=mergeTaseSecurities(hebrew,english);
  assert.equal(etf.symbol,"TCH.F11");
  assert.deepEqual(etf.symbols,["תכלית","TCH.F11"]);
  assert.equal(taseYahooSymbol(etf.symbol),"TCH-F11.TA");
  assert.equal(searchTaseSecurities([etf],"תכלית")[0].securityId,"1200112");
});

test("TASE search supports security number, symbol, ISIN, Hebrew, and English names",()=>{
  const securities=mergeTaseSecurities(parseTaseSecurities(taseHeFixture),parseTaseSecurities(taseEnFixture));
  for(const query of ["230011","BEZQ","IL0002300114","בזק","Telecommunication"])assert.equal(searchTaseSecurities(securities,query)[0].securityId,"230011");
});

test("TASE symbols derive isolated Yahoo candidates",()=>{
  assert.equal(taseYahooSymbol("BEZQ"),"BEZQ.TA");
  assert.equal(taseYahooSymbol("TCH.F11"),"TCH-F11.TA");
  assert.throws(()=>taseYahooSymbol("BAD.CLASS"),/Unsupported/);
});

const yahooChart=(symbol,currency,exchangeName,close)=>({chart:{result:[{meta:{symbol,currency,exchangeName,fullExchangeName:exchangeName==="TLV"?"Tel Aviv":"NasdaqGS",exchangeTimezoneName:exchangeName==="TLV"?"Asia/Jerusalem":"America/New_York",marketState:"CLOSED"},timestamp:[1_774_156_400],indicators:{quote:[{close:[close]}]}}],error:null}});

test("Yahoo TASE closes validate TLV/ILA and normalize agorot to ILS once",()=>{
  assert.deepEqual(parseYahooClose(yahooChart("BEZQ.TA","ILA","TLV",782.8),"BEZQ.TA"),{price:7.828,currency:"ILS",priceAsOf:"2026-03-22T05:13:20.000Z",provider:"yahoo"});
  assert.throws(()=>parseYahooClose(yahooChart("BEZ.TA","ILA","TLV",782.8),"BEZQ.TA"),/expected TASE/);
  assert.throws(()=>parseYahooClose(yahooChart("BEZQ.TA","ILS","TLV",7.828),"BEZQ.TA"),/expected TASE/);
});

test("existing Yahoo USD close behavior remains unscaled",()=>{
  assert.equal(parseYahooClose(yahooChart("MSFT","USD","NMS",418.25),"MSFT").price,418.25);
  assert.equal(parseYahooClose(yahooChart("MSFT","USD","NMS",418.25),"MSFT").currency,"USD");
});

test("a TASE failure is isolated from Yahoo and Keren44 results",async()=>{
  const yahoo={provider:"yahoo",providerInstrumentId:"MSFT",symbol:"MSFT"};
  const keren={provider:"keren44",providerInstrumentId:"513"};
  assert.deepEqual(await combineInstrumentSearch("x",async()=>[keren],async()=>[yahoo],async()=>{throw new Error("TASE unavailable")}),[keren,yahoo]);
});

test("TASE discovery retains canonical results when Yahoo verification fails",async()=>{
  const securities=mergeTaseSecurities(parseTaseSecurities(taseHeFixture),parseTaseSecurities(taseEnFixture));
  const [result]=await resolveTaseSearchMatches(securities,"BEZQ",async()=>{throw new Error("Yahoo unavailable")});
  assert.equal(result.provider,"tase");
  assert.equal(result.providerInstrumentId,"230011");
  assert.equal(result.symbol,"BEZQ");
  assert.equal(result.quoteProvider,undefined);
  assert.equal(result.quoteProviderInstrumentId,undefined);
});

test("TASE discovery retains canonical results when Yahoo symbol mapping fails",async()=>{
  const [result]=await resolveTaseSearchMatches([{
    securityId:"700001",
    securityFullTypeCode:"0101",
    isin:"IL0070000100",
    symbol:"BAD.CLASS",
    symbols:["BAD.CLASS"],
    names:["Mapped manually"],
    assetClass:"stock",
  }],"BAD.CLASS",async()=>{assert.fail("Yahoo verification must not run without a candidate")});
  assert.equal(result.provider,"tase");
  assert.equal(result.providerInstrumentId,"700001");
  assert.equal(result.symbol,"BAD.CLASS");
  assert.equal(result.quoteProvider,undefined);
  assert.equal(result.quoteProviderInstrumentId,undefined);
});

test("verified TASE discovery separately attaches the Yahoo quote locator",async()=>{
  const [result]=await resolveTaseSearchMatches(parseTaseSecurities(taseHeFixture),"TCH.F11",async(candidate)=>{assert.equal(candidate,"TCH-F11.TA")});
  assert.equal(result.provider,"tase");
  assert.equal(result.providerInstrumentId,"1200112");
  assert.equal(result.quoteProvider,"yahoo");
  assert.equal(result.quoteProviderInstrumentId,"TCH-F11.TA");
});

test("quote refresh failure preserves the previous valid value",()=>{
  assert.equal(marketPriceAfterRefresh(7.828,null),7.828);
  assert.equal(marketPriceAfterRefresh(7.828,{price:8.1,currency:"ILS",priceAsOf:"2026-08-20T00:00:00.000Z",provider:"yahoo"}),8.1);
});
