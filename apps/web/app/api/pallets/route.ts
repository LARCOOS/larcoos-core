import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pallets?truckloadCode=LDC-2026-001
 *
 * Returns every pallet belonging to a truckload.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const truckloadCode = String(
      searchParams.get("truckloadCode") ?? ""
    ).trim();

    if (!truckloadCode) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    const truckload = await db.orm.public.Truckload
      .where({ code: truckloadCode })
      .first();

    if (!truckload) {
      return NextResponse.json(
        { error: "Truckload not found" },
        { status: 404 }
      );
    }

    const pallets = await db.orm.public.Pallet
      .where({ truckloadId: truckload.id })
      .orderBy((p) => p.palletNumber.asc())
      .all();

    return NextResponse.json({
      truckload: {
        id: truckload.id,
        code: truckload.code,
        expectedPallets: truckload.pallets,
      },
      count: pallets.length,
      pallets,
    });
  } catch (error) {
    console.error("GET /api/pallets failed:", error);

    return NextResponse.json(
      { error: "Failed to load pallets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pallets
 *
 * Body:
 * {
 *   "truckloadCode": "LDC-2026-001"
 * }
 *
 * Generates any missing pallets for the truckload.
 *
 * Example:
 * LDC-2026-001-P01
 * LDC-2026-001-P02
 * ...
 *
 * Existing pallets are preserved and never duplicated.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const truckloadCode = String(
      body.truckloadCode ?? ""
    ).trim();

    if (!truckloadCode) {
      return NextResponse.json(
        { error: "Truckload code is required" },
        { status: 400 }
      );
    }

    const truckload = await db.orm.public.Truckload
      .where({ code: truckloadCode })
      .first();

    if (!truckload) {
      return NextResponse.json(
        { error: "Truckload not found" },
        { status: 404 }
      );
    }

    if (
      !Number.isInteger(truckload.pallets) ||
      truckload.pallets <= 0
    ) {
      return NextResponse.json(
        { error: "Truckload has no valid pallet quantity" },
        { status: 400 }
      );
    }

    const existingPallets = await db.orm.public.Pallet
      .where({ truckloadId: truckload.id })
      .orderBy((p) => p.palletNumber.asc())
      .all();

    const existingNumbers = new Set(
      existingPallets.map((pallet) => pallet.palletNumber)
    );

    const createdPallets = [];

    for (
      let palletNumber = 1;
      palletNumber <= truckload.pallets;
      palletNumber++
    ) {
      if (existingNumbers.has(palletNumber)) {
        continue;
      }

      const palletCode =
        `${truckload.code}-P${String(palletNumber).padStart(
          2,
          "0"
        )}`;

      const pallet = await db.orm.public.Pallet.create({
        code: palletCode,
        truckloadId: truckload.id,
        palletNumber,
        status: "Pending",
        processedPieces: 0,
      });

      createdPallets.push(pallet);
    }

    const pallets = await db.orm.public.Pallet
      .where({ truckloadId: truckload.id })
      .orderBy((p) => p.palletNumber.asc())
      .all();

    return NextResponse.json(
      {
        message:
          createdPallets.length > 0
            ? `${createdPallets.length} pallet(s) created`
            : "All pallets already exist",
        truckload: {
          id: truckload.id,
          code: truckload.code,
          expectedPallets: truckload.pallets,
        },
        created: createdPallets.length,
        total: pallets.length,
        pallets,
      },
      { status: createdPallets.length > 0 ? 201 : 200 }
    );
  } catch (error) {
    console.error("POST /api/pallets failed:", error);

    return NextResponse.json(
      { error: "Failed to generate pallets" },
      { status: 500 }
    );
  }
}