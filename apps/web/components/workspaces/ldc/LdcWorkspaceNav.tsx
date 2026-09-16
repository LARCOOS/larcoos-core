"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/auth/SignOutButton";

const modules = [
  {
    name: "Truckloads",
    href: "/ldc/truckloads",
  },
  {
    name: "Expenses",
    href: "/ldc/expenses",
  },
  {
    name: "Sales",
    href: "/ldc/sales",
  },
  {
    name: "Employment",
    href: "/ldc/employment",
  },
  {
    name: "Documents",
    href: "/ldc/documents",
  },
  {
    name: "Inventory",
    href: "/ldc/inventory",
  },
  {
    name: "Logistics",
    href: "/ldc/logistics",
  },
  {
    name: "Reports",
    href: "/ldc/reports",
  },
];

export default function LdcWorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 border-b border-neutral-800 pb-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-800 hover:text-white"
            >
              ← My Panel
            </Link>

            <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-2 text-sm font-semibold text-emerald-300">
              LDC Workspace
            </div>
          </div>

          <div className="min-w-32">
            <SignOutButton />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {modules.map((module) => {
            const active =
              pathname === module.href ||
              pathname.startsWith(`${module.href}/`);

            return (
              <Link
                key={module.href}
                href={module.href}
                className={
                  active
                    ? "whitespace-nowrap rounded-lg border border-emerald-700 bg-emerald-950/50 px-4 py-2 text-sm font-semibold text-emerald-300"
                    : "whitespace-nowrap rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-400 transition hover:border-neutral-600 hover:text-white"
                }
              >
                {module.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}