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

export type AuthorizedOrganizationMembership = {
  id: number;
  organizationId: number;
  actorId: number;

  systemRole: string;

  canEditCompletedRecords: boolean;
  canManageUsers: boolean;
  canApproveFinancials: boolean;
  canManageKernel: boolean;

  isActive: boolean;
};

export type OrganizationAuthorization = {
  actor: AuthorizedActor;
  membership: AuthorizedOrganizationMembership;
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

export async function getOrganizationMembership(
  actorId: number,
  organizationId: number
): Promise<AuthorizedOrganizationMembership> {
  if (
    !Number.isInteger(organizationId) ||
    organizationId <= 0
  ) {
    throw new KernelAuthorizationError(
      "A valid LARCOOS organization is required",
      400
    );
  }

  const membership =
    await db.orm.public.OrganizationMembership
      .where({
        actorId,
        organizationId,
      })
      .first();

  if (!membership) {
    throw new KernelAuthorizationError(
      "Actor does not have access to this organization",
      403
    );
  }

  if (!membership.isActive) {
    throw new KernelAuthorizationError(
      "Organization membership is inactive",
      403
    );
  }

  return {
    id: membership.id,
    organizationId: membership.organizationId,
    actorId: membership.actorId,

    systemRole: membership.systemRole,

    canEditCompletedRecords:
      membership.canEditCompletedRecords,

    canManageUsers:
      membership.canManageUsers,

    canApproveFinancials:
      membership.canApproveFinancials,

    canManageKernel:
      membership.canManageKernel,

    isActive: membership.isActive,
  };
}

export async function authorizeOrganizationAccess({
  actorId,
  organizationId,
}: {
  actorId: number;
  organizationId: number;
}): Promise<OrganizationAuthorization> {
  const actor = await getActorById(actorId);

  const membership =
    await getOrganizationMembership(
      actor.id,
      organizationId
    );

  return {
    actor,
    membership,
  };
}

export function actorHasPermission(
  actor: AuthorizedActor,
  permission: KernelPermission
) {
  return actor[permission] === true;
}

export function membershipHasPermission(
  membership: AuthorizedOrganizationMembership,
  permission: KernelPermission
) {
  return membership[permission] === true;
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

export function requireMembershipPermission(
  membership: AuthorizedOrganizationMembership,
  permission: KernelPermission
) {
  if (
    !membershipHasPermission(
      membership,
      permission
    )
  ) {
    throw new KernelAuthorizationError(
      `Organization membership is not authorized for ${permission}`,
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

export function requireCompletedRecordMembershipEditPermission(
  membership: AuthorizedOrganizationMembership
) {
  requireMembershipPermission(
    membership,
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

/**
 * Compatibility helper.
 *
 * New organization-scoped authorization should use
 * authorizeOrganizationAccess() and OrganizationMembership.
 *
 * This helper remains temporarily available while older
 * LARCOOS modules are migrated away from Actor.organizationId.
 */
export function assertActorOrganizationAccess(
  actor: AuthorizedActor,
  organizationId: number | null
) {
  if (organizationId === null) {
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
  const normalizedReason =
    requireEditReason(reason);

  /*
   * Completed records that belong to an organization
   * MUST be authorized through OrganizationMembership.
   *
   * Actor-level permissions do not grant cross-organization
   * access, including OWNER_ADMIN compatibility permissions.
   */
  if (organizationId !== null) {
    const {
      actor,
      membership,
    } = await authorizeOrganizationAccess({
      actorId,
      organizationId,
    });

    requireCompletedRecordMembershipEditPermission(
      membership
    );

    return {
      actor,
      membership,
      reason: normalizedReason,
    };
  }

  /*
   * Transitional compatibility path for legacy records that
   * genuinely have no organization association yet.
   */
  const actor = await getActorById(actorId);

  requireCompletedRecordEditPermission(actor);

  return {
    actor,
    membership: null,
    reason: normalizedReason,
  };
}