import { cookies } from "next/headers";
import { db } from "@/src/prisma/db";
import {
  AUTH_SESSION_COOKIE_NAME,
  generateSessionToken,
  getExpiredSessionCookieOptions,
  getSessionCookieOptions,
  getSessionExpirationDate,
  hashSessionToken,
} from "./auth";
import type { AuthorizedActor } from "./authorization";

export type AuthenticatedSession = {
  sessionId: number;
  accountId: number;
  expiresAt: string;
  actor: AuthorizedActor;
};

function mapActor(actor: {
  id: number;
  code: string;
  displayName: string;
  systemRole: string;
  canEditCompletedRecords: boolean;
  canManageUsers: boolean;
  canApproveFinancials: boolean;
  canManageKernel: boolean;
  organizationId: number | null;
  isActive: boolean;
}): AuthorizedActor {
  return {
    id: actor.id,
    code: actor.code,
    displayName: actor.displayName,
    systemRole: actor.systemRole,
    canEditCompletedRecords:
      actor.canEditCompletedRecords,
    canManageUsers: actor.canManageUsers,
    canApproveFinancials:
      actor.canApproveFinancials,
    canManageKernel: actor.canManageKernel,
    organizationId: actor.organizationId,
    isActive: actor.isActive,
  };
}

export async function createAuthenticatedSession(
  accountId: number
) {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = getSessionExpirationDate();

  const session =
    await db.orm.public.AuthSession.create({
      accountId,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
    });

  if (!session) {
    throw new Error(
      "Authentication session could not be created"
    );
  }

  const cookieStore = await cookies();

  cookieStore.set(
    AUTH_SESSION_COOKIE_NAME,
    rawToken,
    getSessionCookieOptions(expiresAt)
  );

  return session;
}

export async function getAuthenticatedSession():
  Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();

  const rawToken = cookieStore.get(
    AUTH_SESSION_COOKIE_NAME
  )?.value;

  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);

  const session =
    await db.orm.public.AuthSession
      .where({ tokenHash })
      .first();

  if (!session) {
    return null;
  }

  if (session.revokedAt) {
    return null;
  }

  const now = new Date();

  if (
    new Date(session.expiresAt).getTime() <=
    now.getTime()
  ) {
    return null;
  }

  const account =
    await db.orm.public.AuthAccount
      .where({ id: session.accountId })
      .first();

  if (!account || !account.isActive) {
    return null;
  }

  const actor =
    await db.orm.public.Actor
      .where({ id: account.actorId })
      .first();

  if (!actor || !actor.isActive) {
    return null;
  }

  return {
    sessionId: session.id,
    accountId: account.id,
    expiresAt: session.expiresAt,
    actor: mapActor(actor),
  };
}

export async function requireAuthenticatedSession() {
  const session =
    await getAuthenticatedSession();

  if (!session) {
    throw new Error(
      "Authentication required"
    );
  }

  return session;
}

export async function getAuthenticatedActor() {
  const session =
    await requireAuthenticatedSession();

  return session.actor;
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();

  const rawToken = cookieStore.get(
    AUTH_SESSION_COOKIE_NAME
  )?.value;

  if (rawToken) {
    const tokenHash =
      hashSessionToken(rawToken);

    const session =
      await db.orm.public.AuthSession
        .where({ tokenHash })
        .first();

    if (session && !session.revokedAt) {
      await db.orm.public.AuthSession
        .where({ id: session.id })
        .update({
          revokedAt:
            new Date().toISOString(),
        });
    }
  }

  cookieStore.set(
    AUTH_SESSION_COOKIE_NAME,
    "",
    getExpiredSessionCookieOptions()
  );
}
