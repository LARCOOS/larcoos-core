import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  revokeCurrentSession,
} from "@/src/kernel/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getAuthenticatedSession();

    if (!session) {
      return NextResponse.json(
        {
          success: true,
          authenticated: false,
        },
        { status: 200 }
      );
    }

    await revokeCurrentSession();

    return NextResponse.json({
      success: true,
      authenticated: false,
    });
  } catch (error) {
    console.error("POST /api/auth/logout failed", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to sign out",
      },
      { status: 500 }
    );
  }
}