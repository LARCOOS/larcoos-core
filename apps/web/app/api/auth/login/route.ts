import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import {
  normalizeLoginIdentifier,
  verifyPassword,
} from "@/src/kernel/auth";
import {
  createAuthenticatedSession,
} from "@/src/kernel/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

type LoginRequestBody = {
  loginIdentifier?: unknown;
  password?: unknown;
};

function genericInvalidCredentials() {
  return NextResponse.json(
    {
      success: false,
      error: "Invalid credentials.",
    },
    { status: 401 }
  );
}

function getLockExpiration() {
  return new Date(
    Date.now() +
      LOCK_DURATION_MINUTES *
        60 *
        1000
  );
}

export async function POST(
  request: Request
) {
  try {
    // =========================================================
    // 1. READ REQUEST
    // =========================================================

    let body: LoginRequestBody;

    try {
      body =
        (await request.json()) as LoginRequestBody;
    } catch {
      return genericInvalidCredentials();
    }

    if (
      typeof body.loginIdentifier !==
        "string" ||
      typeof body.password !== "string"
    ) {
      return genericInvalidCredentials();
    }

    const loginIdentifier =
      normalizeLoginIdentifier(
        body.loginIdentifier
      );

    if (
      loginIdentifier.length === 0 ||
      body.password.length === 0
    ) {
      return genericInvalidCredentials();
    }

    // =========================================================
    // 2. FIND AUTH ACCOUNT
    // =========================================================

    const account =
      await db.orm.public.AuthAccount
        .where({
          loginIdentifier,
        })
        .first();

    if (!account || !account.isActive) {
      return genericInvalidCredentials();
    }

    // =========================================================
    // 3. VERIFY ACTOR
    // =========================================================

    const actor =
      await db.orm.public.Actor
        .where({
          id: account.actorId,
        })
        .first();

    if (!actor || !actor.isActive) {
      return genericInvalidCredentials();
    }

    // =========================================================
    // 4. CHECK TEMPORARY LOCK
    // =========================================================

    const now = new Date();

    if (account.lockedUntil) {
      const lockedUntil =
        new Date(account.lockedUntil);

      if (
        lockedUntil.getTime() >
        now.getTime()
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Account temporarily locked. Try again later.",
          },
          { status: 423 }
        );
      }

      // Lock expired. Clear it before
      // evaluating the new login attempt.

      await db.orm.public.AuthAccount
        .where({
          id: account.id,
        })
        .update({
          failedLoginAttempts: 0,
          lockedUntil: null,
        });
    }

    // =========================================================
    // 5. VERIFY PASSWORD
    // =========================================================

    const passwordResult =
      await verifyPassword(
        body.password,
        account.passwordHash
      );

    if (!passwordResult.valid) {
      const previousAttempts =
        account.lockedUntil
          ? 0
          : account.failedLoginAttempts;

      const failedLoginAttempts =
        previousAttempts + 1;

      const shouldLock =
        failedLoginAttempts >=
        MAX_FAILED_ATTEMPTS;

      const lockedUntil =
        shouldLock
          ? getLockExpiration()
              .toISOString()
          : null;

      await db.orm.public.AuthAccount
        .where({
          id: account.id,
        })
        .update({
          failedLoginAttempts,
          lockedUntil,
        });

      // Record the security event without
      // storing the attempted password.

      await db.orm.public.KernelEvent.create({
        eventId:
          `AUTH-LOGIN-FAILED-${crypto.randomUUID()}`,

        eventType:
          "AUTH_LOGIN_FAILED",

        organizationId:
          actor.organizationId,

        locationId: null,
        actorId: actor.id,

        entityType:
          "AUTH_ACCOUNT",

        entityId:
          String(account.id),

        entityCode:
          actor.code,

        source: "LARCOOS",

        payload: JSON.stringify({
          failedLoginAttempts,
          accountLocked: shouldLock,
        }),

        occurredAt:
          new Date().toISOString(),
      });

      return genericInvalidCredentials();
    }

    // =========================================================
    // 6. SUCCESSFUL AUTHENTICATION
    // =========================================================

    const loginTime =
      new Date().toISOString();

    await db.orm.public.AuthAccount
      .where({
        id: account.id,
      })
      .update({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: loginTime,
      });

    // =========================================================
    // 7. CREATE SERVER SESSION + HTTPONLY COOKIE
    // =========================================================

    const session =
      await createAuthenticatedSession(
        account.id
      );

    // =========================================================
    // 8. IMMUTABLE AUTH EVENT
    // =========================================================

    await db.orm.public.KernelEvent.create({
      eventId:
        `AUTH-LOGIN-SUCCEEDED-${crypto.randomUUID()}`,

      eventType:
        "AUTH_LOGIN_SUCCEEDED",

      organizationId:
        actor.organizationId,

      locationId: null,
      actorId: actor.id,

      entityType:
        "AUTH_SESSION",

      entityId:
        String(session.id),

      entityCode:
        actor.code,

      source: "LARCOOS",

      payload: JSON.stringify({
        accountId: account.id,
        systemRole:
          actor.systemRole,
      }),

      occurredAt: loginTime,
    });

    // =========================================================
    // 9. SAFE RESPONSE
    // =========================================================

    return NextResponse.json({
      success: true,

      actor: {
        id: actor.id,
        code: actor.code,
        displayName:
          actor.displayName,
        systemRole:
          actor.systemRole,

        permissions: {
          canEditCompletedRecords:
            actor.canEditCompletedRecords,

          canManageUsers:
            actor.canManageUsers,

          canApproveFinancials:
            actor.canApproveFinancials,

          canManageKernel:
            actor.canManageKernel,
        },
      },

      session: {
        expiresAt:
          session.expiresAt,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/auth/login failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Authentication service unavailable.",
      },
      { status: 500 }
    );
  }
}