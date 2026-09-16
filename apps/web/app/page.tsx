import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/auth/SignOutButton";
import { db } from "@/src/prisma/db";
import { getAuthenticatedSession } from "@/src/kernel/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getAuthenticatedSession();

  if (!session) {
    redirect("/login");
  }

  const memberships =
    await db.orm.public.OrganizationMembership
      .where({
        actorId: session.actor.id,
        isActive: true,
      })
      .all();

  const organizations =
    await db.orm.public.Organization
      .where({})
      .all();

  const organizationById = new Map(
    organizations.map((organization) => [
      organization.id,
      organization,
    ])
  );

  const workspaces = memberships
    .map((membership) => {
      const organization =
        organizationById.get(
          membership.organizationId
        );

      if (!organization) {
        return null;
      }

      return {
        membership,
        organization,
      };
    })
    .filter(
      (
        workspace
      ): workspace is NonNullable<
        typeof workspace
      > => workspace !== null
    );

  const primaryWorkspace =
    session.actor.organizationId === null
      ? null
      : workspaces.find(
          (workspace) =>
            workspace.organization.id ===
            session.actor.organizationId
        ) ?? null;

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <header className="flex flex-col gap-6 border-b border-neutral-800 pb-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-neutral-500">
              LARCOOS Kernel
            </div>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              LARCOOS
            </h1>

            <p className="mt-2 text-neutral-400">
              Operating System for the LARCOOS Network
            </p>
          </div>

          <div className="min-w-72 rounded-2xl border border-neutral-800 bg-neutral-900 px-5 py-4">
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Authenticated Actor
            </div>

            <div className="mt-1 font-semibold">
              {session.actor.displayName}
            </div>

            <div className="mt-1 text-sm text-neutral-400">
              {session.actor.code}
            </div>

            <SignOutButton />
          </div>
        </header>

        <section className="py-10">
          <div className="mb-6">
            <div className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Authorized Workspaces
            </div>

            <h2 className="mt-2 text-3xl font-bold">
              Select an organization
            </h2>

            <p className="mt-2 max-w-2xl text-neutral-400">
              Your authenticated identity determines
              who you are. Organization membership
              determines what you can access and manage
              inside each LARCOOS workspace.
            </p>
          </div>

          {workspaces.length === 0 ? (
            <div className="rounded-3xl border border-amber-900 bg-amber-950/20 p-8">
              <div className="text-lg font-semibold text-amber-300">
                No active workspace memberships
              </div>

              <p className="mt-2 text-sm text-amber-200/70">
                Your account is authenticated, but it
                does not currently have access to an
                active organization.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map(
                ({ membership, organization }) => {
                  const isPrimary =
                    primaryWorkspace?.organization.id ===
                    organization.id;

                  const isLdc =
                    organization.code === "LDC";

                  return (
                    <article
                      key={membership.id}
                      className="rounded-3xl border border-emerald-900/70 bg-emerald-950/15 p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                            {organization.code}
                          </div>

                          <h3 className="mt-2 text-xl font-bold">
                            {organization.name}
                          </h3>
                        </div>

                        {isPrimary ? (
                          <span className="rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-300">
                            PRIMARY
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-5 space-y-2 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-500">
                            Organization Type
                          </span>

                          <span className="text-right text-neutral-300">
                            {organization.type}
                          </span>
                        </div>

                        <div className="flex justify-between gap-4">
                          <span className="text-neutral-500">
                            Role
                          </span>

                          <span className="font-semibold text-neutral-200">
                            {membership.systemRole}
                          </span>
                        </div>
                      </div>

                      <div className="mt-6">
                        {isLdc ? (
                          <Link
                            href="/ldc/truckloads"
                            className="block rounded-xl bg-white px-4 py-3 text-center font-semibold text-black transition hover:bg-neutral-200"
                          >
                            Enter LDC Workspace
                          </Link>
                        ) : (
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-center text-sm text-neutral-500">
                            Workspace module coming soon
                          </div>
                        )}
                      </div>
                    </article>
                  );
                }
              )}
            </div>
          )}
        </section>

        <section className="grid gap-4 border-t border-neutral-800 pt-8 md:grid-cols-3">
          <KernelCard
            title="Identity"
            value="Authenticated"
          />

          <KernelCard
            title="Organizations"
            value={String(workspaces.length)}
          />

          <KernelCard
            title="Kernel"
            value="Multi-Organization"
          />
        </section>

        <footer className="mt-12 border-t border-neutral-900 pt-6 text-xs text-neutral-600">
          LARCOOS Kernel • Authenticated Workspace Layer
        </footer>
      </div>
    </main>
  );
}

function KernelCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </div>

      <div className="mt-2 text-lg font-semibold">
        {value}
      </div>
    </div>
  );
}