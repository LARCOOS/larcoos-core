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

const ALLOWED_COST_TYPES = [
  "CUSTOMS",
  "BROKER",
  "FORKLIFT",
  "LABOR",
  "FUEL",
  "TOLLS",
  "OTHER",
];

const ALLOWED_STATUSES = [
  "OPEN",
  "CONFIRMED",
];

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

async function getTruckload(
  code: string,
  organizationId: number
) {
  return db.orm.public.Truckload
    .where({
      code,
      organizationId,
    })
    .first();
}

async function getCostTotals(
  truckloadId: number
) {
  const costs =
    await db.orm.public.TruckloadCost
      .where({
        truckloadId,
        status: "CONFIRMED",
      })
      .all();

  let operationalCostIncurred = 0;

  for (const cost of costs) {
    const amount = Number(cost.amount);

    if (Number.isFinite(amount)) {
      operationalCostIncurred += amount;
    }
  }

  return {
    operationalCostIncurred,
  };
}

export async function GET(request: Request) {
  try {
    const { organization } =
      await authorizeLdc();

    const { searchParams } =
      new URL(request.url);

    const code = String(
      searchParams.get("code") ?? ""
    ).trim();

    if (!code) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    const truckload =
      await getTruckload(
        code,
        organization.id
      );

    if (!truckload) {
      return NextResponse.json(
        {
          error:
            "Truckload not found inside LDC",
        },
        { status: 404 }
      );
    }

    const costs =
      await db.orm.public.TruckloadCost
        .where({
          truckloadId: truckload.id,
        })
        .all();

    const totals =
      await getCostTotals(truckload.id);

    return NextResponse.json({
      truckload: {
        id: truckload.id,
        code: truckload.code,
      },
      costs,
      totals,
    });
  } catch (error) {
    return errorResponse(
      error,
      "GET /api/truckload-costs"
    );
  }
}

export async function POST(request: Request) {
  try {
    const { organization } =
      await authorizeLdc();

    const body = await request.json();

    const code = String(
      body.code ?? ""
    ).trim();

    const costType = String(
      body.costType ?? ""
    )
      .trim()
      .toUpperCase();

    const amount = Number(body.amount);

    const status = String(
      body.status ?? "CONFIRMED"
    )
      .trim()
      .toUpperCase();

    if (!code) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_COST_TYPES.includes(costType)) {
      return NextResponse.json(
        { error: "Invalid cost type" },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Cost amount must be greater than zero",
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid cost status" },
        { status: 400 }
      );
    }

    const truckload =
      await getTruckload(
        code,
        organization.id
      );

    if (!truckload) {
      return NextResponse.json(
        {
          error:
            "Truckload not found inside LDC",
        },
        { status: 404 }
      );
    }

    const cost =
      await db.orm.public.TruckloadCost.create({
        truckloadId: truckload.id,
        costType,
        amount: amount.toString(),
        currency: String(
          body.currency ?? "USD"
        )
          .trim()
          .toUpperCase(),
        status,
        vendorName:
          String(body.vendorName ?? "").trim() ||
          null,
        reference:
          String(body.reference ?? "").trim() ||
          null,
        notes:
          String(body.notes ?? "").trim() ||
          null,
      });

    const totals =
      await getCostTotals(truckload.id);

    return NextResponse.json(
      {
        cost,
        totals,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(
      error,
      "POST /api/truckload-costs"
    );
  }
}
export async function PATCH(request: Request) {
  try {
    const { organization } =
      await authorizeLdc();

    const body = await request.json();

    const code = String(
      body.code ?? ""
    ).trim();

    const costId = Number(body.costId);

    const reason = String(
      body.reason ?? ""
    ).trim();

    if (!code) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(costId) ||
      costId <= 0
    ) {
      return NextResponse.json(
        { error: "Valid cost ID is required" },
        { status: 400 }
      );
    }

    if (reason.length < 3) {
      return NextResponse.json(
        {
          error:
            "Void reason must be at least 3 characters",
        },
        { status: 400 }
      );
    }

    const truckload =
      await getTruckload(
        code,
        organization.id
      );

    if (!truckload) {
      return NextResponse.json(
        {
          error:
            "Truckload not found inside LDC",
        },
        { status: 404 }
      );
    }

    const cost =
      await db.orm.public.TruckloadCost
        .where({
          id: costId,
          truckloadId: truckload.id,
        })
        .first();

    if (!cost) {
      return NextResponse.json(
        { error: "Truckload cost not found" },
        { status: 404 }
      );
    }

    if (cost.status === "VOID") {
      return NextResponse.json(
        { error: "Cost is already void" },
        { status: 409 }
      );
    }

    const originalNotes =
      String(cost.notes ?? "").trim();

    const voidNotes = originalNotes
      ? `VOID: ${reason}\n${originalNotes}`
      : `VOID: ${reason}`;

    const voidedCost =
      await db.orm.public.TruckloadCost
        .where({
          id: cost.id,
          truckloadId: truckload.id,
        })
        .update({
          status: "VOID",
          notes: voidNotes,
        });

    const totals =
      await getCostTotals(truckload.id);

    return NextResponse.json({
      cost: voidedCost,
      totals,
    });
  } catch (error) {
    return errorResponse(
      error,
      "PATCH /api/truckload-costs"
    );
  }
}