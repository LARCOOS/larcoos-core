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

const ALLOWED_STATUSES = [
  "Planned",
  "Purchased",
  "In Transit",
  "Received",
  "Unloading",
  "Unloaded",
  "Processing",
  "Ready for Export",
  "Delivered",
];

const ALLOWED_PAYMENT_METHODS = [
  "Unspecified",
  "Cash",
  "Card",
  "Domestic Wire Transfer (USA)",
  "International Wire Transfer",
  "30-Day Credit",
];

const ALLOWED_PAYMENT_STATUSES = [
  "Unpaid",
  "Partial",
  "Paid in Full",
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

export async function GET() {
  try {
    const { organization } =
      await authorizeLdc();

    const truckloads =
      await db.orm.public.Truckload
        .where({
          organizationId: organization.id,
        })
        .orderBy((truckload) =>
          truckload.id.desc()
        )
        .all();

    return NextResponse.json(truckloads);
  } catch (error) {
    return errorResponse(
      error,
      "GET /api/truckloads"
    );
  }
}

export async function POST(request: Request) {
  try {
    const { organization } =
      await authorizeLdc();

    const body = await request.json();

    const supplier = String(
      body.supplier ?? ""
    ).trim();

    const retailer = String(
      body.retailer ?? ""
    ).trim();

    const destination = String(
      body.destination ?? ""
    ).trim();

    const status = String(
      body.status ?? "Planned"
    ).trim();

    const pallets = Number(body.pallets);
    const purchase = Number(body.purchase);
    const freight = Number(body.freight);

    if (
      !supplier ||
      !retailer ||
      !destination ||
      !ALLOWED_STATUSES.includes(status) ||
      !Number.isInteger(pallets) ||
      pallets <= 0 ||
      !Number.isFinite(purchase) ||
      purchase < 0 ||
      !Number.isFinite(freight) ||
      freight < 0
    ) {
      return NextResponse.json(
        { error: "Invalid truckload data" },
        { status: 400 }
      );
    }

    const latest =
      await db.orm.public.Truckload
        .where({
          organizationId: organization.id,
        })
        .orderBy((truckload) =>
          truckload.id.desc()
        )
        .first();

    const nextNumber =
      (latest?.id ?? 0) + 1;

    const year =
      new Date().getFullYear();

    const code =
      `LDC-${year}-${String(
        nextNumber
      ).padStart(3, "0")}`;

    const truckload =
      await db.orm.public.Truckload.create({
        code,
        organizationId: organization.id,
        supplier,
        retailer,
        pallets,
        purchase: String(purchase),
        freight: String(freight),
        destination,
        status,
        paymentMethod: "Unspecified",
        paymentStatus: "Unpaid",
        amountPaid: "0",
        paymentCountry: null,
      });

    return NextResponse.json(
      truckload,
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(
      error,
      "POST /api/truckloads"
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

    if (!code) {
      return NextResponse.json(
        {
          error:
            "Truckload code is required",
        },
        { status: 400 }
      );
    }

    const existing =
      await db.orm.public.Truckload
        .where({
          code,
          organizationId: organization.id,
        })
        .first();

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Truckload not found inside LDC",
        },
        { status: 404 }
      );
    }

    const updateData: {
      status?: string;
      paymentMethod?: string;
      paymentStatus?: string;
      amountPaid?: string;
      paymentDueDate?: string | null;
      paymentCountry?: string | null;
    } = {};

    if (body.status !== undefined) {
      const status = String(
        body.status
      ).trim();

      if (
        !ALLOWED_STATUSES.includes(status)
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid truckload status",
          },
          { status: 400 }
        );
      }

      updateData.status = status;
    }

    if (
      body.paymentMethod !== undefined
    ) {
      const paymentMethod = String(
        body.paymentMethod
      ).trim();

      if (
        !ALLOWED_PAYMENT_METHODS.includes(
          paymentMethod
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid payment method",
          },
          { status: 400 }
        );
      }

      updateData.paymentMethod =
        paymentMethod;
    }

    if (
      body.paymentStatus !== undefined
    ) {
      const paymentStatus = String(
        body.paymentStatus
      ).trim();

      if (
        !ALLOWED_PAYMENT_STATUSES.includes(
          paymentStatus
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid payment status",
          },
          { status: 400 }
        );
      }

      updateData.paymentStatus =
        paymentStatus;
    }

    if (body.amountPaid !== undefined) {
      const amountPaid = Number(
        body.amountPaid
      );

      const purchase = Number(
        existing.purchase
      );

      if (
        !Number.isFinite(amountPaid) ||
        amountPaid < 0 ||
        amountPaid > purchase
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid amount paid",
          },
          { status: 400 }
        );
      }

      updateData.amountPaid =
        String(amountPaid);
    }

    if (
      body.paymentCountry !== undefined
    ) {
      const paymentCountry = String(
        body.paymentCountry ?? ""
      ).trim();

      updateData.paymentCountry =
        paymentCountry === ""
          ? null
          : paymentCountry;
    }

    if (
      body.paymentDueDate !== undefined
    ) {
      if (
        body.paymentDueDate === null ||
        String(
          body.paymentDueDate
        ).trim() === ""
      ) {
        updateData.paymentDueDate = null;
      } else {
        const paymentDueDate =
          new Date(body.paymentDueDate);

        if (
          Number.isNaN(
            paymentDueDate.getTime()
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Invalid payment due date",
            },
            { status: 400 }
          );
        }

        updateData.paymentDueDate =
          paymentDueDate.toISOString();
      }
    }

    if (
      Object.keys(updateData).length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No fields to update",
        },
        { status: 400 }
      );
    }

    const truckload =
      await db.orm.public.Truckload
        .where({
          id: existing.id,
          organizationId: organization.id,
        })
        .update(updateData);

    if (!truckload) {
      return NextResponse.json(
        {
          error:
            "Truckload could not be updated",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(truckload);
  } catch (error) {
    return errorResponse(
      error,
      "PATCH /api/truckloads"
    );
  }
}