import { notFound } from "next/navigation";
import LdcWorkspaceNav from "@/components/workspaces/ldc/LdcWorkspaceNav";

const modules = {
  expenses: {
    title: "Expenses",
    description: "Company expenses, operating costs, vendors, receipts and cash outflows.",
    sections: ["Expense Registry", "Vendors", "Receipts", "Categories"],
  },
  sales: {
    title: "Sales",
    description: "LDC sales, customers, invoices, revenue and payment activity.",
    sections: ["Sales Registry", "Customers", "Invoices", "Revenue"],
  },
  employment: {
    title: "Employment",
    description: "Employees, roles, work activity, payroll information and workforce records.",
    sections: ["Employees", "Roles", "Work Activity", "Payroll"],
  },
  documents: {
    title: "Documents",
    description: "Central document center for LDC company and operational records.",
    sections: ["Company Documents", "Operational Documents", "Receipts & Invoices", "Compliance"],
  },
  inventory: {
    title: "Inventory",
    description: "Inventory created from truckloads, pallets and processed merchandise.",
    sections: ["Inventory Registry", "Pallets", "Items", "Conditions"],
  },
  logistics: {
    title: "Logistics",
    description: "Transportation, routes, carriers, exports and LDC logistics operations.",
    sections: ["Shipments", "Carriers", "Routes", "Cross-Border"],
  },
  reports: {
    title: "Reports",
    description: "Operational, financial and AI-assisted reporting for LDC.",
    sections: ["Operations", "Financial", "Performance", "AI Analysis"],
  },
} as const;

type ModuleKey = keyof typeof modules;

export default async function LdcModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;

  if (!(module in modules)) {
    notFound();
  }

  const moduleKey = module as ModuleKey;
  const currentModule = modules[moduleKey];

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <LdcWorkspaceNav />

        <header className="mb-8">
          <p className="text-sm font-medium text-neutral-500">
            LDC LLC / {currentModule.title.toUpperCase()}
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {currentModule.title}
          </h1>

          <p className="mt-3 max-w-3xl text-neutral-400">
            {currentModule.description}
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {currentModule.sections.map((section) => (
            <article
              key={section}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                {currentModule.title}
              </div>

              <h2 className="mt-2 text-lg font-semibold">
                {section}
              </h2>

              <p className="mt-3 text-sm leading-6 text-neutral-500">
                Module foundation ready for implementation.
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-emerald-900/50 bg-emerald-950/10 p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            LARCOOS Kernel
          </div>

          <h2 className="mt-2 text-lg font-semibold">
            {currentModule.title} module initialized
          </h2>

          <p className="mt-2 text-sm leading-6 text-neutral-400">
            This workspace is now part of the LDC module architecture.
            Its database models, permissions, events and operational
            workflows will be added as the module becomes active.
          </p>
        </section>
      </div>
    </main>
  );
}