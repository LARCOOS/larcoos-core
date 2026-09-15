import { db } from "@/src/prisma/db";

export type KernelPermission =
  | "canEditCompletedRecords"
  | "canManageUsers"
  | "canApproveFinancials"
  | "canManageKernel";

export type AuthorizedActor = {
  id: number;
  code: string;
  displayName: string;
  systemRole: string;

  canEditCompletedRecords: boolean;
  canManageUsers: boolean;
  canApproveFinancials: boolean;
  canManageKernel: boolean;

  organizationId: number | null;
  isActive: boolean;
};

export class KernelAuthorizationError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);

    this.name = "KernelAuthorizationError";
    this.status = status;
  }
}

export async function getActorById(
  actorId: number
): Promise<AuthorizedActor> {
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new KernelAuthorizationError(
      "A valid LARCOOS actor is required",
      401
    );
  }

  const actor = await db.orm.public.Actor
    .where({ id: actorId })
    .first();

  if (!actor) {
    throw new KernelAuthorizationError(
      "LARCOOS actor not found",
      401
    );
  }

  if (!actor.isActive) {
    throw new KernelAuthorizationError(
      "LARCOOS actor is inactive",
      403
    );
  }

  return {
    id: actor.id,
    code: actor.code,
    displayName: actor.displayName,
    systemRole: actor.systemRole,

    canEditCompletedRecords:
      actor.canEditCompletedRecords,

    canManageUsers:
      actor.canManageUsers,

    canApproveFinancials:
      actor.canApproveFinancials,

    canManageKernel:
      actor.canManageKernel,

    organizationId: actor.organizationId,
    isActive: actor.isActive,
  };
}

export function actorHasPermission(
  actor: AuthorizedActor,
  permission: KernelPermission
) {
  return actor[permission] === true;
}

export function requirePermission(
  actor: AuthorizedActor,
  permission: KernelPermission
) {
  if (!actorHasPermission(actor, permission)) {
    throw new KernelAuthorizationError(
      `${actor.displayName} is not authorized for ${permission}`,
      403
    );
  }
}

export function requireCompletedRecordEditPermission(
  actor: AuthorizedActor
) {
  requirePermission(
    actor,
    "canEditCompletedRecords"
  );
}

export function requireEditReason(
  reason: unknown
) {
  const normalizedReason = String(
    reason ?? ""
  ).trim();

  if (normalizedReason.length < 5) {
    throw new KernelAuthorizationError(
      "A reason of at least 5 characters is required to edit a completed record",
      400
    );
  }

  return normalizedReason;
}

export function assertActorOrganizationAccess(
  actor: AuthorizedActor,
  organizationId: number | null
) {
  if (organizationId === null) {
    return;
  }

  if (actor.canManageKernel) {
    return;
  }

  if (actor.organizationId !== organizationId) {
    throw new KernelAuthorizationError(
      "Actor does not have access to this organization",
      403
    );
  }
}

export async function authorizeCompletedRecordEdit({
  actorId,
  organizationId,
  reason,
}: {
  actorId: number;
  organizationId: number | null;
  reason: unknown;
}) {
  const actor = await getActorById(actorId);

  requireCompletedRecordEditPermission(actor);

  assertActorOrganizationAccess(
    actor,
    organizationId
  );

  const normalizedReason =
    requireEditReason(reason);

  return {
    actor,
    reason: normalizedReason,
  };
}