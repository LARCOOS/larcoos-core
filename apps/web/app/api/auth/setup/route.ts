import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import {
  hashPassword,
  normalizeLoginIdentifier,
  validatePasswordForCreation,
} from "@/src/kernel/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SetupRequestBody = {
  loginIdentifier?: unknown;
  password?: unknown;
};

export async function POST(
  request: Request
) {
  try {
    // =========================================================
    // 1. FIRST-ACCOUNT GUARD
    //
    // Initial setup is allowed only while LARCOOS has
    // zero authentication accounts.
    // =========================================================

    const existingAccounts =
      await db.orm.public.AuthAccount.all();

    if (existingAccounts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Initial authentication setup has already been completed.",
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 2. VERIFY THE KERNEL OWNER ACTOR
    // =========================================================

    const owner =
      await db.orm.public.Actor
        .where({
          code: "LARCO-ADMIN-001",
        })
        .first();

    if (
      !owner ||
      !owner.isActive ||
      owner.systemRole !== "OWNER_ADMIN"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "LARCOOS OWNER_ADMIN is not initialized.",
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 3. READ AND VALIDATE CREDENTIALS
    // =========================================================

    let body: SetupRequestBody;

    try {
      body =
        (await request.json()) as SetupRequestBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body.",
        },
        { status: 400 }
      );
    }

    if (
      typeof body.loginIdentifier !==
        "string" ||
      typeof body.password !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Login identifier and password are required.",
        },
        { status: 400 }
      );
    }

    const loginIdentifier =
      normalizeLoginIdentifier(
        body.loginIdentifier
      );

    if (
      loginIdentifier.length < 3 ||
      loginIdentifier.length > 254
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Login identifier must contain between 3 and 254 characters.",
        },
        { status: 400 }
      );
    }

    try {
      validatePasswordForCreation(
        body.password
      );
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Invalid password.",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // 4. HASH PASSWORD
    //
    // Plaintext password is never written to the database.
    // =========================================================

    const passwordHash =
      await hashPassword(body.password);

    // =========================================================
    // 5. RECHECK BEFORE CREATE
    //
    // Reduces the setup race window. The database unique
    // constraints remain the final protection.
    // =========================================================

    const accountsBeforeCreate =
      await db.orm.public.AuthAccount.all();

    if (accountsBeforeCreate.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Initial authentication setup has already been completed.",
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 6. CREATE OWNER AUTH ACCOUNT
    // =========================================================

    const account =
      await db.orm.public.AuthAccount.create({
        actorId: owner.id,
        loginIdentifier,
        passwordHash,

        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        passwordChangedAt:
          new Date().toISOString(),
      });

    if (!account) {
      throw new Error(
        "OWNER_ADMIN authentication account could not be created."
      );
    }

    // =========================================================
    // 7. IMMUTABLE KERNEL EVENT
    //
    // Never record the password or password hash.
    // =========================================================

    await db.orm.public.KernelEvent.create({
      eventId:
        `AUTH-ACCOUNT-CREATED-${crypto.randomUUID()}`,

      eventType:
        "AUTH_ACCOUNT_CREATED",

      organizationId:
        owner.organizationId,

      locationId: null,
      actorId: owner.id,

      entityType: "AUTH_ACCOUNT",
      entityId: String(account.id),
      entityCode: owner.code,

      source: "LARCOOS",

      payload: JSON.stringify({
        actorCode: owner.code,
        systemRole: owner.systemRole,
        initialAccount: true,
      }),

      occurredAt:
        new Date().toISOString(),
    });

    // =========================================================
    // 8. SAFE RESPONSE
    //
    // Never return passwordHash.
    // =========================================================

    return NextResponse.json(
      {
        success: true,

        account: {
          id: account.id,
          actorId: account.actorId,
          loginIdentifier:
            account.loginIdentifier,
          isActive: account.isActive,
        },

        actor: {
          id: owner.id,
          code: owner.code,
          displayName:
            owner.displayName,
          systemRole:
            owner.systemRole,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/auth/setup failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to initialize LARCOOS authentication.",
      },
      { status: 500 }
    );
  }
}