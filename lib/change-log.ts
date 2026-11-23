export const changeEventTypes = [
  "account.created", "account.updated", "account.archived", "account.restored", "account.deleted",
  "asset.created", "asset.updated", "asset.archived", "asset.restored", "asset.deleted",
  "wealth_flow.created", "wealth_flow.updated", "wealth_flow.deleted",
  "backup.restored",
] as const;

export type ChangeEventType = typeof changeEventTypes[number];
export type ChangeEntityType = "account" | "asset" | "wealth_flow" | "backup";
export type ChangeState = Record<string, unknown>;

export type ChangeEvent = {
  eventType: ChangeEventType;
  entityType: ChangeEntityType;
  entityId: number | null;
  changedFields: string[] | null;
  before: ChangeState | null;
  after: ChangeState | null;
  metadata: ChangeState | null;
};

const accountFields = ["id", "name", "kind", "cashBalance", "cashCurrency", "annualManagementFeePercent", "archivedAt"] as const;
const assetFields = [
  "id", "accountId", "instrumentId", "symbol", "name", "displayAlias", "instrumentKind", "assetType", "geography", "sector",
  "exposureMode", "currency", "quantity", "averagePrice", "currentPrice", "priceMode", "attentionReason",
  "costBasisIntentionallyUnknown", "geographyIntentionallyUnclassified", "sectorIntentionallyUnclassified", "manualPriceReviewedAt",
  "liquidity", "archivedAt",
  "depositDetails",
] as const;
const wealthFlowFields = ["id", "direction", "originalAmount", "currency", "ilsValue", "relatedAccountId", "occurredAt", "note"] as const;

function pickState(source: ChangeState, fields: readonly string[]) {
  return Object.fromEntries(fields.map((field) => [field, source[field] ?? null]));
}

export function accountState(source: ChangeState) {
  return pickState(source, accountFields);
}

export function assetState(source: ChangeState) {
  return pickState(source, assetFields);
}

export function wealthFlowState(source: ChangeState) {
  return pickState(source, wealthFlowFields);
}

export function changedFields(before: ChangeState, after: ChangeState) {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter((field) => !Object.is(before[field], after[field]));
}

function entityId(before: ChangeState | null, after: ChangeState | null) {
  const value = after?.id ?? before?.id;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function buildEntityEvent(
  eventType: ChangeEventType,
  entityType: "account" | "asset" | "wealth_flow",
  before: ChangeState | null,
  after: ChangeState | null,
  metadata: ChangeState | null = null,
): ChangeEvent | null {
  const fields = before && after ? changedFields(before, after) : null;
  if (fields && fields.length === 0) return null;
  return { eventType, entityType, entityId: entityId(before, after), changedFields: fields, before, after, metadata };
}

export function wealthFlowChangeEvent(eventType: Extract<ChangeEventType, `wealth_flow.${string}`>, beforeSource: ChangeState | null, afterSource: ChangeState | null) {
  return buildEntityEvent(eventType, "wealth_flow", beforeSource ? wealthFlowState(beforeSource) : null, afterSource ? wealthFlowState(afterSource) : null);
}

export function accountChangeEvent(
  eventType: Extract<ChangeEventType, `account.${string}`>,
  beforeSource: ChangeState | null,
  afterSource: ChangeState | null,
  metadata: ChangeState | null = null,
) {
  return buildEntityEvent(eventType, "account", beforeSource ? accountState(beforeSource) : null, afterSource ? accountState(afterSource) : null, metadata);
}

export function assetChangeEvent(
  eventType: Extract<ChangeEventType, `asset.${string}`>,
  beforeSource: ChangeState | null,
  afterSource: ChangeState | null,
  metadata: ChangeState | null = null,
) {
  return buildEntityEvent(eventType, "asset", beforeSource ? assetState(beforeSource) : null, afterSource ? assetState(afterSource) : null, metadata);
}

export function backupRestoredEvent(backup: ChangeState): ChangeEvent {
  const data = typeof backup.data === "object" && backup.data !== null && !Array.isArray(backup.data) ? backup.data as ChangeState : {};
  const count = (value: unknown) => Array.isArray(value) ? value.length : 0;
  return {
    eventType: "backup.restored",
    entityType: "backup",
    entityId: null,
    changedFields: null,
    before: null,
    after: null,
    metadata: {
      schema: backup.schema ?? null,
      version: backup.version ?? null,
      exportedAt: backup.exportedAt ?? null,
      accountCount: count(data.accounts),
      holdingCount: count(data.holdings),
      snapshotCount: count(data.snapshots),
      wealthFlowCount: count(data.wealthFlows),
    },
  };
}
