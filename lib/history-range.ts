type SnapshotValue = { totalIls: number };

export type HistoryRangeComparison =
  | { available: false; delta: null; percent: null }
  | { available: true; delta: number; percent: number | null };

export function historyRangeComparison(chronological: SnapshotValue[]): HistoryRangeComparison {
  if (chronological.length < 2) return { available: false, delta: null, percent: null };
  const first = chronological[0];
  const latest = chronological.at(-1)!;
  const delta = latest.totalIls - first.totalIls;
  return { available: true, delta, percent: first.totalIls ? delta / first.totalIls * 100 : null };
}
