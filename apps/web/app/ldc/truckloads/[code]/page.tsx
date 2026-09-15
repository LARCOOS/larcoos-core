import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/src/prisma/db";
import PaymentEditor from "@/components/truckloads/PaymentEditor";

type TruckloadDetailPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function TruckloadDetailPage({
  params,
}: TruckloadDetailPageProps) {
  const { code } = await params;

  const truckload = await db.orm.public.Truckload
    .where({ code })
    .first();

  if (!truckload) {
    notFound();
  }

  const purchase = Number(truckload.purchase);
  const freight = Number(truckload.freight);
  const amountPaid = Number(truckload.amountPaid);

  const landedCost = purchase + freight;

  const costPerPallet =
    truckload.pallets > 0
      ? landedCost / truckload.pallets
      : 0;

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <Link
            href="/ldc/truckloads"
            className="text-sm font-medium text-slate-400 transition hover:text-white"
          >
            ← Back to Truckloads
          </Link>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              LARCO Distribution Center
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              {truckload.code}
            </h1>

            <p className="mt-3 text-slate-400">
              Complete operational record for this truckload.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Operational Status
            </p>

            <p className="mt-2 text-lg font-semibold">
              {truckload.status}
            </p>
          </div>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Supplier
            </p>

            <p className="mt-2 font-semibold">
              {truckload.supplier}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Retailer
            </p>

            <p className="mt-2 font-semibold">
              {truckload.retailer}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Destination
            </p>

            <p className="mt-2 font-semibold">
              {truckload.destination}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pallets
            </p>

            <p className="mt-2 text-2xl font-bold">
              {truckload.pallets}
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Purchase
            </p>

            <p className="mt-2 text-xl font-bold">
              {money.format(purchase)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Freight
            </p>

            <p className="mt-2 text-xl font-bold">
              {money.format(freight)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Landed Cost
            </p>

            <p className="mt-2 text-xl font-bold">
              {money.format(landedCost)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Cost / Pallet
            </p>

            <p className="mt-2 text-xl font-bold">
              {money.format(costPerPallet)}
            </p>
          </div>
        </section>

        <div className="mt-6">
          <PaymentEditor
            code={truckload.code}
            purchase={purchase}
            initialPaymentMethod={truckload.paymentMethod}
            initialPaymentStatus={truckload.paymentStatus}
            initialAmountPaid={amountPaid}
            initialPaymentDueDate={
              truckload.paymentDueDate ?? null
            }
            initialPaymentCountry={
              truckload.paymentCountry ?? null
            }
          />
        </div>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div>
            <h2 className="text-xl font-semibold">
              Operations
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Processing, manifest, loading and export workflow.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Unloading
              </p>

              <p className="mt-2 font-semibold">
                Pending
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Processing
              </p>

              <p className="mt-2 font-semibold">
                Pending
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Manifest
              </p>

              <p className="mt-2 font-semibold">
                Pending
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Export
              </p>

              <p className="mt-2 font-semibold">
                Pending
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold">
            Inventory & Pallets
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Individual pallet inventory and merchandise records
            will be connected here.
          </p>

          <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center">
            <p className="font-medium text-slate-300">
              {truckload.pallets} pallets registered
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Pallet-level inventory module coming next.
            </p>
          </div>
        </section>

        <div className="mt-6 text-sm text-slate-600">
          Database ID #{truckload.id}
        </div>
      </div>
    </main>
  );
}