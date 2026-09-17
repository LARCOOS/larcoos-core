import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireAuthenticatedSession } from "@/src/kernel/session";
import {
  authorizeOrganizationAccess,
  KernelAuthorizationError,
} from "@/src/kernel/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LDC_ORGANIZATION_CODE = "LDC";

const ALLOWED_ENTITY_TYPES = new Set([
  "ORGANIZATION",
  "TRUCKLOAD",
  "PALLET",
  "ITEM",
  "EXPENSE",
  "PAYMENT",
  "CUSTOMS",
  "EMPLOYEE",
  "CUSTOMER",
  "ORDER",
  "DELIVERY",
]);

const ALLOWED_VERIFICATION_STATUSES = new Set([
  "UNVERIFIED",
  "VERIFIED",
  "REJECTED",
  "SUPERSEDED",
]);

type EvidenceCreateBody = {
  entityType?: unknown;
  entityId?: unknown;
  entityCode?: unknown;

  category?: unknown;
  purpose?: unknown;

  locationId?: unknown;
  kernelEventId?: unknown;

  fileType?: unknown;
  mimeType?: unknown;
  originalFilename?: unknown;

  storageKey?: unknown;
  sha256?: unknown;
  sizeBytes?: unknown;

  capturedAt?: unknown;
  source?: unknown;

  verificationStatus?: unknown;
  metadata?: unknown;
  retentionPolicy?: unknown;

  supersededById?: unknown;
};

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
      {
        success: false,
        error: "Authentication required",
      },
      { status: 401 }
    );
  }

  console.error(`${operation} failed:`, error);

  return NextResponse.json(
    {
      success: false,
      error: `${operation} failed`,
    },
    { status: 500 }
  );
}

async function authorizeLdc() {
  const session = await requireAuthenticatedSession();

  const organization =
    await db.orm.public.Organization
      .where({ code: LDC_ORGANIZATION_CODE })
      .first();

  if (!organization || !organization.isActive) {
    throw new KernelAuthorizationError(
      "LDC organization is unavailable",
      404
    );
  }

  const actor = await authorizeOrganizationAccess({
    actorId: session.actor.id,
    organizationId: organization.id,
  });

  return {
    session,
    actor: session.actor,
    organization,
  };
}

function requiredString(
  value: unknown,
  fieldName: string
) {
  const parsed = String(value ?? "").trim();

  if (!parsed) {
    throw new Error(`VALIDATION:${fieldName} is required`);
  }

  return parsed;
}

function optionalString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function optionalPositiveInteger(
  value: unknown,
  fieldName: string
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `VALIDATION:${fieldName} must be a positive integer`
    );
  }

  return parsed;
}

function optionalNonNegativeInteger(
  value: unknown,
  fieldName: string
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      `VALIDATION:${fieldName} must be a non-negative integer`
    );
  }

  return parsed;
}

function optionalTimestamp(
  value: unknown,
  fieldName: string
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `VALIDATION:${fieldName} must be a valid timestamp`
    );
  }

  return date.toISOString();
}

function validationResponse(error: unknown) {
  if (
    error instanceof Error &&
    error.message.startsWith("VALIDATION:")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message.replace(
          "VALIDATION:",
          ""
        ),
      },
      { status: 400 }
    );
  }

  return null;
}

function makeEvidenceId() {
  return `EVIDENCE-${randomUUID()}`;
}

function makeEventId() {
  return `EVIDENCE_UPLOADED-${randomUUID()}`;
}

export async function GET(request: NextRequest) {
  try {
    const { organization } = await authorizeLdc();

    const { searchParams } = new URL(request.url);

    const entityType =
      searchParams.get("entityType")?.trim() || null;

    const entityId =
      searchParams.get("entityId")?.trim() || null;

    const category =
      searchParams.get("category")?.trim() || null;

    if (entityType && !ALLOWED_ENTITY_TYPES.has(entityType)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported entityType",
        },
        { status: 400 }
      );
    }

    let query =
      db.orm.public.EvidenceAsset.where({
        organizationId: organization.id,
        isActive: true,
      });

    if (entityType) {
      query = query.where({
        entityType,
      });
    }

    if (entityId) {
      query = query.where({
        entityId,
      });
    }

    if (category) {
      query = query.where({
        category,
      });
    }

    const evidence = await query
      .orderBy((asset) => asset.id.desc())
      .all();

    return NextResponse.json({
      success: true,
      evidence,
    });
  } catch (error) {
    return errorResponse(
      error,
      "Evidence listing"
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      actor,
      organization,
    } = await authorizeLdc();

    let body: EvidenceCreateBody;

    try {
      body =
        (await request.json()) as EvidenceCreateBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON body",
        },
        { status: 400 }
      );
    }

    try {
      const entityType = requiredString(
        body.entityType,
        "entityType"
      ).toUpperCase();

      if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
        return NextResponse.json(
          {
            success: false,
            error: "Unsupported entityType",
          },
          { status: 400 }
        );
      }

      const entityId = requiredString(
        body.entityId,
        "entityId"
      );

      const entityCode =
        optionalString(body.entityCode);

      const category = requiredString(
        body.category,
        "category"
      ).toUpperCase();

      const purpose =
        optionalString(body.purpose);

      const originalFilename = requiredString(
        body.originalFilename,
        "originalFilename"
      );

      const storageKey = requiredString(
        body.storageKey,
        "storageKey"
      );

      const sha256 = requiredString(
        body.sha256,
        "sha256"
      ).toLowerCase();

      if (!/^[a-f0-9]{64}$/.test(sha256)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "sha256 must be a 64-character hexadecimal SHA-256 hash",
          },
          { status: 400 }
        );
      }

      const verificationStatus =
        requiredString(
          body.verificationStatus ?? "UNVERIFIED",
          "verificationStatus"
        ).toUpperCase();

      if (
        !ALLOWED_VERIFICATION_STATUSES.has(
          verificationStatus
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unsupported verificationStatus",
          },
          { status: 400 }
        );
      }

      const locationId =
        optionalPositiveInteger(
          body.locationId,
          "locationId"
        );

      const kernelEventId =
        optionalPositiveInteger(
          body.kernelEventId,
          "kernelEventId"
        );

      const supersededById =
        optionalPositiveInteger(
          body.supersededById,
          "supersededById"
        );

      const sizeBytes =
        optionalNonNegativeInteger(
          body.sizeBytes,
          "sizeBytes"
        );

      const capturedAt =
        optionalTimestamp(
          body.capturedAt,
          "capturedAt"
        );

      const source =
        optionalString(body.source) ??
        "LARCOOS";

      const retentionPolicy =
        optionalString(body.retentionPolicy) ??
        "BUSINESS_RECORD";

      let metadata: string | null = null;

      if (
        body.metadata !== undefined &&
        body.metadata !== null
      ) {
        metadata =
          typeof body.metadata === "string"
            ? body.metadata
            : JSON.stringify(body.metadata);
      }

      if (locationId !== null) {
        const location =
          await db.orm.public.Location
            .where({
              id: locationId,
              organizationId: organization.id,
            })
            .first();

        if (!location) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Location does not belong to LDC",
            },
            { status: 400 }
          );
        }
      }

      const existingStorageKey =
        await db.orm.public.EvidenceAsset
          .where({ storageKey })
          .first();

      if (existingStorageKey) {
        return NextResponse.json(
          {
            success: false,
            error:
              "storageKey is already registered",
          },
          { status: 409 }
        );
      }

      const evidenceId = makeEvidenceId();

      const evidence =
        await db.orm.public.EvidenceAsset.create({
          evidenceId,

          organizationId:
            organization.id,

          locationId,

          uploadedByActorId:
            actor.id,

          kernelEventId,

          entityType,
          entityId,
          entityCode,

          category,
          purpose,

          fileType:
            optionalString(body.fileType),

          mimeType:
            optionalString(body.mimeType),

          originalFilename,

          storageKey,
          sha256,
          sizeBytes,

          capturedAt,

          source,

          verificationStatus,

          metadata,

          retentionPolicy,

          supersededById,

          isActive: true,
        });

      if (!evidence) {
        throw new Error(
          "Evidence asset could not be created"
        );
      }

      const occurredAt = new Date().toISOString();

      const event =
        await db.orm.public.KernelEvent.create({
          eventId: makeEventId(),

          eventType: "EVIDENCE_UPLOADED",

          organizationId:
            organization.id,

          locationId,

          actorId: actor.id,

          entityType,
          entityId,
          entityCode,

          source: "LARCOOS",

          payload: JSON.stringify({
            evidenceVersion: "1.0",

            evidenceId:
              evidence.evidenceId,

            category,
            purpose,

            originalFilename,
            storageKey,
            sha256,
            sizeBytes,

            mimeType:
              optionalString(body.mimeType),

            verificationStatus,
            retentionPolicy,

            uploadedBy: {
              actorId: actor.id,
              actorCode: actor.code,
              displayName:
                actor.displayName,
              systemRole:
                actor.systemRole,
            },

            occurredAt,
          }),
        });

      if (!event) {
        throw new Error(
          "Evidence kernel event could not be created"
        );
      }

      return NextResponse.json(
        {
          success: true,
          evidence,
          event: {
            id: event.id,
            eventId: event.eventId,
            eventType: event.eventType,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      const response =
        validationResponse(error);

      if (response) {
        return response;
      }

      throw error;
    }
  } catch (error) {
    return errorResponse(
      error,
      "Evidence creation"
    );
  }
}
