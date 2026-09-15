import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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