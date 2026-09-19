import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { getAuthenticatedActor } from "@/src/kernel/session";
import {
  authorizeOrganizationAccess,
  KernelAuthorizationError,
} from "@/src/kernel/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROCESSING_MODES = [
  "FULL_PROCESSING",
  "PALLET_VERIFICATION",
] as const;

const VERIFICATION_LEVELS = [
  "MANIFEST_ONLY",
  "PALLET_VERIFIED",
  "PHYSICALLY_VERIFIED",
  "FUNCTION_TESTED",
  "SALE_READY",
] as const;

const CONDITIONS = [
  "NEW_SEALED",
  "NEW_OPEN_BOX",
  "USED_LIKE_NEW",
  "USED_GOOD",
  "USED",
  "DAMAGED",
] as const;

const DISPOSITIONS = [
  "SALE_READY",
  "CLEANING",
  "REPAIR",
  "BACKYARD",
  "SALVAGE",
  "DISPOSAL",
] as const;

function makeEventId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function errorResponse(error: unknown, operation: string) {
  if (error instanceof KernelAuthorizationError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  if (
    error instanceof Error &&
    error.message === "Authentication required"
  ) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  console.error(`${operation} failed:`, error);

  return NextResponse.json(
    { success: false, error: `${operation} failed` },
    { status: 500 }
  );
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function optionalMoney(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error("INVALID_MONEY");
  }

  return String(number);
}

function isAllowed(
  value: string,
  allowed: readonly string[]
) {
  return allowed.includes(value);
}

async function getAuthorizedTruckload(
  truckloadCode: string
) {
  const actor = await getAuthenticatedActor();

  const truckload = await db.orm.public.Truckload
    .where({ code: truckloadCode })
    .first();

  if (!truckload) {
    return {
      actor,
      truckload: null,
      membership: null,
    };
  }

  if (!truckload.organizationId) {
    throw new KernelAuthorizationError(
      "Truckload has no organization",
      409
    );
  }

  const { membership } =
    await authorizeOrganizationAccess({
      actorId: actor.id,
      organizationId: truckload.organizationId,
    });

  return {
    actor,
    truckload,
    membership,
  };
}

async function createProcessingEvent({
  eventType,
  truckload,
  actorId,
  entityType = "TRUCKLOAD",
  entityId,
  entityCode,
  payload,
}: {
  eventType: string;
  truckload: {
    id: number;
    code: string;
    organizationId: number | null;
    locationId: number | null;
  };
  actorId: number;
  entityType?: string;
  entityId?: string;
  entityCode?: string | null;
  payload?: Record<string, unknown>;
}) {
  return db.orm.public.KernelEvent.create({
    eventId: makeEventId(eventType),
    eventType,
    organizationId: truckload.organizationId,
    locationId: truckload.locationId,
    actorId,
    entityType,
    entityId: entityId ?? String(truckload.id),
    entityCode: entityCode ?? truckload.code,
    source: "LARCOOS",
    payload: payload ? JSON.stringify(payload) : null,
  });
}

function serializeUnit<
  T extends {
    assignedCost: unknown;
    suggestedPrice: unknown;
    actualListPrice: unknown;
    aiConfidence: unknown;
  }
>(unit: T) {
  return {
    ...unit,
    assignedCost:
      unit.assignedCost === null
        ? null
        : Number(unit.assignedCost),
    suggestedPrice:
      unit.suggestedPrice === null
        ? null
        : Number(unit.suggestedPrice),
    actualListPrice:
      unit.actualListPrice === null
        ? null
        : Number(unit.actualListPrice),
    aiConfidence:
      unit.aiConfidence === null
        ? null
        : Number(unit.aiConfidence),
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

    const {
      truckload,
      membership,
    } = await getAuthorizedTruckload(
      truckloadCode
    );

    if (!truckload) {
      return NextResponse.json(
        {
          success: false,
          error: "Truckload not found",
        },
        { status: 404 }
      );
    }

    const pallets = await db.orm.public.Pallet
      .where({ truckloadId: truckload.id })
      .orderBy((pallet) => pallet.palletNumber.asc())
      .all();

    const units = await db.orm.public.InventoryUnit
      .where({ truckloadId: truckload.id })
      .orderBy((unit) => unit.unitNumber.asc())
      .all();

    return NextResponse.json({
      success: true,

      truckload: {
        id: truckload.id,
        code: truckload.code,
        status: truckload.status,
        organizationId: truckload.organizationId,
        locationId: truckload.locationId,
        expectedPallets: truckload.pallets,
      },

      processing: {
        sourcePallets: pallets.filter(
          (pallet) => pallet.palletType === "SOURCE"
        ).length,

        builtPallets: pallets.filter(
          (pallet) => pallet.palletType === "LDC_BUILT"
        ).length,

        totalUnits: units.length,

        saleReadyUnits: units.filter(
          (unit) => unit.disposition === "SALE_READY"
        ).length,

        repairUnits: units.filter(
          (unit) => unit.disposition === "REPAIR"
        ).length,

        backyardUnits: units.filter(
          (unit) => unit.disposition === "BACKYARD"
        ).length,

        disposalUnits: units.filter(
          (unit) => unit.disposition === "DISPOSAL"
        ).length,
      },

      pallets,

      units: units.map(serializeUnit),

      permissions: {
        canEditCompletedRecords:
          membership?.canEditCompletedRecords ?? false,
      },
    });
  } catch (error) {
    return errorResponse(
      error,
      "GET /api/processing"
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

    const {
      actor,
      truckload,
    } = await getAuthorizedTruckload(
      truckloadCode
    );

    if (!truckload) {
      return NextResponse.json(
        {
          success: false,
          error: "Truckload not found",
        },
        { status: 404 }
      );
    }

    // ========================================================
    // CONFIGURE PALLET
    // ========================================================

    if (action === "configure-pallet") {
      const palletId = Number(body.palletId);

      if (
        !Number.isInteger(palletId) ||
        palletId < 1
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Valid palletId is required",
          },
          { status: 400 }
        );
      }

      const processingMode = String(
        body.processingMode ?? ""
      ).trim();

      if (
        !isAllowed(
          processingMode,
          PROCESSING_MODES
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid processing mode",
          },
          { status: 400 }
        );
      }

      const verificationLevel = String(
        body.verificationLevel ??
          (
            processingMode ===
            "PALLET_VERIFICATION"
              ? "PALLET_VERIFIED"
              : "MANIFEST_ONLY"
          )
      ).trim();

      if (
        !isAllowed(
          verificationLevel,
          VERIFICATION_LEVELS
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid verification level",
          },
          { status: 400 }
        );
      }

      if (
        processingMode ===
          "PALLET_VERIFICATION" &&
        (
          verificationLevel ===
            "PHYSICALLY_VERIFIED" ||
          verificationLevel ===
            "FUNCTION_TESTED" ||
          verificationLevel ===
            "SALE_READY"
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Pallet-only verification cannot certify individual merchandise",
          },
          { status: 409 }
        );
      }

      const pallet =
        await db.orm.public.Pallet
          .where({
            id: palletId,
            truckloadId: truckload.id,
          })
          .first();

      if (!pallet) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Pallet does not belong to this truckload",
          },
          { status: 404 }
        );
      }

      const updatedPallet =
        await db.orm.public.Pallet
          .where({ id: pallet.id })
          .update({
            processingMode,
            verificationLevel,
            processingCompleted: false,
            manifestReady: false,
          });

      if (!updatedPallet) {
        throw new Error(
          "Pallet could not be configured"
        );
      }

      await createProcessingEvent({
        eventType:
          "PALLET_PROCESSING_CONFIGURED",
        truckload,
        actorId: actor.id,
        entityType: "PALLET",
        entityId: String(updatedPallet.id),
        entityCode: updatedPallet.code,
        payload: {
          palletId: updatedPallet.id,
          palletCode: updatedPallet.code,
          palletType:
            updatedPallet.palletType,
          processingMode:
            updatedPallet.processingMode,
          verificationLevel:
            updatedPallet.verificationLevel,
        },
      });

      return NextResponse.json({
        success: true,
        action: "configure-pallet",
        pallet: updatedPallet,
      });
    }

    // ========================================================
    // CREATE INVENTORY UNIT
    // ========================================================

    if (action === "create-unit") {
      const palletId = Number(body.palletId);

      if (
        !Number.isInteger(palletId) ||
        palletId < 1
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Valid palletId is required",
          },
          { status: 400 }
        );
      }

      const pallet =
        await db.orm.public.Pallet
          .where({
            id: palletId,
            truckloadId: truckload.id,
          })
          .first();

      if (!pallet) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Pallet does not belong to this truckload",
          },
          { status: 404 }
        );
      }

      if (
        pallet.processingMode !==
        "FULL_PROCESSING"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Individual units require FULL_PROCESSING",
          },
          { status: 409 }
        );
      }

      const condition = String(
        body.condition ?? ""
      ).trim();

      if (
        condition &&
        !isAllowed(condition, CONDITIONS)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid condition",
          },
          { status: 400 }
        );
      }

      const verificationLevel = String(
        body.verificationLevel ??
          "PHYSICALLY_VERIFIED"
      ).trim();

      if (
        !isAllowed(
          verificationLevel,
          VERIFICATION_LEVELS
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid verification level",
          },
          { status: 400 }
        );
      }

      const disposition = String(
        body.disposition ?? "SALE_READY"
      ).trim();

      if (
        !isAllowed(
          disposition,
          DISPOSITIONS
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid disposition",
          },
          { status: 400 }
        );
      }

      let assignedCost: string | null;
      let suggestedPrice: string | null;
      let actualListPrice: string | null;

      try {
        assignedCost = optionalMoney(
          body.assignedCost
        );

        suggestedPrice = optionalMoney(
          body.suggestedPrice
        );

        actualListPrice = optionalMoney(
          body.actualListPrice
        );
      } catch {
        return NextResponse.json(
          {
            success: false,
            error:
              "Costs and prices must be valid non-negative numbers",
          },
          { status: 400 }
        );
      }

      const existingUnits =
        await db.orm.public.InventoryUnit
          .where({
            truckloadId: truckload.id,
          })
          .all();

      const nextUnitNumber =
        existingUnits.reduce(
          (highest, unit) =>
            Math.max(
              highest,
              unit.unitNumber
            ),
          0
        ) + 1;

      const unitId =
        `${truckload.code}-P${String(
          pallet.palletNumber
        ).padStart(2, "0")}-I${String(
          nextUnitNumber
        ).padStart(4, "0")}`;

      const unit =
        await db.orm.public.InventoryUnit
          .create({
            unitId,

            organizationId:
              truckload.organizationId!,

            truckloadId:
              truckload.id,

            palletId:
              pallet.id,

            sourcePalletId:
              pallet.palletType === "SOURCE"
                ? pallet.id
                : pallet.sourcePalletId,

            unitNumber:
              nextUnitNumber,

            upc:
              optionalText(body.upc),

            sku:
              optionalText(body.sku),

            manufacturer:
              optionalText(
                body.manufacturer
              ),

            brand:
              optionalText(body.brand),

            model:
              optionalText(body.model),

            serialNumber:
              optionalText(
                body.serialNumber
              ),

            title:
              optionalText(body.title),

            description:
              optionalText(
                body.description
              ),

            category:
              optionalText(body.category),

            condition:
              condition || null,

            verificationLevel,

            disposition,

            processingStatus:
              "PROCESSED",

            assignedCost,

            suggestedPrice,

            actualListPrice,

            currency: String(
              body.currency ?? "USD"
            )
              .trim()
              .toUpperCase(),

            aiConfidence: null,
            aiMetadata: null,

            notes:
              optionalText(body.notes),

            processedAt:
              new Date().toISOString(),
          });

      await db.orm.public.Pallet
        .where({ id: pallet.id })
        .update({
          processedPieces:
            pallet.processedPieces + 1,
        });

      await createProcessingEvent({
        eventType:
          "INVENTORY_UNIT_CREATED",
        truckload,
        actorId: actor.id,
        entityType: "ITEM",
        entityId: String(unit.id),
        entityCode: unit.unitId,
        payload: {
          unitId: unit.unitId,
          unitNumber:
            unit.unitNumber,
          palletId:
            pallet.id,
          palletCode:
            pallet.code,
          sourcePalletId:
            unit.sourcePalletId,
          condition:
            unit.condition,
          verificationLevel:
            unit.verificationLevel,
          disposition:
            unit.disposition,
          assignedCost:
            unit.assignedCost === null
              ? null
              : Number(
                  unit.assignedCost
                ),
          suggestedPrice:
            unit.suggestedPrice === null
              ? null
              : Number(
                  unit.suggestedPrice
                ),
        },
      });

      return NextResponse.json(
        {
          success: true,
          action: "create-unit",
          unit: serializeUnit(unit),
        },
        { status: 201 }
      );
    }

    if (action === "complete-pallet") {
      const palletId = Number(body.palletId);

      if (!Number.isInteger(palletId) || palletId <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Valid palletId is required",
          },
          { status: 400 }
        );
      }

      const pallet =
        await db.orm.public.Pallet
          .where({
            id: palletId,
            truckloadId: truckload.id,
          })
          .first();

      if (!pallet) {
        return NextResponse.json(
          {
            success: false,
            error: "Pallet not found",
          },
          { status: 404 }
        );
      }

      if (!pallet.processingMode) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Pallet processing mode must be configured before completion",
          },
          { status: 409 }
        );
      }

      if (pallet.processingCompleted) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Pallet processing is already completed",
          },
          { status: 409 }
        );
      }

      const units =
        await db.orm.public.InventoryUnit
          .where({
            truckloadId: truckload.id,
            palletId: pallet.id,
          })
          .all();

      let finalVerificationLevel: string;

      if (pallet.processingMode === "FULL_PROCESSING") {
        if (units.length === 0) {
          return NextResponse.json(
            {
              success: false,
              error:
                "FULL_PROCESSING requires at least one processed inventory unit",
            },
            { status: 409 }
          );
        }

        const requestedLevel = String(
          body.verificationLevel ??
            "PHYSICALLY_VERIFIED"
        )
          .trim()
          .toUpperCase();

        if (
          ![
            "PHYSICALLY_VERIFIED",
            "FUNCTION_TESTED",
            "SALE_READY",
          ].includes(requestedLevel)
        ) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Invalid completion verification level",
            },
            { status: 400 }
          );
        }

        finalVerificationLevel =
          requestedLevel;
      } else if (
        pallet.processingMode === "PALLET_VERIFICATION"
      ) {
        if (units.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error:
                "PALLET_VERIFICATION cannot contain processed inventory units",
            },
            { status: 409 }
          );
        }

        finalVerificationLevel =
          "PALLET_VERIFIED";
      } else {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unsupported pallet processing mode",
          },
          { status: 409 }
        );
      }

      await db.orm.public.Pallet
        .where({ id: pallet.id })
        .update({
          verificationLevel:
            finalVerificationLevel,
          processingCompleted: true,
          manifestReady: true,
          status: "Processed",
        });

      const completedPallet =
        await db.orm.public.Pallet
          .where({ id: pallet.id })
          .first();

      if (!completedPallet) {
        throw new Error(
          "PALLET_COMPLETION_READ_FAILED"
        );
      }

      await createProcessingEvent({
        eventType:
          "PALLET_PROCESSING_COMPLETED",
        truckload,
        actorId: actor.id,
        entityType: "PALLET",
        entityId:
          String(completedPallet.id),
        entityCode:
          completedPallet.code,
        payload: {
          palletId:
            completedPallet.id,
          palletCode:
            completedPallet.code,
          palletNumber:
            completedPallet.palletNumber,
          palletType:
            completedPallet.palletType,
          processingMode:
            completedPallet.processingMode,
          verificationLevel:
            completedPallet.verificationLevel,
          processedPieces:
            completedPallet.processedPieces,
          inventoryUnitCount:
            units.length,
          processingCompleted:
            completedPallet.processingCompleted,
          manifestReady:
            completedPallet.manifestReady,
        },
      });

      return NextResponse.json({
        success: true,
        action: "complete-pallet",
        pallet: completedPallet,
        inventoryUnitCount:
          units.length,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unsupported processing action",
      },
      { status: 400 }
    );
  } catch (error) {
    return errorResponse(
      error,
      "POST /api/processing"
    );
  }
}
