export type TaseAssetClass = "stock" | "etf";

export type TaseSecurity = {
  securityId: string;
  securityFullTypeCode: string;
  isin: string | null;
  symbol: string;
  symbols: string[];
  names: string[];
  assetClass: TaseAssetClass;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const valueString = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const firstString = (row: JsonRecord, keys: string[]) => keys.map((key) => valueString(row[key])).find(Boolean) ?? "";
const normalizeText = (value: string) => value.toLocaleLowerCase().normalize("NFKC").replace(/[״׳"'`.,\-–—_()\s]/g, "");

export function taseAssetClass(typeCode: string): TaseAssetClass | null {
  const code = typeCode.trim().padStart(4, "0");
  if (code === "0101" || code === "0114") return "stock";
  if (/^32\d{2}$/.test(code) || code === "4201") return "etf";
  return null;
}

function candidateRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    const records = value.filter(isRecord);
    if (records.some((row) => firstString(row, ["securityId", "SecurityId", "securityID"]))) return records;
    return value.flatMap(candidateRows);
  }
  return isRecord(value) ? Object.values(value).flatMap(candidateRows) : [];
}

export function parseTaseSecurities(data: unknown): TaseSecurity[] {
  const seen = new Set<string>();
  const parsed: TaseSecurity[] = [];
  for (const row of candidateRows(data)) {
    const securityId = firstString(row, ["securityId", "SecurityId", "securityID"]);
    const securityFullTypeCode = firstString(row, ["securityFullTypeCode", "SecurityFullTypeCode", "securityTypeCode"]).padStart(4, "0");
    const symbol = firstString(row, ["symbol", "Symbol", "securitySymbol"]);
    const assetClass = taseAssetClass(securityFullTypeCode);
    if (!/^\d+$/.test(securityId) || !symbol || !assetClass || seen.has(securityId)) continue;
    const names = [
      firstString(row, ["securityName", "SecurityName", "securityLongName"]),
      firstString(row, ["companyName", "CompanyName", "issuerName"]),
      firstString(row, ["englishName", "securityNameEnglish", "companyNameEnglish"]),
      firstString(row, ["hebrewName", "securityNameHebrew", "companyNameHebrew"]),
    ].filter((name, index, all) => Boolean(name) && all.indexOf(name) === index);
    seen.add(securityId);
    const normalizedSymbol = symbol.toUpperCase();
    parsed.push({ securityId, securityFullTypeCode, isin: firstString(row, ["isin", "ISIN", "securityIsin"]).toUpperCase() || null, symbol: normalizedSymbol, symbols: [normalizedSymbol], names: names.length ? names : [symbol], assetClass });
  }
  return parsed;
}

function canonicalTaseSymbol(symbols: string[]): string {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const yahooCompatible = unique.filter((symbol) => {
    try { taseYahooSymbol(symbol); return true; } catch { return false; }
  });
  return (yahooCompatible.length ? yahooCompatible : unique).sort((a, b) => a.localeCompare(b, "en"))[0] ?? "";
}

export function mergeTaseSecurities(...universes: TaseSecurity[][]): TaseSecurity[] {
  const byId = new Map<string, TaseSecurity>();
  for (const security of universes.flat()) {
    const current = byId.get(security.securityId);
    if (!current) byId.set(security.securityId, { ...security, symbols: [...security.symbols], names: [...security.names] });
    else {
      current.symbols = [...new Set([...current.symbols, ...security.symbols])];
      current.names = [...new Set([...current.names, ...security.names])];
      current.symbol = canonicalTaseSymbol(current.symbols);
    }
  }
  for (const security of byId.values()) security.symbol = canonicalTaseSymbol(security.symbols);
  return [...byId.values()];
}

export function searchTaseSecurities(securities: TaseSecurity[], query: string): TaseSecurity[] {
  const raw = query.trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  const normalized = normalizeText(raw);
  return securities.filter((security) => security.securityId === raw || security.symbols.includes(upper) || security.isin === upper || security.names.some((name) => normalizeText(name).includes(normalized)))
    .sort((a, b) => Number(b.securityId === raw) - Number(a.securityId === raw) || Number(b.symbol === upper) - Number(a.symbol === upper) || Number(b.isin === upper) - Number(a.isin === upper) || a.names[0].localeCompare(b.names[0], "he"));
}

export function taseYahooSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase().replace(/\.F(?=\d+$)/, "-F");
  if (!/^[A-Z0-9]+(?:-F\d+)?$/.test(normalized)) throw new Error("Unsupported TASE symbol format");
  return `${normalized}.TA`;
}
