import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // =========================================================
    // 1. ORGANIZATION — LDC
    // =========================================================

    let ldc = await db.orm.public.Organization
      .where({ code: "LDC" })
      .first();

    if (!ldc) {
      ldc = await db.orm.public.Organization.create({
        code: "LDC",
        name: "LARCO Distribution Center",
        legalName: "LARCO DISTRIBUTION CENTER LLC",
        type: "Operating Company",
        country: "United States",
        currency: "USD",
        isActive: true,
      });
    }

    if (!ldc) {
      throw new Error(
        "LDC organization could not be initialized."
      );
    }

    // =========================================================
    // 2. LOCATION — ALICE LDC
    // =========================================================

    let aliceLdc = await db.orm.public.Location
      .where({ code: "LDC-ALICE-TX" })
      .first();

    if (!aliceLdc) {
      aliceLdc = await db.orm.public.Location.create({
        organizationId: ldc.id,
        code: "LDC-ALICE-TX",
        name: "Alice Distribution Center",
        type: "Distribution Center",
        city: "Alice",
        stateRegion: "Texas",
        country: "United States",
        timezone: "America/Chicago",
        isActive: true,
      });
    }

    if (!aliceLdc) {
      throw new Error(
        "Alice Distribution Center could not be initialized."
      );
    }

    // =========================================================
    // 3. OWNER / ADMIN ACTOR
    //
    // Operational roles are separate from system authorization.
    //
    // LARCO-ADMIN-001 is the bootstrap owner identity.
    // =========================================================

    const existingAdmin = await db.orm.public.Actor
      .where({ code: "LARCO-ADMIN-001" })
      .first();

    if (!existingAdmin) {
      await db.orm.public.Actor.create({
        organizationId: ldc.id,
        code: "LARCO-ADMIN-001",
        displayName: "Victor Manuel Orozco Aguilar",
        type: "Owner / Manager",

        systemRole: "OWNER_ADMIN",
        canEditCompletedRecords: true,
        canManageUsers: true,
        canApproveFinancials: true,
        canManageKernel: true,

        isActive: true,
      });
    } else {
      await db.orm.public.Actor
        .where({ id: existingAdmin.id })
        .update({
          organizationId: ldc.id,
          type: "Owner / Manager",

          systemRole: "OWNER_ADMIN",
          canEditCompletedRecords: true,
          canManageUsers: true,
          canApproveFinancials: true,
          canManageKernel: true,

          isActive: true,
        });
    }

    // Read the actor again after create/update.
    // This gives the rest of the bootstrap one verified,
    // non-null administrative identity.

    const adminRecord = await db.orm.public.Actor
      .where({ code: "LARCO-ADMIN-001" })
      .first();

    if (!adminRecord) {
      throw new Error(
        "OWNER_ADMIN actor could not be initialized."
      );
    }

    const admin = adminRecord;

    // =========================================================
    // 4. CONNECT EXISTING TRUCKLOADS TO THE KERNEL
    // =========================================================

    const truckloads = await db.orm.public.Truckload.all();

    let connectedTruckloads = 0;

    for (const truckload of truckloads) {
      if (
        truckload.organizationId === ldc.id &&
        truckload.locationId === aliceLdc.id
      ) {
        continue;
      }

      await db.orm.public.Truckload
        .where({ id: truckload.id })
        .update({
          organizationId: ldc.id,
          locationId: aliceLdc.id,
        });

      connectedTruckloads++;
    }

    // =========================================================
    // 5. ORIGINAL KERNEL BOOTSTRAP EVENT
    //
    // Never rewrite the original historical bootstrap event.
    // =========================================================

    let bootstrapEvent = await db.orm.public.KernelEvent
      .where({ eventId: "KERNEL-BOOTSTRAP-0001" })
      .first();

    if (!bootstrapEvent) {
      bootstrapEvent =
        await db.orm.public.KernelEvent.create({
          eventId: "KERNEL-BOOTSTRAP-0001",
          eventType: "KERNEL_BOOTSTRAPPED",

          organizationId: ldc.id,
          locationId: aliceLdc.id,
          actorId: admin.id,

          entityType: "SYSTEM",
          entityId: "LARCOOS",
          entityCode: "LARCOOS-KERNEL",

          source: "LARCOOS",

          payload: JSON.stringify({
            kernelVersion: "0.1",
            organization: ldc.code,
            location: aliceLdc.code,
            initializedBy: admin.code,
            purpose:
              "Initialize the LARCOOS organizational and event kernel.",
          }),
        });
    }

    if (!bootstrapEvent) {
      throw new Error(
        "Kernel bootstrap event could not be initialized."
      );
    }

    // =========================================================
    // 6. KERNEL v0.2 — RBAC INITIALIZATION EVENT
    //
    // This is a new event rather than a modification of the
    // original bootstrap event.
    // =========================================================

    let rbacEvent = await db.orm.public.KernelEvent
      .where({ eventId: "KERNEL-RBAC-0001" })
      .first();

    if (!rbacEvent) {
      rbacEvent =
        await db.orm.public.KernelEvent.create({
          eventId: "KERNEL-RBAC-0001",
          eventType: "KERNEL_RBAC_INITIALIZED",

          organizationId: ldc.id,
          locationId: aliceLdc.id,
          actorId: admin.id,

          entityType: "SYSTEM",
          entityId: "LARCOOS",
          entityCode: "LARCOOS-KERNEL",

          source: "LARCOOS",

          payload: JSON.stringify({
            kernelVersion: "0.2",
            authorizationModel: "RBAC",

            ownerActor: admin.code,
            ownerSystemRole: "OWNER_ADMIN",

            permissions: {
              canEditCompletedRecords: true,
              canManageUsers: true,
              canApproveFinancials: true,
              canManageKernel: true,
            },

            principles: [
              "Operational roles are separate from system authorization.",
              "Completed records are locked for normal employees.",
              "Authorized corrections require a reason.",
              "Authorized corrections preserve before and after values.",
              "Kernel history is append-only.",
            ],
          }),
        });
    }

    if (!rbacEvent) {
      throw new Error(
        "Kernel RBAC event could not be initialized."
      );
    }

    // =========================================================
    // 7. RESULT
    // =========================================================

    return NextResponse.json({
      success: true,

      kernel: {
        version: "0.2",
        status: "ACTIVE",
        authorization: "RBAC",
      },

      organization: {
        id: ldc.id,
        code: ldc.code,
        name: ldc.name,
      },

      location: {
        id: aliceLdc.id,
        code: aliceLdc.code,
        name: aliceLdc.name,
      },

      actor: {
        id: admin.id,
        code: admin.code,
        displayName: admin.displayName,
        systemRole: admin.systemRole,

        permissions: {
          canEditCompletedRecords:
            admin.canEditCompletedRecords,
          canManageUsers:
            admin.canManageUsers,
          canApproveFinancials:
            admin.canApproveFinancials,
          canManageKernel:
            admin.canManageKernel,
        },
      },

      truckloads: {
        found: truckloads.length,
        connectedThisRun: connectedTruckloads,
      },

      bootstrapEvent: {
        id: bootstrapEvent.id,
        eventId: bootstrapEvent.eventId,
        eventType: bootstrapEvent.eventType,
        occurredAt: bootstrapEvent.occurredAt,
      },

      rbacEvent: {
        id: rbacEvent.id,
        eventId: rbacEvent.eventId,
        eventType: rbacEvent.eventType,
        occurredAt: rbacEvent.occurredAt,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/kernel/bootstrap failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to bootstrap LARCOOS Kernel",
      },
      { status: 500 }
    );
  }
}