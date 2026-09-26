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

const ALLOWED_OBLIGATION_TYPES = [
  "MERCHANDISE",
  "FREIGHT",
  "CUSTOMS",
  "BROKER",
  "FORKLIFT",
  "LABOR",
  "FUEL",
  "TOLLS",
  "OTHER",
];

const ALLOWED_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "VOID",
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

function deriveMerchandisePaymentStatus(
  purchase: number,
  paid: number
) {
  if (paid <= 0) {
    return "Unpaid";
  }

  if (paid >= purchase) {
    return "Paid in Full";
  }

  return "Partial";
}

async function getConfirmedTotals(
  truckloadId: number
) {
  const payments =
    await db.orm.public.TruckloadPayment
      .where({
        truckloadId,
        status: "CONFIRMED",
      })
      .all();

  let merchandisePaid = 0;
  let freightPaid = 0;
  let operationalPaid = 0;

  for (const payment of payments) {
    const amount = Number(payment.amount);

    if (!Number.isFinite(amount)) {
      continue;
    }

    if (
      payment.obligationType === "MERCHANDISE"
    ) {
      merchandisePaid += amount;
    } else if (
      payment.obligationType === "FREIGHT"
    ) {
      freightPaid += amount;
    } else {
      operationalPaid += amount;
    }
  }

  return {
    merchandisePaid,
    freightPaid,
    operationalPaid,
    confirmedTotal:
      merchandisePaid +
      freightPaid +
      operationalPaid,
  };
}

async function getConfirmedCostTotals(
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

    if (!Number.isFinite(amount)) {
      continue;
    }

    operationalCostIncurred += amount;
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
      await db.orm.public.Truckload
        .where({
          code,
          organizationId: organization.id,
        })
        .first();

    if (!truckload) {
      return NextResponse.json(
        {
          error:
            "Truckload not found inside LDC",
        },
        { status: 404 }
      );
    }

    const payments =
      await db.orm.public.TruckloadPayment
        .where({
          truckloadId: truckload.id,
        })
        .all();

    const totals =
      await getConfirmedTotals(truckload.id);

    const costTotals =
      await getConfirmedCostTotals(
        truckload.id
      );

    const purchase = Number(
      truckload.purchase
    );

    const receiving =
      await db.orm.public.TruckReceiving
        .where({
          truckloadId: truckload.id,
        })
        .first();

    const estimatedFreight = Number(
      truckload.freight
    );

    const actualFreight =
      receiving?.freightCost === null ||
      receiving?.freightCost === undefined
        ? null
        : Number(receiving.freightCost);

    const freightObligation =
      actualFreight ?? estimatedFreight;

    return NextResponse.json({
      truckload: {
        id: truckload.id,
        code: truckload.code,
        purchase,
        estimatedFreight,
        actualFreight,
      },
      payments,
      totals: {
        ...totals,
        ...costTotals,
        supplierBalance: Math.max(
          purchase - totals.merchandisePaid,
          0
        ),
        freightBalance: Math.max(
          freightObligation -
            totals.freightPaid,
          0
        ),
        operationalBalance: Math.max(
          costTotals.operationalCostIncurred -
            totals.operationalPaid,
          0
        ),
        currentLandedCost:
          purchase +
          freightObligation +
          costTotals.operationalCostIncurred,
        merchandisePaymentStatus:
          deriveMerchandisePaymentStatus(
            purchase,
            totals.merchandisePaid
          ),
      },
    });
  } catch (error) {
    return errorResponse(
      error,
      "GET /api/truckload-payments"
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

    if (!code) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    const obligationType = String(
      body.obligationType ?? ""
    )
      .trim()
      .toUpperCase();

    if (
      !ALLOWED_OBLIGATION_TYPES.includes(
        obligationType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid payment obligation type",
        },
        { status: 400 }
      );
    }

    const amount = Number(body.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Payment amount must be greater than zero",
        },
        { status: 400 }
      );
    }

    const status = String(
      body.status ?? "CONFIRMED"
    )
      .trim()
      .toUpperCase();

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid payment status" },
        { status: 400 }
      );
    }

    const truckload =
      await db.orm.public.Truckload
        .where({
          code,
          organizationId: organization.id,
        })
        .first();

    if (!truckload) {
      return NextResponse.json(
        {
          error:
            "Truckload not found inside LDC",
        },
        { status: 404 }
      );
    }

    const purchase = Number(
      truckload.purchase
    );

    if (
      obligationType === "MERCHANDISE" &&
      status === "CONFIRMED"
    ) {
      const current =
        await getConfirmedTotals(
          truckload.id
        );

      if (
        current.merchandisePaid + amount >
        purchase
      ) {
        return NextResponse.json(
          {
            error:
              "Confirmed merchandise payments cannot exceed purchase cost",
          },
          { status: 400 }
        );
      }
    }

    const paidAt =
      body.paidAt === undefined ||
      body.paidAt === null ||
      String(body.paidAt).trim() === ""
        ? new Date()
        : new Date(body.paidAt);

    if (Number.isNaN(paidAt.getTime())) {
      return NextResponse.json(
        { error: "Invalid payment date" },
        { status: 400 }
      );
    }

    const payment =
      await db.orm.public.TruckloadPayment.create({
        truckloadId: truckload.id,
        obligationType,
        amount: String(amount),
        currency: String(
          body.currency ?? "USD"
        )
          .trim()
          .toUpperCase(),
        method: String(
          body.method ?? "Unspecified"
        ).trim(),
        status,
        payeeName:
          String(
            body.payeeName ?? ""
          ).trim() || null,
        reference:
          String(
            body.reference ?? ""
          ).trim() || null,
        notes:
          String(body.notes ?? "").trim() ||
          null,
        paidAt: paidAt.toISOString(),
      });

    const totals =
      await getConfirmedTotals(truckload.id);

    const paymentStatus =
      deriveMerchandisePaymentStatus(
        purchase,
        totals.merchandisePaid
      );

    await db.orm.public.Truckload
      .where({
        id: truckload.id,
        organizationId: organization.id,
      })
      .update({
        amountPaid: String(
          totals.merchandisePaid
        ),
        paymentStatus,
      });

    const receiving =
      await db.orm.public.TruckReceiving
        .where({
          truckloadId: truckload.id,
        })
        .first();

    const estimatedFreight = Number(
      truckload.freight
    );

    const actualFreight =
      receiving?.freightCost === null ||
      receiving?.freightCost === undefined
        ? null
        : Number(receiving.freightCost);

    const freightObligation =
      actualFreight ?? estimatedFreight;

    return NextResponse.json(
      {
        payment,
        totals: {
          ...totals,
          supplierBalance: Math.max(
            purchase -
              totals.merchandisePaid,
            0
          ),
          freightBalance: Math.max(
            freightObligation -
              totals.freightPaid,
            0
          ),
          merchandisePaymentStatus:
            paymentStatus,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(
      error,
      "POST /api/truckload-payments"
    );
  }
}
export async function PATCH(request: Request) {
  try {
    const { organization } = await authorizeLdc();
    const body = await request.json();

    const code = String(body.code ?? "").trim();
    const paymentId = Number(body.paymentId);
    const reason = String(body.reason ?? "").trim();

    if (!code) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return NextResponse.json(
        { error: "Valid payment ID is required" },
        { status: 400 }
      );
    }

    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Void reason is required" },
        { status: 400 }
      );
    }

    const truckload = await db.orm.public.Truckload
      .where({
        code,
        organizationId: organization.id,
      })
      .first();

    if (!truckload) {
      return NextResponse.json(
        { error: "Truckload not found inside LDC" },
        { status: 404 }
      );
    }

    const payment = await db.orm.public.TruckloadPayment
      .where({
        id: paymentId,
        truckloadId: truckload.id,
      })
      .first();

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found for this truckload" },
        { status: 404 }
      );
    }

    if (payment.status === "VOID") {
      return NextResponse.json(
        { error: "Payment is already void" },
        { status: 409 }
      );
    }

    const previousNotes = String(payment.notes ?? "").trim();
    const voidAuditNote =
      `VOID: ${reason}` +
      (previousNotes ? ` | Original notes: ${previousNotes}` : "");

    const voidedPayment = await db.orm.public.TruckloadPayment
      .where({
        id: payment.id,
        truckloadId: truckload.id,
      })
      .update({
        status: "VOID",
        notes: voidAuditNote,
      });

    if (!voidedPayment) {
      throw new Error("Payment could not be voided");
    }

    const purchase = Number(truckload.purchase);
    const totals = await getConfirmedTotals(truckload.id);

    const paymentStatus = deriveMerchandisePaymentStatus(
      purchase,
      totals.merchandisePaid
    );

    await db.orm.public.Truckload
      .where({
        id: truckload.id,
        organizationId: organization.id,
      })
      .update({
        amountPaid: String(totals.merchandisePaid),
        paymentStatus,
      });

    const receiving = await db.orm.public.TruckReceiving
      .where({
        truckloadId: truckload.id,
      })
      .first();

    const estimatedFreight = Number(truckload.freight);

    const actualFreight =
      receiving?.freightCost === null ||
      receiving?.freightCost === undefined
        ? null
        : Number(receiving.freightCost);

    const freightObligation =
      actualFreight ?? estimatedFreight;

    return NextResponse.json({
      payment: voidedPayment,
      totals: {
        ...totals,
        supplierBalance: Math.max(
          purchase - totals.merchandisePaid,
          0
        ),
        freightBalance: Math.max(
          freightObligation - totals.freightPaid,
          0
        ),
        merchandisePaymentStatus: paymentStatus,
      },
    });
  } catch (error) {
    return errorResponse(
      error,
      "PATCH /api/truckload-payments"
    );
  }
}
