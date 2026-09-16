import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { getAuthenticatedSession } from "@/src/kernel/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session =
      await getAuthenticatedSession();

    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Authentication required",
        },
        { status: 401 }
      );
    }

    const memberships =
      await db.orm.public.OrganizationMembership
        .where({
          actorId: session.actor.id,
          isActive: true,
        })
        .all();

    const organizations =
      await db.orm.public.Organization
        .where({})
        .all();

    const organizationById = new Map(
      organizations.map((organization) => [
        organization.id,
        organization,
      ])
    );

    const workspaces = memberships
      .map((membership) => {
        const organization =
          organizationById.get(
            membership.organizationId
          );

        if (!organization) {
          return null;
        }

        return {
          membershipId: membership.id,

          organization: {
            id: organization.id,
            code: organization.code,
            name: organization.name,
            type: organization.type,
          },

          role: membership.systemRole,

          permissions: {
            canEditCompletedRecords:
              membership.canEditCompletedRecords,

            canManageUsers:
              membership.canManageUsers,

            canApproveFinancials:
              membership.canApproveFinancials,

            canManageKernel:
              membership.canManageKernel,
          },
        };
      })
      .filter(
        (
          workspace
        ): workspace is NonNullable<
          typeof workspace
        > => workspace !== null
      );

    const primaryWorkspace =
      session.actor.organizationId === null
        ? null
        : workspaces.find(
            (workspace) =>
              workspace.organization.id ===
              session.actor.organizationId
          ) ?? null;

    return NextResponse.json({
      authenticated: true,

      session: {
        expiresAt: session.expiresAt,
      },

      actor: {
        id: session.actor.id,
        code: session.actor.code,
        displayName:
          session.actor.displayName,
      },

      primaryWorkspace,

      workspaces,
    });
  } catch (error) {
    console.error(
      "GET /api/auth/me failed",
      error
    );

    return NextResponse.json(
      {
        authenticated: false,
        error:
          "Unable to resolve authenticated user",
      },
      { status: 500 }
    );
  }
}