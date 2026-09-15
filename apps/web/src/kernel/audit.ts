import { randomUUID } from "crypto";
import { db } from "@/src/prisma/db";
import type { AuthorizedActor } from "./authorization";

type AuditedEntity = {
  organizationId: number | null;
  locationId: number | null;

  entityType: string;
  entityId: string | number;
  entityCode?: string | null;
};

type CompletedRecordCorrectionInput = {
  actor: AuthorizedActor;
  entity: AuditedEntity;

  recordType: string;
  reason: string;

  before: Record<string, unknown>;
  after: Record<string, unknown>;

  metadata?: Record<string, unknown>;
};

function makeAuditEventId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export async function recordCompletedRecordCorrection({
  actor,
  entity,
  recordType,
  reason,
  before,
  after,
  metadata,
}: CompletedRecordCorrectionInput) {
  const occurredAt = new Date().toISOString();

  const payload = {
    auditVersion: "1.0",

    correctionType: "COMPLETED_RECORD_CORRECTION",

    recordType,

    reason,

    authorizedBy: {
      actorId: actor.id,
      actorCode: actor.code,
      displayName: actor.displayName,
      systemRole: actor.systemRole,
    },

    before,
    after,

    metadata: metadata ?? null,

    occurredAt,
  };

  const event =
    await db.orm.public.KernelEvent.create({
      eventId: makeAuditEventId(
        "COMPLETED_RECORD_CORRECTED"
      ),

      eventType:
        "COMPLETED_RECORD_CORRECTED",

      organizationId:
        entity.organizationId,

      locationId:
        entity.locationId,

      actorId: actor.id,

      entityType:
        entity.entityType,

      entityId:
        String(entity.entityId),

      entityCode:
        entity.entityCode ?? null,

      source: "LARCOOS",

      payload: JSON.stringify(payload),
    });

  if (!event) {
    throw new Error(
      "Kernel audit event could not be created"
    );
  }

  return event;
}