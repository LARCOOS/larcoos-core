import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { randomUUID } from "crypto";
import { getAuthenticatedActor } from "@/src/kernel/session";
import { authorizeOrganizationAccess, requireCompletedRecordMembershipEditPermission, requireEditReason } from "@/src/kernel/authorization";
import { recordCompletedRecordCorrection } from "@/src/kernel/audit";

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


async function ensureSourcePallets(truckload: {
  id: number;
  code: string;
  pallets: number;
}) {
  const existingPallets =
    await db.orm.public.Pallet
      .where({
        truckloadId: truckload.id,
      })
      .all();

  const existingNumbers = new Set(
    existingPallets.map(
      (pallet) => pallet.palletNumber
    )
  );

  let created = 0;

  for (
    let palletNumber = 1;
    palletNumber <= truckload.pallets;
    palletNumber += 1
  ) {
    if (existingNumbers.has(palletNumber)) {
      continue;
    }

    const code =
      `${truckload.code}-P${String(
        palletNumber
      ).padStart(2, "0")}`;

    await db.orm.public.Pallet.create({
      code,
      truckloadId: truckload.id,
      palletNumber,
      status: "Pending",
      palletType: "SOURCE",
      processingMode: null,
      verificationLevel: "MANIFEST_ONLY",
      processingCompleted: false,
      manifestReady: false,
      processedPieces: 0,
    });

    created += 1;
  }

  return {
    created,
    expected: truckload.pallets,
    total:
      existingPallets.length + created,
  };
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

    const { membership } = await authorizeOrganizationAccess({
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
    const operationCheckIns = receiving
      ? await db.orm.public.TruckloadOperationCheckIn
          .where({ receivingId: receiving.id })
          .orderBy((checkIn) =>
            checkIn.checkedInAt.asc()
          )
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
      currentActorId: actor.id,
      operationCheckIns,

      permissions: {
        canEditCompletedRecords:
          membership.canEditCompletedRecords,
      },
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

    const { membership } = await authorizeOrganizationAccess({
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
    // TRUCKLOAD OPERATION CHECK-IN
    // =========================================================

    if (action === "check-in") {
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
              "Truck must be received before operation check-in",
          },
          { status: 409 }
        );
      }

      const role = String(
        body.role ?? ""
      ).trim();

      const notes =
        String(
          body.notes ?? ""
        ).trim() || null;

      if (!role) {
        return NextResponse.json(
          {
            success: false,
            error: "Role is required",
          },
          { status: 400 }
        );
      }

      const actorCheckIns =
        await db.orm.public.TruckloadOperationCheckIn
          .where({
            receivingId: receiving.id,
            actorId,
          })
          .all();

      const activeCheckIn =
        actorCheckIns.find(
          (checkIn) =>
            !checkIn.checkedOutAt
        );

      if (activeCheckIn) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Actor is already checked in to this truckload operation",
            operationCheckIn:
              activeCheckIn,
          },
          { status: 409 }
        );
      }

      const now =
        new Date().toISOString();

      const operationCheckIn =
        await db.orm.public.TruckloadOperationCheckIn.create({
          receivingId: receiving.id,
          actorId,
          role,
          checkedInAt: now,
          notes,
        });

      await createKernelEvent({
        eventType:
          "TRUCKLOAD_WORKER_CHECKED_IN",
        truckload,
        actorId,

        payload: {
          operationCheckInId:
            operationCheckIn.id,
          receivingId:
            receiving.id,
          role,
          checkedInAt: now,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        action: "check-in",
        operationCheckIn,
      });
    }

    // =========================================================
    // TRUCKLOAD OPERATION CHECK-OUT
    // =========================================================

    if (action === "check-out") {
      const receiving =
        await db.orm.public.TruckReceiving
          .where({
            truckloadId: truckload.id,
          })
          .first();

      if (!receiving) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Receiving operation not found",
          },
          { status: 404 }
        );
      }

      const actorCheckIns =
        await db.orm.public.TruckloadOperationCheckIn
          .where({
            receivingId: receiving.id,
            actorId,
          })
          .all();

      const activeCheckIn =
        actorCheckIns.find(
          (checkIn) =>
            !checkIn.checkedOutAt
        );

      if (!activeCheckIn) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Actor is not checked in to this truckload operation",
          },
          { status: 409 }
        );
      }

      const now =
        new Date().toISOString();

      const operationCheckIn =
        await db.orm.public.TruckloadOperationCheckIn
          .where({
            id: activeCheckIn.id,
          })
          .update({
            checkedOutAt: now,
          });

      if (!operationCheckIn) {
        throw new Error(
          "Truckload operation check-out could not be saved"
        );
      }

      await createKernelEvent({
        eventType:
          "TRUCKLOAD_WORKER_CHECKED_OUT",
        truckload,
        actorId,

        payload: {
          operationCheckInId:
            operationCheckIn.id,
          receivingId:
            receiving.id,
          role:
            operationCheckIn.role,
          checkedInAt:
            operationCheckIn.checkedInAt,
          checkedOutAt: now,
        },
      });

      return NextResponse.json({
        success: true,
        action: "check-out",
        operationCheckIn,
      });
    }

    // =========================================================
    // SAVE UNLOADING SETUP
    // =========================================================

    if (action === "save-unloading-setup") {
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
              "Truck must be received before unloading setup can be saved",
          },
          { status: 409 }
        );
      }

      if (receiving.unloadingStartedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unloading setup cannot be changed after unloading starts",
          },
          { status: 409 }
        );
      }

      const forkliftUsed =
        body.forkliftUsed === true;

      const forkliftName =
        forkliftUsed
          ? String(body.forkliftName ?? "").trim() || null
          : null;

      const dockDoor =
        String(body.dockDoor ?? "").trim() || null;

      const forkliftConfigurationChanged =
        receiving.forkliftUsed !== forkliftUsed ||
        (receiving.forkliftName ?? null) !== forkliftName;

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update({
            forkliftUsed,
            forkliftName,
            dockDoor,

            ...(forkliftConfigurationChanged
              ? {
                  forkliftSafetyCheckedAt: null,
                  forkliftSafetyActorId: null,
                  forkliftSafetyNotes: null,
                }
              : {}),
          });

      if (!updatedReceiving) {
        throw new Error(
          "Unloading setup could not be saved"
        );
      }

      await createKernelEvent({
        eventType: "UNLOADING_SETUP_SAVED",
        truckload,
        actorId,
        payload: {
          forkliftUsed,
          forkliftName,
          dockDoor,
          forkliftSafetyReset:
            forkliftConfigurationChanged,
        },
      });

      return NextResponse.json({
        success: true,
        action: "save-unloading-setup",
        receiving: updatedReceiving,
      });
    }

    // =========================================================    // FORKLIFT SAFETY CHECK
    // =========================================================

    if (action === "forklift-safety-check") {
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
              "Truck must be received before forklift safety check",
          },
          { status: 409 }
        );
      }

      if (receiving.unloadingStartedAt) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Forklift safety check must be completed before unloading starts",
          },
          { status: 409 }
        );
      }

      if (!receiving.forkliftUsed) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Forklift safety check is not required when forklift is not selected",
          },
          { status: 409 }
        );
      }

      const now = new Date().toISOString();
      const notes =
        String(body.notes ?? "").trim() || null;

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update({
            forkliftSafetyCheckedAt: now,
            forkliftSafetyActorId: actorId,
            forkliftSafetyNotes: notes,
          });

      if (!updatedReceiving) {
        throw new Error(
          "Forklift safety check could not be recorded"
        );
      }

      await createKernelEvent({
        eventType: "FORKLIFT_SAFETY_CHECK_COMPLETED",
        truckload,
        actorId,
        payload: {
          checkedAt: now,
          forkliftName: receiving.forkliftName,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        action: "forklift-safety-check",
        receiving: updatedReceiving,
      });
    }

    // =========================================================    // START UNLOADING
    // =========================================================

    if (action === "start-unloading") {
      const sourcePalletRegistration =
        await ensureSourcePallets(truckload);

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

      if (
        receiving.forkliftUsed &&
        !receiving.forkliftSafetyCheckedAt
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Forklift safety check is required before unloading can start",
            requiredAction:
              "FORKLIFT_SAFETY_CHECK",
          },
          { status: 409 }
        );
      }

      const now = new Date().toISOString();

      const forkliftUsed =
        receiving.forkliftUsed;

      const forkliftName =
        receiving.forkliftName ?? null;

      const dockDoor =
        receiving.dockDoor ?? null;

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update({
            unloadingStartedAt: now,
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
    // FINISH UNLOADING
    // =========================================================

    if (action === "finish-unloading") {
      const sourcePalletRegistration =
        await ensureSourcePallets(truckload);

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
            error: "Unloading has not been started",
          },
          { status: 409 }
        );
      }

      if (receiving.unloadingFinishedAt) {
        return NextResponse.json(
          {
            success: false,
            error: "Unloading has already been completed",
          },
          { status: 409 }
        );
      }

      const emptyTrailerEvidence =
        await db.orm.public.EvidenceAsset
          .where({
            organizationId: truckload.organizationId,
            entityType: "TRUCKLOAD",
            entityId: String(truckload.id),
            category: "EMPTY_TRAILER",
            isActive: true,
          })
          .orderBy((asset) => asset.id.desc())
          .first();

      if (!emptyTrailerEvidence) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Empty trailer photo is required before finishing unloading",
            requiredEvidence: "EMPTY_TRAILER",
          },
          { status: 409 }
        );
      }
      const now = new Date();
      const startedAt = new Date(
        receiving.unloadingStartedAt
      );

      const unloadingSeconds = Math.max(
        0,
        Math.floor(
          (now.getTime() - startedAt.getTime()) / 1000
        )
      );

      const finishedAt = now.toISOString();

      const sourcePallets =
        await db.orm.public.Pallet
          .where({
            truckloadId: truckload.id,
            palletType: "SOURCE",
          })
          .all();

      for (const pallet of sourcePallets) {
        if (pallet.status === "Unloaded") {
          continue;
        }

        await db.orm.public.Pallet
          .where({ id: pallet.id })
          .update({
            status: "Unloaded",
          });
      }

      const unloadedCount = truckload.pallets;

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update({
            unloadingFinishedAt: finishedAt,
            unloadingSeconds,
            palletsUnloaded: unloadedCount,
          });

      if (!updatedReceiving) {
        throw new Error(
          "Receiving record could not be completed"
        );
      }

      const workers =
        await db.orm.public.UnloadingWorker
          .where({
            receivingId: receiving.id,
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

        const workSeconds = Math.max(
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
          ? unloadedCount /
            (unloadingSeconds / 3600)
          : null;

      const minutesPerPallet =
        unloadedCount > 0
          ? unloadingMinutes / unloadedCount
          : null;

      await createKernelEvent({
        eventType: "UNLOADING_FINISHED",
        truckload,
        actorId,
        payload: {
          startedAt: receiving.unloadingStartedAt,
          finishedAt,
          unloadingSeconds,
          unloadingMinutes,
          palletsUnloaded: unloadedCount,
          palletsExpected: truckload.pallets,
          palletsPerHour,
          minutesPerPallet,
          forkliftUsed: receiving.forkliftUsed,
          forkliftName: receiving.forkliftName,
          sourcePalletsRegistered:
            sourcePalletRegistration.created,
          completionMode:
            "CONTINUOUS_TRUCK_UNLOADING",
        },
      });

      return NextResponse.json({
        success: true,
        action: "finish-unloading",
        status: "Unloaded",
        receiving: updatedReceiving,
        performance: {
          unloadingSeconds,
          unloadingMinutes: Number(
            unloadingMinutes.toFixed(2)
          ),
          palletsUnloaded: unloadedCount,
          palletsPerHour:
            palletsPerHour === null
              ? null
              : Number(palletsPerHour.toFixed(2)),
          minutesPerPallet:
            minutesPerPallet === null
              ? null
              : Number(minutesPerPallet.toFixed(2)),
        },
      });
    }

    // CORRECT COMPLETED RECEIVING RECORD
    // =========================================================

    if (action === "correct-completed") {
      if (truckload.status !== "Unloaded") {
        return NextResponse.json(
          {
            success: false,
            error: "Only completed unloading records can be corrected with this action",
          },
          { status: 409 }
        );
      }

      requireCompletedRecordMembershipEditPermission(
        membership
      );

      const reason = requireEditReason(body.reason);

      const receiving =
        await db.orm.public.TruckReceiving
          .where({ truckloadId: truckload.id })
          .first();

      if (!receiving) {
        return NextResponse.json(
          {
            success: false,
            error: "Receiving record not found",
          },
          { status: 404 }
        );
      }

      const before = {
        originName: receiving.originName,
        originCity: receiving.originCity,
        originState: receiving.originState,
        originCountry: receiving.originCountry,
        carrierName: receiving.carrierName,
        driverName: receiving.driverName,
        driverPhone: receiving.driverPhone,
        truckNumber: receiving.truckNumber,
        trailerNumber: receiving.trailerNumber,
        distanceMiles: receiving.distanceMiles,
        freightCost: receiving.freightCost === null ? null : String(receiving.freightCost),
        costPerMile: receiving.costPerMile === null ? null : String(receiving.costPerMile),
        costPerPallet: receiving.costPerPallet === null ? null : String(receiving.costPerPallet),
        forkliftUsed: receiving.forkliftUsed,
        forkliftName: receiving.forkliftName,
        dockDoor: receiving.dockDoor,
        notes: receiving.notes,
      };

      const textOrNull = (value: unknown) => {
        if (value === undefined) return undefined;
        const normalized = String(value ?? "").trim();
        return normalized || null;
      };

      const optionalInteger = (value: unknown) => {
        if (value === undefined) return undefined;
        if (value === null || value === "") return null;
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new Error("distanceMiles must be a non-negative integer");
        }
        return parsed;
      };

      const optionalDecimal = (value: unknown) => {
        if (value === undefined) return undefined;
        if (value === null || value === "") return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error("Cost values must be non-negative numbers");
        }
        return String(parsed);
      };

      const changes = {
        originName: textOrNull(body.originName),
        originCity: textOrNull(body.originCity),
        originState: textOrNull(body.originState),
        originCountry: textOrNull(body.originCountry),
        carrierName: textOrNull(body.carrierName),
        driverName: textOrNull(body.driverName),
        driverPhone: textOrNull(body.driverPhone),
        truckNumber: textOrNull(body.truckNumber),
        trailerNumber: textOrNull(body.trailerNumber),
        distanceMiles: optionalInteger(body.distanceMiles),
        freightCost: optionalDecimal(body.freightCost),
        costPerMile: optionalDecimal(body.costPerMile),
        costPerPallet: optionalDecimal(body.costPerPallet),
        forkliftUsed: body.forkliftUsed === undefined ? undefined : Boolean(body.forkliftUsed),
        forkliftName: textOrNull(body.forkliftName),
        dockDoor: textOrNull(body.dockDoor),
        notes: textOrNull(body.notes),
      };

      const updateData = Object.fromEntries(
        Object.entries(changes).filter(
          ([, value]) => value !== undefined
        )
      );

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "At least one correction field is required",
          },
          { status: 400 }
        );
      }

      const hasActualChanges = Object.entries(updateData).some(
        ([key, value]) => {
          const currentValue =
            before[key as keyof typeof before];

          return String(currentValue ?? "") !== String(value ?? "");
        }
      );

      if (!hasActualChanges) {
        return NextResponse.json(
          {
            success: false,
            error: "No changes detected",
          },
          { status: 400 }
        );
      }

      const updatedReceiving =
        await db.orm.public.TruckReceiving
          .where({ id: receiving.id })
          .update(updateData);

      if (!updatedReceiving) {
        throw new Error("Receiving correction could not be saved");
      }

      const after = {
        originName: updatedReceiving.originName,
        originCity: updatedReceiving.originCity,
        originState: updatedReceiving.originState,
        originCountry: updatedReceiving.originCountry,
        carrierName: updatedReceiving.carrierName,
        driverName: updatedReceiving.driverName,
        driverPhone: updatedReceiving.driverPhone,
        truckNumber: updatedReceiving.truckNumber,
        trailerNumber: updatedReceiving.trailerNumber,
        distanceMiles: updatedReceiving.distanceMiles,
        freightCost: updatedReceiving.freightCost === null ? null : String(updatedReceiving.freightCost),
        costPerMile: updatedReceiving.costPerMile === null ? null : String(updatedReceiving.costPerMile),
        costPerPallet: updatedReceiving.costPerPallet === null ? null : String(updatedReceiving.costPerPallet),
        forkliftUsed: updatedReceiving.forkliftUsed,
        forkliftName: updatedReceiving.forkliftName,
        dockDoor: updatedReceiving.dockDoor,
        notes: updatedReceiving.notes,
      };

      await recordCompletedRecordCorrection({
        actor,
        entity: {
          organizationId: truckload.organizationId,
          locationId: truckload.locationId,
          entityType: "TRUCKLOAD",
          entityId: truckload.id,
          entityCode: truckload.code,
        },
        recordType: "TRUCK_RECEIVING",
        reason,
        before,
        after,
        metadata: {
          receivingId: receiving.id,
          truckloadStatus: truckload.status,
        },
      });

      return NextResponse.json({
        success: true,
        action: "correct-completed",
        status: truckload.status,
        receiving: updatedReceiving,
        audit: {
          recorded: true,
          reason,
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
          process.env.NODE_ENV === "development" && error instanceof Error ? `Receiving operation failed: ${error.message}` : "Receiving operation failed",
      },
      { status: 500 }
    );
  }
}
