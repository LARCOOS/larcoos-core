import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireAuthenticatedSession } from "@/src/kernel/session";
import {
  authorizeOrganizationAccess,
  KernelAuthorizationError,
} from "@/src/kernel/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LDC_ORGANIZATION_CODE = "LDC";

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function errorResponse(
  error: unknown,
  operation: string
) {
  if (error instanceof KernelAuthorizationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  if (
    error instanceof Error &&
    error.message === "Authentication required"
  ) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  console.error(`${operation} failed:`, error);

  return NextResponse.json(
    { error: `${operation} failed` },
    { status: 500 }
  );
}

async function authorizeLdc() {
  const session =
    await requireAuthenticatedSession();

  const organization =
    await db.orm.public.Organization
      .where({
        code: LDC_ORGANIZATION_CODE,
      })
      .first();

  if (!organization || !organization.isActive) {
    throw new KernelAuthorizationError(
      "LDC organization is unavailable",
      404
    );
  }

  await authorizeOrganizationAccess({
    actorId: session.actor.id,
    organizationId: organization.id,
  });

  return {
    session,
    organization,
  };
}

export async function GET() {
  try {
    const { organization } =
      await authorizeLdc();

    const suppliers =
      await db.orm.public.Supplier
        .where({
          organizationId: organization.id,
          isActive: true,
        })
        .orderBy((supplier) =>
          supplier.name.asc()
        )
        .all();

    return NextResponse.json({
      success: true,
      suppliers,
    });
  } catch (error) {
    return errorResponse(
      error,
      "GET /api/suppliers"
    );
  }
}

export async function POST(request: Request) {
  try {
    const { organization } =
      await authorizeLdc();

    const body = await request.json();

    const name = String(
      body.name ?? ""
    ).trim();

    if (!name) {
      return NextResponse.json(
        {
          error: "Supplier name is required",
        },
        { status: 400 }
      );
    }

    const existing =
      await db.orm.public.Supplier
        .where({
          organizationId: organization.id,
          name,
        })
        .first();

    if (existing) {
      return NextResponse.json(
        {
          error: "Supplier already exists",
          supplier: existing,
        },
        { status: 409 }
      );
    }

    const supplier =
      await db.orm.public.Supplier.create({
        organizationId: organization.id,
        name,
        legalName: optionalText(body.legalName),
        contactName: optionalText(body.contactName),
        email: optionalText(body.email),
        phone: optionalText(body.phone),
        addressLine1: optionalText(body.addressLine1),
        addressLine2: optionalText(body.addressLine2),
        city: optionalText(body.city),
        stateRegion: optionalText(body.stateRegion),
        postalCode: optionalText(body.postalCode),
        country: optionalText(body.country),
        paymentInstructions:
          optionalText(body.paymentInstructions),
        notes: optionalText(body.notes),
        isActive: true,
      });

    return NextResponse.json(
      {
        success: true,
        supplier,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(
      error,
      "POST /api/suppliers"
    );
  }
}