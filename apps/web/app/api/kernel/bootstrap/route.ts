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

    // =========================================================
    // 3. INITIAL ACTOR
    // =========================================================

    let admin = await db.orm.public.Actor
      .where({ code: "LARCO-ADMIN-001" })
      .first();

    if (!admin) {
      admin = await db.orm.public.Actor.create({
        organizationId: ldc.id,
        code: "LARCO-ADMIN-001",
        displayName: "Victor Manuel Orozco Aguilar",
        type: "Owner / Manager",
        isActive: true,
      });
    }

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
    // 5. FIRST KERNEL EVENT
    // =========================================================

    let bootstrapEvent = await db.orm.public.KernelEvent
      .where({ eventId: "KERNEL-BOOTSTRAP-0001" })
      .first();

    if (!bootstrapEvent) {
      bootstrapEvent = await db.orm.public.KernelEvent.create({
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

    // =========================================================
    // RESULT
    // =========================================================

    return NextResponse.json({
      success: true,

      kernel: {
        version: "0.1",
        status: "ACTIVE",
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
    });
  } catch (error) {
    console.error("POST /api/kernel/bootstrap failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to bootstrap LARCOOS Kernel",
      },
      { status: 500 }
    );
  }
}