import { depositTiming, fixedDepositValue, type FixedDepositTerms } from "../../../lib/fixed-deposit.ts";

type HoldingRow = { id: number; instrumentKind: string; currentPrice: number; quantity: number; attentionReason: string | null };
type DepositRow = FixedDepositTerms & { holdingId: number };
type ExitPointRow = { holdingId: number; exitDate: string };

export function applyCalculatedDepositValues<T extends HoldingRow>(holdings: T[], details: DepositRow[], exitPoints: ExitPointRow[], asOfDate: string) {
  const detailsByHolding = new Map(details.map((row) => [row.holdingId, row]));
  const exitsByHolding = new Map<number, string[]>();
  for (const row of exitPoints) exitsByHolding.set(row.holdingId, [...(exitsByHolding.get(row.holdingId) ?? []), row.exitDate]);
  return holdings.map((holding) => {
    if (holding.instrumentKind !== "deposit") return holding;
    const terms = detailsByHolding.get(holding.id);
    if (!terms) return holding;
    const timing = depositTiming(terms, exitsByHolding.get(holding.id) ?? [], asOfDate);
    return {
      ...holding,
      quantity: 1,
      currentPrice: fixedDepositValue(terms, asOfDate),
      attentionReason: timing.matured ? "deposit_matured" : null,
      deposit: { ...terms, ...timing },
    };
  });
}
