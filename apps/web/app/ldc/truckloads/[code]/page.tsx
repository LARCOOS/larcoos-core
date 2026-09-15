import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/src/prisma/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TruckloadPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function TruckloadPage({
  params,
}: TruckloadPageProps) {
  const { code } = await params;

  const truckload = await db.orm.public.Truckload
    .where({
      code: decodeURIComponent(code),
    })
    .first();

  if (!truckload) {
    notFound();
  }

  const purchase = Number(truckload.purchase);
  const freight = Number(truckload.freight);
  const landedCost = purchase + freight;
  const costPerPallet =
    truckload.pallets > 0 ? landedCost / truckload.pallets : 0;

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white md:p-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/ldc/truckloads"
          className="text-sm text-slate-400 transition hover:text-white"
        >
          ← Back to Truckloads
        </Link>

        <div className="mt-6 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-slate-500">
              LDC LLC / Truckload
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight">
              {truckload.code}
            </h1>

            <p className="mt-2 text-slate-400">
              {truckload.supplier} · {truckload.retailer}
            </p>
          </div>

          <span className="w-fit rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold">
            {truckload.status}
          </span>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Pallets"
            value={truckload.pallets.toLocaleString()}
          />

          <Metric
            label="Purchase"
            value={money.format(purchase)}
          />

          <Metric
            label="Freight"
            value={money.format(freight)}
          />

          <Metric
            label="Landed Cost"
            value={money.format(landedCost)}
          />
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold">
              Truckload Information
            </h2>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <Detail
                label="Supplier"
                value={truckload.supplier}
              />

              <Detail
                label="Retailer"
                value={truckload.retailer}
              />

              <Detail
                label="Destination"
                value={truckload.destination}
              />

              <Detail
                label="Status"
                value={truckload.status}
              />

              <Detail
                label="Cost per pallet"
                value={money.format(costPerPallet)}
              />

              <Detail
                label="Database ID"
                value={`#${truckload.id}`}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold">
              Operations
            </h2>

            <div className="mt-6 space-y-3">
              <Operation label="Receiving" />
              <Operation label="Processing" />
              <Operation label="Manifest" />
              <Operation label="Export" />
              <Operation label="Delivery to ViDaMar" />
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-xl font-semibold">
            Inventory & Pallets
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Pallet-level inventory for this truckload will be managed here.
          </p>

          <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
            No pallet inventory registered yet.
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold">
        {value}
      </p>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-slate-200">
        {value}
      </p>
    </div>
  );
}

function Operation({
  label,
}: {
  label: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
      <span className="text-sm text-slate-300">
        {label}
      </span>

      <span className="text-xs font-medium text-slate-500">
        Pending
      </span>
    </div>
  );
}