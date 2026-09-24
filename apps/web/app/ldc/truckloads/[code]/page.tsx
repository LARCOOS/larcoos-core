import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/src/prisma/db";

import PaymentEditor from "@/components/truckloads/PaymentEditor";
import ReceivingPanel from "@/components/truckloads/ReceivingPanel";
import ProcessingPanel from "@/components/truckloads/ProcessingPanel";
import PalletGrid from "@/components/truckloads/PalletGrid";

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

  const pallets = await db.orm.public.Pallet
    .where({ truckloadId: truckload.id })
    .orderBy((p) => p.palletNumber.asc())
    .all();

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
        {/* NAVIGATION */}

        <div className="mb-8">
          <Link
            href="/ldc/truckloads"
            className="text-sm font-medium text-slate-400 transition hover:text-white"
          >
            ← Back to Truckloads
          </Link>
        </div>

        {/* HEADER */}

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

        {/* TRUCKLOAD INFORMATION */}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            label="Supplier"
            value={truckload.supplier}
          />

          <InfoCard
            label="Retailer"
            value={truckload.retailer}
          />

          <InfoCard
            label="Destination"
            value={truckload.destination}
          />

          <InfoCard
            label="Pallets"
            value={String(truckload.pallets)}
            large
          />
        </section>

        {/* COSTS */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            label="Purchase"
            value={money.format(purchase)}
            large
          />

          <InfoCard
            label="Freight"
            value={money.format(freight)}
            large
          />

          <InfoCard
            label="Landed Cost"
            value={money.format(landedCost)}
            large
          />

          <InfoCard
            label="Cost / Pallet"
            value={money.format(costPerPallet)}
            large
          />
        </section>

        {/* PAYMENT */}

        <div className="mt-6">
          <PaymentEditor
            code={truckload.code}
            purchase={purchase}
            initialPaymentMethod={
              truckload.paymentMethod
            }
            initialPaymentStatus={
              truckload.paymentStatus
            }
            initialAmountPaid={amountPaid}
            initialPaymentDueDate={
              truckload.paymentDueDate ?? null
            }
            initialPaymentCountry={
              truckload.paymentCountry ?? null
            }
          />
        </div>

        {/* RECEIVING & UNLOADING */}

        <div className="mt-6">
          <ReceivingPanel
            truckloadCode={truckload.code}
          />
        </div>

        {/* PROCESSING */}

        <div className="mt-6">
          <ProcessingPanel truckloadCode={truckload.code} />
        </div>

        {/* OPERATIONS */}

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
            <OperationCard
              label="Unloading"
              value={
                truckload.status === "Unloaded"
                  ? "Completed"
                  : truckload.status === "Unloading"
                    ? "In Progress"
                    : "Pending"
              }
            />

            <OperationCard
              label="Processing"
              value="Pending"
            />

            <OperationCard
              label="Manifest"
              value="Pending"
            />

            <OperationCard
              label="Export"
              value="Pending"
            />
          </div>
        </section>

        {/* INVENTORY & PALLETS */}

        <div className="mt-6">
          <PalletGrid
            truckloadCode={truckload.code}
            expectedPallets={truckload.pallets}
            pallets={pallets}
          />
        </div>

        {/* SYSTEM FOOTER */}

        <div className="mt-8 border-t border-slate-900 pt-5 text-xs text-slate-600">
          <span>
            LARCOOS Kernel • Truckload Database ID #
            {truckload.id}
          </span>
        </div>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p
        className={[
          "mt-2 font-semibold",
          large ? "text-xl font-bold" : "",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function OperationCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-2 font-semibold">
        {value}
      </p>
    </div>
  );
}