import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = [
  "Planned",
  "Purchased",
  "In Transit",
  "Received",
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

export async function GET() {
  try {
    const truckloads = await db.orm.public.Truckload
      .orderBy((t) => t.id.desc())
      .all();

    return NextResponse.json(truckloads);
  } catch (error) {
    console.error("GET /api/truckloads failed:", error);

    return NextResponse.json(
      { error: "Failed to load truckloads" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supplier = String(body.supplier ?? "").trim();
    const retailer = String(body.retailer ?? "").trim();
    const destination = String(body.destination ?? "").trim();
    const status = String(body.status ?? "Planned").trim();

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

    const latest = await db.orm.public.Truckload
      .orderBy((t) => t.id.desc())
      .first();

    const nextNumber = (latest?.id ?? 0) + 1;
    const year = new Date().getFullYear();

    const code = `LDC-${year}-${String(nextNumber).padStart(3, "0")}`;

    const truckload = await db.orm.public.Truckload.create({
      code,
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

    return NextResponse.json(truckload, { status: 201 });
  } catch (error) {
    console.error("POST /api/truckloads failed:", error);

    return NextResponse.json(
      { error: "Failed to create truckload" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    const code = String(body.code ?? "").trim();

    if (!code) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    const existing = await db.orm.public.Truckload
      .where({ code })
      .first();

    if (!existing) {
      return NextResponse.json(
        { error: "Truckload not found" },
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
      const status = String(body.status).trim();

      if (!ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: "Invalid truckload status" },
          { status: 400 }
        );
      }

      updateData.status = status;
    }

    if (body.paymentMethod !== undefined) {
      const paymentMethod = String(body.paymentMethod).trim();

      if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
        return NextResponse.json(
          { error: "Invalid payment method" },
          { status: 400 }
        );
      }

      updateData.paymentMethod = paymentMethod;
    }

    if (body.paymentStatus !== undefined) {
      const paymentStatus = String(body.paymentStatus).trim();

      if (!ALLOWED_PAYMENT_STATUSES.includes(paymentStatus)) {
        return NextResponse.json(
          { error: "Invalid payment status" },
          { status: 400 }
        );
      }

      updateData.paymentStatus = paymentStatus;
    }

    if (body.amountPaid !== undefined) {
      const amountPaid = Number(body.amountPaid);
      const purchase = Number(existing.purchase);

      if (
        !Number.isFinite(amountPaid) ||
        amountPaid < 0 ||
        amountPaid > purchase
      ) {
        return NextResponse.json(
          { error: "Invalid amount paid" },
          { status: 400 }
        );
      }

      updateData.amountPaid = String(amountPaid);
    }

    if (body.paymentCountry !== undefined) {
      const paymentCountry = String(
        body.paymentCountry ?? ""
      ).trim();

      updateData.paymentCountry =
        paymentCountry === "" ? null : paymentCountry;
    }

    if (body.paymentDueDate !== undefined) {
      if (
        body.paymentDueDate === null ||
        String(body.paymentDueDate).trim() === ""
      ) {
        updateData.paymentDueDate = null;
      } else {
        const paymentDueDate = new Date(body.paymentDueDate);

        if (Number.isNaN(paymentDueDate.getTime())) {
          return NextResponse.json(
            { error: "Invalid payment due date" },
            { status: 400 }
          );
        }

        updateData.paymentDueDate = paymentDueDate.toISOString();
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const truckload = await db.orm.public.Truckload
      .where({ code })
      .update(updateData);

    return NextResponse.json(truckload);
  } catch (error) {
    console.error("PATCH /api/truckloads failed:", error);

    return NextResponse.json(
      { error: "Failed to update truckload" },
      { status: 500 }
    );
  }
}