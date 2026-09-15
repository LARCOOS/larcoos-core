"use client";

import { useMemo } from "react";

type Pallet = {
  id: number;
  code: string;
  palletNumber: number;
  status: string;
  description: string | null;
  category: string | null;
  condition: string | null;
  estimatedPieces: number | null;
  processedPieces: number;
};

type PalletGridProps = {
  truckloadCode: string;
  expectedPallets: number;
  pallets: Pallet[];
};

export default function PalletGrid({
  truckloadCode,
  expectedPallets,
  pallets,
}: PalletGridProps) {
  const processedPallets = useMemo(
    () =>
      pallets.filter(
        (pallet) => pallet.status !== "Pending"
      ).length,
    [pallets]
  );

  const pendingPallets = pallets.length - processedPallets;

  const totalProcessedPieces = useMemo(
    () =>
      pallets.reduce(
        (total, pallet) =>
          total + Number(pallet.processedPieces || 0),
        0
      ),
    [pallets]
  );

  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Inventory & Pallets
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Individual pallet records for {truckloadCode}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Expected
            </p>

            <p className="mt-1 text-xl font-bold">
              {expectedPallets}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registered
            </p>

            <p className="mt-1 text-xl font-bold">
              {pallets.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending
            </p>

            <p className="mt-1 text-xl font-bold">
              {pendingPallets}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pieces
            </p>

            <p className="mt-1 text-xl font-bold">
              {totalProcessedPieces}
            </p>
          </div>
        </div>
      </div>

      {pallets.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-10 text-center">
          <p className="font-semibold text-slate-300">
            No pallets registered
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Generate the pallet records for this truckload.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pallets.map((pallet) => (
            <div
              key={pallet.id}
              className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 transition hover:border-slate-600"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pallet
                  </p>

                  <h3 className="mt-1 text-xl font-bold">
                    P
                    {String(pallet.palletNumber).padStart(
                      2,
                      "0"
                    )}
                  </h3>
                </div>

                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
                  {pallet.status}
                </span>
              </div>

              <p className="mt-4 break-all text-xs text-slate-500">
                {pallet.code}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <p className="text-xs text-slate-500">
                    Category
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {pallet.category || "—"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <p className="text-xs text-slate-500">
                    Condition
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {pallet.condition || "—"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <p className="text-xs text-slate-500">
                    Estimated
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {pallet.estimatedPieces ?? "—"}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <p className="text-xs text-slate-500">
                    Processed
                  </p>

                  <p className="mt-1 text-sm font-semibold">
                    {pallet.processedPieces}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-800 pt-4">
                <p className="text-sm text-slate-400">
                  {pallet.description ||
                    "No merchandise description yet."}
                </p>
              </div>

              <button
                type="button"
                disabled
                className="mt-5 w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-500"
              >
                Open Pallet
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}