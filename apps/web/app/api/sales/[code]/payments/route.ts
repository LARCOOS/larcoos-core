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

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      code: string;
    }>;
  }
) {
  try {
    const { organization } = await authorizeLdc();
    const { code } = await context.params;

    const sale =
      await db.orm.public.Sale
        .where({
          code,
          organizationId: organization.id,
        })
        .first();

    if (!sale) {
      return NextResponse.json(
        { error: "Sale not found inside LDC" },
        { status: 404 }
      );
    }

    const payments =
      await db.orm.public.SalePayment
        .where({
          saleId: sale.id,
        })
        .orderBy((payment) =>
          payment.receivedAt.desc()
        )
        .all();

    const grossAmount = Number(sale.grossAmount);
    const amountReceived = Number(sale.amountReceived);

    return NextResponse.json({
      sale: {
        id: sale.id,
        code: sale.code,
        customerName: sale.customerName,
        currency: sale.currency,
        grossAmount,
        amountReceived,
        balance: Math.max(
          0,
          grossAmount - amountReceived
        ),
        paymentStatus: sale.paymentStatus,
      },
      payments: payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    });
  } catch (error) {
    return errorResponse(
      error,
      "GET /api/sales/[code]/payments"
    );
  }
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      code: string;
    }>;
  }
) {
  try {
    const { organization } = await authorizeLdc();
    const { code } = await context.params;
    const body = await request.json();

    const amount = Number(body.amount);

    const method = String(
      body.method ?? "Unspecified"
    ).trim();

    const reference = String(
      body.reference ?? ""
    ).trim();

    const notes = String(
      body.notes ?? ""
    ).trim();

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !ALLOWED_PAYMENT_METHODS.includes(method)
    ) {
      return NextResponse.json(
        { error: "Invalid payment data" },
        { status: 400 }
      );
    }

    const sale =
      await db.orm.public.Sale
        .where({
          code,
          organizationId: organization.id,
        })
        .first();

    if (!sale) {
      return NextResponse.json(
        { error: "Sale not found inside LDC" },
        { status: 404 }
      );
    }

    const grossAmount = Number(sale.grossAmount);

    const currentReceived = Number(
      sale.amountReceived
    );

    const currentBalance = Math.max(
      0,
      grossAmount - currentReceived
    );

    if (currentBalance <= 0) {
      return NextResponse.json(
        { error: "Sale is already paid in full" },
        { status: 409 }
      );
    }

    if (amount > currentBalance) {
      return NextResponse.json(
        {
          error: "Payment exceeds outstanding balance",
          outstandingBalance: currentBalance,
        },
        { status: 400 }
      );
    }

    const newAmountReceived =
      currentReceived + amount;

    const paymentStatus =
      calculatePaymentStatus(
        grossAmount,
        newAmountReceived
      );

    const payment =
      await db.orm.public.SalePayment.create({
        saleId: sale.id,
        amount: String(amount),
        currency: sale.currency,
        method,
        reference:
          reference === "" ? null : reference,
        notes:
          notes === "" ? null : notes,
        receivedAt: new Date().toISOString(),
      });

    const updatedSale =
      await db.orm.public.Sale
        .where({
          id: sale.id,
        })
        .update({
          amountReceived: String(
            newAmountReceived
          ),
          paymentStatus,
          paymentMethod: method,
        });

    if (!updatedSale) {
      return NextResponse.json(
        {
          error:
            "Payment was recorded but sale totals could not be refreshed",
        },
        { status: 500 }
      );
    }

    const updatedGrossAmount =
      Number(updatedSale.grossAmount);

    const updatedAmountReceived =
      Number(updatedSale.amountReceived);

    return NextResponse.json(
      {
        sale: {
          ...updatedSale,
          grossAmount: updatedGrossAmount,
          amountReceived:
            updatedAmountReceived,
          balance: Math.max(
            0,
            updatedGrossAmount -
              updatedAmountReceived
          ),
        },
        payment: {
          ...payment,
          amount: Number(payment.amount),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(
      error,
      "POST /api/sales/[code]/payments"
    );
  }
}