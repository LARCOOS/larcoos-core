import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { randomUUID } from "crypto";
import { getAuthenticatedActor } from "@/src/kernel/session";
import { authorizeOrganizationAccess } from "@/src/kernel/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkerInput = {
  actorId?: number | null;
  workerName: string;
  role: string;
  notes?: string | null;
};

function makeEventId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function createKernelEvent({
  eventType,
  truckload,
  actorId,
  payload,
}: {
  eventType: string;
  truckload: {
    id: number;
    code: string;
    organizationId: number | null;
    locationId: number | null;
  };
  actorId?: number | null;
  payload?: Record<string, unknown>;
}) {
  return db.orm.public.KernelEvent.create({
    eventId: makeEventId(eventType),
    eventType,

    organizationId: truckload.organizationId,
    locationId: truckload.locationId,
    actorId: actorId ?? null,

    entityType: "TRUCKLOAD",
    entityId: String(truckload.id),
    entityCode: truckload.code,

    source: "LARCOOS",

    payload: payload
      ? JSON.stringify(payload)
      : null,
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const truckloadCode = String(
      searchParams.get("truckloadCode") ?? ""
    ).trim();

    if (!truckloadCode) {
      return NextResponse.json(
        {
          success: false,
          error: "Truckload code is required",
        },
        { status: 400 }
      );
    }

    const truckload =
      await db.orm.public.Truckload
        .where({ code: truckloadCode })
        .first();

    if (!truckload) {
      return NextResponse.json(
        {
          success: false,
          error: "Truckload not found",
        },
        { status: 404 }
      );
    }

    if (!truckload.organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Truckload has no organization",
        },
        { status: 409 }
      );
    }

    const actor = await getAuthenticatedActor();

    await authorizeOrganizationAccess({
      actorId: actor.id,
      organizationId: truckload.organizationId,
    });

    const receiving =
      await db.orm.public.TruckReceiving
        .where({ truckloadId: truckload.id })
        .first();

    const workers = receiving
      ? await db.orm.public.UnloadingWorker
          .where({ receivingId: receiving.id })
          .all()
      : [];

    return NextResponse.json({
      success: true,

      truckload: {
        id: truckload.id,
        code: truckload.code,
        status: truckload.status,
        pallets: truckload.pallets,
        freight: Number(truckload.freight),
      },

      receiving,
      workers,
    });
  } catch (error) {
    console.error(
      "GET /api/receiving failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to load receiving operation",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const action = String(
      body.action ?? ""
    ).trim();

    const truckloadCode = String(
      body.truckloadCode ?? ""
    ).trim();

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: "Action is required",
        },
        { status: 400 }
      );
    }

    if (!truckloadCode) {
      return NextResponse.json(
        {
          success: false,
          error: "Truckload code is required",
        },
        { status: 400 }
      );
    }

    const truckload =
      await db.orm.public.Truckload
        .where({ code: truckloadCode })
        .first();

    if (!truckload) {
      return NextResponse.json(
        {
          success: false,
          error: "Truckload not found",
        },
        { status: 404 }
      );
    }

    if (!truckload.organizationId) {
      return NextResponse.json({ success: false, error: "Truckload has no organization" }, { status: 409 });
    }

    const actor = await getAuthenticatedActor();

    await authorizeOrganizationAccess({
      actorId: actor.id,
      organizationId: truckload.organizationId,
    });

    const actorId = actor.id;

    // =========================================================
    // RECEIVE TRUCK
    // =========================================================

    if (action === "receive") {
      const existing =
        await db.orm.public.TruckReceiving
          .where({
            truckloadId: truckload.id,
          })
          .first();

      if (existing?.receivedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Truck has already been received",
          },
          { status: 409 }
        );
      }

      const now = new Date().toISOString();

      const distanceMiles =
        body.distanceMiles === null ||
        body.distanceMiles === undefined ||
        body.distanceMiles === ""
          ? null
          : Number(body.distanceMiles);

      if (
        distanceMiles !== null &&
        (!Number.isFinite(distanceMiles) ||
          distanceMiles < 0)
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "distanceMiles must be a valid non-negative number",
          },
          { status: 400 }
        );
      }

      const freightCost =
        body.freightCost === null ||
        body.freightCost === undefined ||
        body.freightCost === ""
          ? Number(truckload.freight)
          : Number(body.freightCost);

      if (
        !Number.isFinite(freightCost) ||
        freightCost < 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "freightCost must be a valid non-negative number",
          },
          { status: 400 }
        );
      }

      const costPerMile =
        distanceMiles !== null &&
        distanceMiles > 0
          ? freightCost / distanceMiles
          : null;

      const costPerPallet =
        truckload.pallets > 0
          ? freightCost / truckload.pallets
          : null;

      const receivingData = {
        receivedAt: now,

        originName:
          String(
            body.originName ?? ""
          ).trim() || null,

        originCity:
          String(
            body.originCity ?? ""
          ).trim() || null,

        originState:
          String(
            body.originState ?? ""
          ).trim() || null,

        originCountry:
          String(
            body.originCountry ?? ""
          ).trim() || null,

        carrierName:
          String(
            body.carrierName ?? ""
          ).trim() || null,

        driverName:
          String(
            body.driverName ?? ""
          ).trim() || null,

        driverPhone:
          String(
            body.driverPhone ?? ""
          ).trim() || null,

        truckNumber:
          String(
            body.truckNumber ?? ""
          ).trim() || null,

        trailerNumber:
          String(
            body.trailerNumber ?? ""
          ).trim() || null,

        distanceMiles,

        freightCost: String(freightCost),

        costPerMile:
          costPerMile === null
            ? null
            : String(costPerMile),

        costPerPallet:
          costPerPallet === null
            ? null
            : String(costPerPallet),

        palletsExpected: truckload.pallets,
      };

      let savedReceiving;

      if (existing) {
        savedReceiving =
          await db.orm.public.TruckReceiving
            .where({ id: existing.id })
            .update(receivingData);
      } else {
        savedReceiving =
          await db.orm.public.TruckReceiving.create({
            truckloadId: truckload.id,
            ...receivingData,
            palletsUnloaded: 0,
            forkliftUsed: false,
          });
      }

      if (!savedReceiving) {
        throw new Error(
          "Receiving record could not be saved"
        );
      }

      await db.orm.public.Truckload
        .where({ id: truckload.id })
        .update({
          status: "Received",
        });

      await createKernelEvent({
        eventType: "TRUCK_RECEIVED",
        truckload,
        actorId,

        payload: {
          receivedAt: now,

          originName:
            savedReceiving.originName,

          originCity:
            savedReceiving.originCity,

          originState:
            savedReceiving.originState,

          originCountry:
            savedReceiving.originCountry,

          carrierName:
            savedReceiving.carrierName,

          driverName:
            savedReceiving.driverName,

          truckNumber:
            savedReceiving.truckNumber,

          trailerNumber:
            savedReceiving.trailerNumber,

          distanceMiles,
          freightCost,
          costPerMile,
          costPerPallet,

          palletsExpected:
            truckload.pallets,
        },
      });

      return NextResponse.json({
        success: true,
        action: "receive",
        status: "Received",

        receiving: savedReceiving,

        metrics: {
          distanceMiles,
          freightCost,
          costPerMile,
          costPerPallet,
        },
      });
    }

    // =========================================================
    // START UNLOADING
    // =========================================================

    if (action === "start-unloading") {
      const receiving =
        await db.orm.public.TruckReceiving
          .where({
            truckloadId: truckload.id,
          })
          .first();

      if (!receiving?.receivedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Truck must be received before unloading can start",
          },
          { status: 409 }
        );
      }

      if (receiving.unloadingFinishedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unloading has already been completed",
          },
          { status: 409 }
        );
      }

      if (receiving.unloadingStartedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unloading timer is already running",
          },
          { status: 409 }
        );
      }

      const now = new Date().toISOString();

      const forkliftUsed =
        body.forkliftUsed === true;

      const forkliftName =
        String(
          body.forkliftName ?? ""
        ).trim() || null;

      const dockDoor =
        String(
          body.dockDoor ?? ""
        ).trim() || null;

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update({
            unloadingStartedAt: now,
            forkliftUsed,
            forkliftName,
            dockDoor,
          });

      if (!updatedReceiving) {
        throw new Error(
          "Receiving record could not start unloading"
        );
      }

      const workers = Array.isArray(
        body.workers
      )
        ? (body.workers as WorkerInput[])
        : [];

      let workersCreated = 0;

      for (const worker of workers) {
        const workerName = String(
          worker.workerName ?? ""
        ).trim();

        const role = String(
          worker.role ?? ""
        ).trim();

        if (!workerName || !role) {
          continue;
        }

        const existingWorker =
          await db.orm.public.UnloadingWorker
            .where({
              receivingId: receiving.id,
              workerName,
              role,
            })
            .first();

        if (existingWorker) {
          continue;
        }

        const workerActorId =
          worker.actorId === null ||
          worker.actorId === undefined
            ? null
            : Number(worker.actorId);

        const createdWorker =
          await db.orm.public.UnloadingWorker.create({
            receivingId: receiving.id,

            actorId: workerActorId,

            workerName,
            role,

            startedAt: now,

            notes:
              String(
                worker.notes ?? ""
              ).trim() || null,
          });

        if (createdWorker) {
          workersCreated += 1;
        }
      }

      await db.orm.public.Truckload
        .where({ id: truckload.id })
        .update({
          status: "Unloading",
        });

      await createKernelEvent({
        eventType: "UNLOADING_STARTED",
        truckload,
        actorId,

        payload: {
          startedAt: now,

          forkliftUsed,
          forkliftName,
          dockDoor,

          workers: workers.map(
            (worker) => ({
              workerName:
                worker.workerName,

              role: worker.role,

              actorId:
                worker.actorId ?? null,
            })
          ),

          palletsExpected:
            truckload.pallets,
        },
      });

      return NextResponse.json({
        success: true,
        action: "start-unloading",
        status: "Unloading",

        receiving:
          updatedReceiving,

        workersCreated,
      });
    }

    // =========================================================
    // PALLET UNLOADED
    // =========================================================

    if (action === "pallet-unloaded") {
      const receiving =
        await db.orm.public.TruckReceiving
          .where({
            truckloadId: truckload.id,
          })
          .first();

      if (!receiving?.unloadingStartedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unloading must be started first",
          },
          { status: 409 }
        );
      }

      if (receiving.unloadingFinishedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unloading has already been completed",
          },
          { status: 409 }
        );
      }

      const palletNumber = Number(
        body.palletNumber
      );

      if (
        !Number.isInteger(palletNumber) ||
        palletNumber < 1 ||
        palletNumber > truckload.pallets
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid pallet number",
          },
          { status: 400 }
        );
      }

      const pallet =
        await db.orm.public.Pallet
          .where({
            truckloadId:
              truckload.id,

            palletNumber,
          })
          .first();

      if (!pallet) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Pallet record not found",
          },
          { status: 404 }
        );
      }

      if (pallet.status === "Unloaded") {
        return NextResponse.json({
          success: true,
          action: "pallet-unloaded",
          alreadyUnloaded: true,
          pallet,

          palletsUnloaded:
            receiving.palletsUnloaded,

          palletsExpected:
            truckload.pallets,
        });
      }

      const updatedPallet =
        await db.orm.public.Pallet
          .where({ id: pallet.id })
          .update({
            status: "Unloaded",
          });

      if (!updatedPallet) {
        throw new Error(
          "Pallet could not be updated"
        );
      }

      const pallets =
        await db.orm.public.Pallet
          .where({
            truckloadId:
              truckload.id,
          })
          .all();

      const unloadedCount =
        pallets.filter(
          (record) =>
            record.status === "Unloaded"
        ).length;

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update({
            palletsUnloaded:
              unloadedCount,
          });

      if (!updatedReceiving) {
        throw new Error(
          "Receiving pallet count could not be updated"
        );
      }

      await createKernelEvent({
        eventType: "PALLET_UNLOADED",
        truckload,
        actorId,

        payload: {
          palletId:
            updatedPallet.id,

          palletCode:
            updatedPallet.code,

          palletNumber,

          palletsUnloaded:
            unloadedCount,

          palletsExpected:
            truckload.pallets,
        },
      });

      return NextResponse.json({
        success: true,
        action: "pallet-unloaded",

        pallet: updatedPallet,

        palletsUnloaded:
          updatedReceiving.palletsUnloaded,

        palletsExpected:
          truckload.pallets,
      });
    }

    // =========================================================
    // FINISH UNLOADING
    // =========================================================

    if (action === "finish-unloading") {
      const receiving =
        await db.orm.public.TruckReceiving
          .where({
            truckloadId: truckload.id,
          })
          .first();

      if (!receiving?.unloadingStartedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unloading has not been started",
          },
          { status: 409 }
        );
      }

      if (receiving.unloadingFinishedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unloading has already been completed",
          },
          { status: 409 }
        );
      }

      const pallets =
        await db.orm.public.Pallet
          .where({
            truckloadId:
              truckload.id,
          })
          .all();

      const unloadedPallets =
        pallets.filter(
          (pallet) =>
            pallet.status === "Unloaded"
        );

      if (
        unloadedPallets.length !==
        truckload.pallets
      ) {
        return NextResponse.json(
          {
            success: false,

            error:
              "All pallets must be unloaded before finishing",

            palletsExpected:
              truckload.pallets,

            palletsUnloaded:
              unloadedPallets.length,

            remaining:
              truckload.pallets -
              unloadedPallets.length,
          },
          { status: 409 }
        );
      }

      const now = new Date();

      const startedAt = new Date(
        receiving.unloadingStartedAt
      );

      const unloadingSeconds =
        Math.max(
          0,
          Math.floor(
            (now.getTime() -
              startedAt.getTime()) /
              1000
          )
        );

      const finishedAt =
        now.toISOString();

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update({
            unloadingFinishedAt:
              finishedAt,

            unloadingSeconds,

            palletsUnloaded:
              unloadedPallets.length,
          });

      if (!updatedReceiving) {
        throw new Error(
          "Receiving record could not be completed"
        );
      }

      const workers =
        await db.orm.public.UnloadingWorker
          .where({
            receivingId:
              receiving.id,
          })
          .all();

      for (const worker of workers) {
        if (worker.finishedAt) {
          continue;
        }

        const workerStartedAt =
          worker.startedAt
            ? new Date(worker.startedAt)
            : startedAt;

        const workSeconds =
          Math.max(
            0,
            Math.floor(
              (now.getTime() -
                workerStartedAt.getTime()) /
                1000
            )
          );

        await db.orm.public.UnloadingWorker
          .where({ id: worker.id })
          .update({
            finishedAt,
            workSeconds,
          });
      }

      await db.orm.public.Truckload
        .where({ id: truckload.id })
        .update({
          status: "Unloaded",
        });

      const unloadingMinutes =
        unloadingSeconds / 60;

      const palletsPerHour =
        unloadingSeconds > 0
          ? unloadedPallets.length /
            (unloadingSeconds / 3600)
          : null;

      const minutesPerPallet =
        unloadedPallets.length > 0
          ? unloadingMinutes /
            unloadedPallets.length
          : null;

      await createKernelEvent({
        eventType:
          "UNLOADING_FINISHED",

        truckload,
        actorId,

        payload: {
          startedAt:
            receiving.unloadingStartedAt,

          finishedAt,

          unloadingSeconds,
          unloadingMinutes,

          palletsUnloaded:
            unloadedPallets.length,

          palletsExpected:
            truckload.pallets,

          palletsPerHour,
          minutesPerPallet,

          forkliftUsed:
            receiving.forkliftUsed,

          forkliftName:
            receiving.forkliftName,
        },
      });

      return NextResponse.json({
        success: true,
        action: "finish-unloading",
        status: "Unloaded",

        receiving:
          updatedReceiving,

        performance: {
          unloadingSeconds,

          unloadingMinutes:
            Number(
              unloadingMinutes.toFixed(2)
            ),

          palletsUnloaded:
            unloadedPallets.length,

          palletsPerHour:
            palletsPerHour === null
              ? null
              : Number(
                  palletsPerHour.toFixed(2)
                ),

          minutesPerPallet:
            minutesPerPallet === null
              ? null
              : Number(
                  minutesPerPallet.toFixed(2)
                ),
        },
      });
    }

    // =========================================================
    // UNKNOWN ACTION
    // =========================================================

    return NextResponse.json(
      {
        success: false,
        error:
          `Unknown receiving action: ${action}`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      "POST /api/receiving failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Receiving operation failed",
      },
      { status: 500 }
    );
  }
}
