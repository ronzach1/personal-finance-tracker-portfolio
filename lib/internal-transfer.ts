import type { Currency } from "./portfolio-request.ts";

export type CashBalanceState = { balance: number; currency: Currency };

const transferTolerance = 1e-7;
const amountsMatch = (left: number, right: number) => Math.abs(left - right) <= transferTolerance;

export function hasPairedTransferDirection(sourceDelta: number, destinationDelta: number) {
  return sourceDelta < -transferTolerance && destinationDelta > transferTolerance;
}

export function pairedTransferDestinationBalance(sourceBefore: number, sourceAfter: number, destinationBefore: number) {
  return destinationBefore - (sourceAfter - sourceBefore);
}

export function validatePairedTransferBalances({ sourceBefore, sourceAfter, destinationBefore, destinationAfter }: {
  sourceBefore: CashBalanceState;
  sourceAfter: CashBalanceState;
  destinationBefore: CashBalanceState;
  destinationAfter: CashBalanceState;
}) {
  const balances = [sourceAfter.balance, destinationAfter.balance];
  if (balances.some((balance) => !Number.isFinite(balance) || balance < 0)) return { ok: false as const, error: "Transfer balances must be valid non-negative amounts" };
  if (sourceAfter.currency !== sourceBefore.currency || destinationAfter.currency !== destinationBefore.currency) return { ok: false as const, error: "An internal transfer cannot change account currencies" };
  const sourceDelta = sourceAfter.balance - sourceBefore.balance;
  const destinationDelta = destinationAfter.balance - destinationBefore.balance;
  if (!hasPairedTransferDirection(sourceDelta, destinationDelta)) return { ok: false as const, error: "The source balance must decrease and the destination balance must increase" };
  if (sourceBefore.currency === destinationBefore.currency && !amountsMatch(sourceDelta + destinationDelta, 0)) {
    return { ok: false as const, error: "Same-currency internal transfers must preserve the combined balance" };
  }
  return { ok: true as const };
}
