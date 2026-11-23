import type { getDb } from ".";
import type { ChangeEvent } from "../lib/change-log";
import { changeLog } from "./schema";

type Db = Awaited<ReturnType<typeof getDb>>;

const serialize = (value: unknown) => value == null ? null : JSON.stringify(value);

export async function appendChangeLog(db: Db, ownerEmail: string, event: ChangeEvent | null) {
  if (!event) return;
  await changeLogInsert(db, ownerEmail, event);
}

export function changeLogInsert(db: Db, ownerEmail: string, event: ChangeEvent) {
  return db.insert(changeLog).values({
    ownerEmail,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    changedFieldsJson: serialize(event.changedFields),
    beforeJson: serialize(event.before),
    afterJson: serialize(event.after),
    metadataJson: serialize(event.metadata),
  });
}

export function changeLogInsertValues(ownerEmail: string, event: ChangeEvent) {
  return {
    ownerEmail,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    changedFieldsJson: serialize(event.changedFields),
    beforeJson: serialize(event.before),
    afterJson: serialize(event.after),
    metadataJson: serialize(event.metadata),
  };
}
