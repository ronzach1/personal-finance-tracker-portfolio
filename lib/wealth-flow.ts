import { isExplicitUtcIso } from "./datetime-local.ts";

export type WealthFlowInput = { direction:"in"|"out";originalAmount:number;currency:"ILS"|"USD";ilsValue:number;occurredAt:string;note?:string };

export const wealthFlowFutureToleranceMs = 5 * 60_000;

export function isAcceptableWealthFlowOccurredAt(value: unknown, now = new Date()) {
  return isExplicitUtcIso(value) && new Date(value).getTime() <= new Date(now).getTime() + wealthFlowFutureToleranceMs;
}

export function newWealthFlowId(randomValues?: Uint32Array) {
  const values = randomValues ?? crypto.getRandomValues(new Uint32Array(2));
  const magnitude = ((values[0] & 0xffff) * 0x1_0000_0000 + values[1]) || 1;
  return -magnitude;
}

export function wealthFlowCreateRecord(ownerEmail: string, flow: WealthFlowInput, relatedAccountId?: number, id = newWealthFlowId()) {
  return { id, ownerEmail, direction: flow.direction, originalAmount: flow.originalAmount, currency: flow.currency, ilsValue: flow.ilsValue, relatedAccountId: relatedAccountId ?? null, occurredAt: flow.occurredAt, note: flow.note ?? null };
}

export function restoredWealthFlowTrackingState({ hasWealthFlows, wealthFlows, trackingStartedAt, now = new Date() }: { hasWealthFlows: boolean; wealthFlows: unknown; trackingStartedAt: unknown; now?: Date | string }) {
  if (!hasWealthFlows) return { valid: true, trackingStartedAt: new Date(now).toISOString(), restoreFlows: false } as const;
  if (!Array.isArray(wealthFlows) || !isExplicitUtcIso(trackingStartedAt)) return { valid: false, trackingStartedAt: null, restoreFlows: false } as const;
  return { valid: true, trackingStartedAt, restoreFlows: true } as const;
}

export function validWealthFlowBackupRows(value: unknown, accountIds: Set<number>, now = new Date()) {
  if (!Array.isArray(value) || value.length > 10_000) return false;
  return value.every((candidate) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return false;
    const row = candidate as Record<string, unknown>;
    return ["in", "out"].includes(String(row.direction))
      && ["ILS", "USD"].includes(String(row.currency))
      && typeof row.originalAmount === "number" && Number.isFinite(row.originalAmount) && row.originalAmount > 0
      && typeof row.ilsValue === "number" && Number.isFinite(row.ilsValue) && row.ilsValue > 0
      && (row.currency !== "ILS" || row.ilsValue === row.originalAmount)
      && isAcceptableWealthFlowOccurredAt(row.occurredAt, now)
      && (row.note == null || typeof row.note === "string")
      && (row.relatedAccountId == null || (Number.isInteger(Number(row.relatedAccountId)) && accountIds.has(Number(row.relatedAccountId))));
  });
}

export function remapWealthFlowAccountId(relatedAccountId: unknown, accountMap: Map<number, number>) {
  return relatedAccountId == null ? null : accountMap.get(Number(relatedAccountId)) ?? null;
}
