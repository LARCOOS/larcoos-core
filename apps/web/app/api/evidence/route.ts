import { createHash, randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
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

const EVIDENCE_V11_MAX_BYTES = 25 * 1024 * 1024;
const EVIDENCE_V11_STORAGE_ROOT = path.join(process.cwd(), "storage", "evidence");

const EVIDENCE_V11_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function evidenceV11Required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`VALIDATION:${key} is required`);
  }
  return value.trim();
}

function evidenceV11Optional(formData: FormData, key: string) {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`VALIDATION:${key} must be text`);
  }
  return value.trim() || null;
}

function evidenceV11SafeSegment(value: string) {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!safe) {
    throw new Error("VALIDATION:Invalid evidence storage segment");
  }

  return safe.slice(0, 120);
}

function evidenceV11Extension(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg": return ".jpg";
    case "image/png": return ".png";
    case "image/webp": return ".webp";
    case "application/pdf": return ".pdf";
    default:
      throw new Error("VALIDATION:Unsupported evidence file type");
  }
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
  let physicalPath: string | null = null;
  let evidenceCreated = false;

  try {
    const { actor, organization } = await authorizeLdc();

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "Content-Type must be multipart/form-data",
        },
        { status: 415 }
      );
    }

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      throw new Error("VALIDATION:file is required");
    }

    if (fileEntry.size <= 0) {
      throw new Error("VALIDATION:file cannot be empty");
    }

    if (fileEntry.size > EVIDENCE_V11_MAX_BYTES) {
      throw new Error(
        "VALIDATION:file exceeds the 25 MB evidence limit"
      );
    }

    if (!EVIDENCE_V11_ALLOWED_MIME_TYPES.has(fileEntry.type)) {
      throw new Error(
        "VALIDATION:Only JPEG, PNG, WebP, and PDF evidence is allowed"
      );
    }

    const entityType = evidenceV11Required(
      formData,
      "entityType"
    ).toUpperCase();

    const entityId = evidenceV11Required(
      formData,
      "entityId"
    );

    const entityCode = evidenceV11Optional(
      formData,
      "entityCode"
    );

    const category = evidenceV11Required(
      formData,
      "category"
    ).toUpperCase();

    const purpose = evidenceV11Optional(
      formData,
      "purpose"
    );

    const locationRaw = evidenceV11Optional(
      formData,
      "locationId"
    );

    let locationId: number | null = null;

    if (locationRaw !== null) {
      locationId = Number(locationRaw);

      if (!Number.isInteger(locationId) || locationId <= 0) {
        throw new Error(
          "VALIDATION:locationId must be a positive integer"
        );
      }

      const location =
        await db.orm.public.Location
          .where({ id: locationId })
          .first();

      if (
        !location ||
        location.organizationId !== organization.id
      ) {
        throw new Error(
          "VALIDATION:Location does not belong to LDC"
        );
      }
    }

    const capturedRaw = evidenceV11Optional(
      formData,
      "capturedAt"
    );

    let capturedAt: string | null = null;

    if (capturedRaw !== null) {
      const capturedDate = new Date(capturedRaw);

      if (Number.isNaN(capturedDate.getTime())) {
        throw new Error(
          "VALIDATION:capturedAt must be a valid timestamp"
        );
      }

      capturedAt = capturedDate.toISOString();
    }

    const metadataRaw = evidenceV11Optional(
      formData,
      "metadata"
    );

    let metadata: string | null = null;

    if (metadataRaw !== null) {
      try {
        metadata = JSON.stringify(
          JSON.parse(metadataRaw)
        );
      } catch {
        throw new Error(
          "VALIDATION:metadata must be valid JSON"
        );
      }
    }

    const bytes = Buffer.from(
      await fileEntry.arrayBuffer()
    );

    const sha256 = createHash("sha256")
      .update(bytes)
      .digest("hex");

    const evidenceId = makeEvidenceId();

    const extension =
      evidenceV11Extension(fileEntry.type);

    const segments = [
      evidenceV11SafeSegment(organization.code),
      evidenceV11SafeSegment(entityType),
      evidenceV11SafeSegment(entityId),
      evidenceV11SafeSegment(category),
      `${evidenceV11SafeSegment(evidenceId)}${extension}`,
    ];

    const storageKey =
      path.posix.join(...segments);

    const directoryPath = path.join(
      EVIDENCE_V11_STORAGE_ROOT,
      ...segments.slice(0, -1)
    );

    physicalPath = path.join(
      EVIDENCE_V11_STORAGE_ROOT,
      ...segments
    );

    await mkdir(directoryPath, {
      recursive: true,
    });

    await writeFile(
      physicalPath,
      bytes,
      { flag: "wx" }
    );
    const evidence =
      await db.orm.public.EvidenceAsset.create({
        evidenceId,
        organizationId: organization.id,
        locationId,
        uploadedByActorId: actor.id,
        kernelEventId: null,

        entityType,
        entityId,
        entityCode,

        category,
        purpose,

        fileType: extension.slice(1),
        mimeType: fileEntry.type,

        originalFilename:
          fileEntry.name || `evidence${extension}`,

        storageKey,
        sha256,
        sizeBytes: fileEntry.size,

        capturedAt,

        source: "LARCOOS",
        verificationStatus: "UNVERIFIED",

        metadata,

        retentionPolicy: "BUSINESS_RECORD",
        supersededById: null,
        isActive: true,
      });

    if (!evidence) {
      throw new Error(
        "Evidence asset could not be created"
      );
    }

    evidenceCreated = true;

    const occurredAt =
      new Date().toISOString();

    const event =
      await db.orm.public.KernelEvent.create({
        eventId: makeEventId(),
        eventType: "EVIDENCE_UPLOADED",

        organizationId: organization.id,
        locationId,

        actorId: actor.id,

        entityType,
        entityId,
        entityCode,

        source: "LARCOOS",

        payload: JSON.stringify({
          evidenceVersion: "1.1",

          evidenceId:
            evidence.evidenceId,

          category,
          purpose,

          originalFilename:
            fileEntry.name,

          storageKey,
          sha256,

          sizeBytes:
            fileEntry.size,

          mimeType:
            fileEntry.type,

          verificationStatus:
            "UNVERIFIED",

          retentionPolicy:
            "BUSINESS_RECORD",

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
    if (physicalPath && !evidenceCreated) {
      try {
        await unlink(physicalPath);
      } catch {}
    }

    const response =
      validationResponse(error);

    if (response) {
      return response;
    }

    return errorResponse(
      error,
      "Evidence upload"
    );
  }
}
