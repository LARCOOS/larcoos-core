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

const ALLOWED_PAYMENT_METHODS = [
  "Unspecified",
  "Cash",
  "Card",
  "Domestic Wire Transfer (USA)",
  "International Wire Transfer",
  "Check",
  "ACH",
  "Other",
];

function errorResponse(error: unknown, operation: string) {
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
  const session = await requireAuthenticatedSession();

  const organization = await db.orm.public.Organization
    .where({ code: LDC_ORGANIZATION_CODE })
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

function calculatePaymentStatus(
  grossAmount: number,
  amountReceived: number
) {
  if (amountReceived <= 0) {
    return "Unpaid";
  }

  if (amountReceived >= grossAmount) {
    return "Paid in Full";
  }

  return "Partial";
}

export async function GET() {
  try {
    const { organization } = await authorizeLdc();

    const sales = await db.orm.public.Sale
      .where({ organizationId: organization.id })
      .orderBy((sale) => sale.id.desc())
      .all();

    const truckloads = await db.orm.public.Truckload
      .where({ organizationId: organization.id })
      .orderBy((truckload) => truckload.id.desc())
      .all();

    const truckloadById = new Map(
      truckloads.map((truckload) => [
        truckload.id,
        {
          id: truckload.id,
          code: truckload.code,
          supplier: truckload.supplier,
          retailer: truckload.retailer,
          status: truckload.status,
        },
      ])
    );

    return NextResponse.json(
      sales.map((sale) => {
        const grossAmount = Number(sale.grossAmount);
        const amountReceived = Number(sale.amountReceived);

        return {
          ...sale,
          grossAmount,
          amountReceived,
          balance: Math.max(
            0,
            grossAmount - amountReceived
          ),
          sourceTruckload:
            sale.truckloadId === null
              ? null
              : truckloadById.get(sale.truckloadId) ?? null,
        };
      })
    );
  } catch (error) {
    return errorResponse(error, "GET /api/sales");
  }
}

export async function POST(request: Request) {
  try {
    const { organization } = await authorizeLdc();
    const body = await request.json();

    const customerName = String(
      body.customerName ?? ""
    ).trim();

    const currency = String(body.currency ?? "USD")
      .trim()
      .toUpperCase();

    const paymentMethod = String(
      body.paymentMethod ?? "Unspecified"
    ).trim();

    const notes = String(body.notes ?? "").trim();

    const grossAmount = Number(body.grossAmount);
    const initialPayment = Number(
      body.initialPayment ?? 0
    );

    const truckloadId =
      body.truckloadId === null ||
      body.truckloadId === undefined ||
      body.truckloadId === ""
        ? null
        : Number(body.truckloadId);

    if (
      !customerName ||
      !Number.isFinite(grossAmount) ||
      grossAmount <= 0 ||
      !Number.isFinite(initialPayment) ||
      initialPayment < 0 ||
      initialPayment > grossAmount ||
      currency.length !== 3 ||
      !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)
    ) {
      return NextResponse.json(
        { error: "Invalid sale data" },
        { status: 400 }
      );
    }

    if (
      truckloadId !== null &&
      (!Number.isInteger(truckloadId) || truckloadId <= 0)
    ) {
      return NextResponse.json(
        { error: "Invalid source truckload" },
        { status: 400 }
      );
    }

    if (truckloadId !== null) {
      const truckload = await db.orm.public.Truckload
        .where({
          id: truckloadId,
          organizationId: organization.id,
        })
        .first();

      if (!truckload) {
        return NextResponse.json(
          {
            error:
              "Source truckload does not exist inside LDC",
          },
          { status: 404 }
        );
      }
    }

    const latestSale = await db.orm.public.Sale
      .where({ organizationId: organization.id })
      .orderBy((sale) => sale.id.desc())
      .first();

    const nextNumber = (latestSale?.id ?? 0) + 1;
    const year = new Date().getFullYear();

    const code = `LDC-S-${year}-${String(nextNumber).padStart(
      4,
      "0"
    )}`;

    const paymentStatus = calculatePaymentStatus(
      grossAmount,
      initialPayment
    );

    const sale = await db.orm.public.Sale.create({
      code,
      organizationId: organization.id,
      locationId: null,
      truckloadId,
      customerName,
      status: "Open",
      paymentStatus,
      paymentMethod,
      currency,
      grossAmount: String(grossAmount),
      amountReceived: String(initialPayment),
      saleDate: new Date().toISOString(),
      notes: notes === "" ? null : notes,
    });

    if (initialPayment > 0) {
      await db.orm.public.SalePayment.create({
        saleId: sale.id,
        amount: String(initialPayment),
        currency,
        method: paymentMethod,
        reference: null,
        notes: "Initial payment",
        receivedAt: new Date().toISOString(),
      });
    }

    const saleGrossAmount = Number(sale.grossAmount);
    const saleAmountReceived = Number(sale.amountReceived);

    return NextResponse.json(
      {
        ...sale,
        grossAmount: saleGrossAmount,
        amountReceived: saleAmountReceived,
        balance: Math.max(
          0,
          saleGrossAmount - saleAmountReceived
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "POST /api/sales");
  }
}