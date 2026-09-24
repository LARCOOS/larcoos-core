"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type ProcessingPallet = {
  id: number;
  code: string;
  palletNumber: number;
  status: string;
  description: string | null;
  category: string | null;
  condition: string | null;
  estimatedPieces: number | null;
  processedPieces: number;
  palletType: string;
  processingMode: string | null;
  verificationLevel: string;
  sourcePalletId: number | null;
  processingCompleted: boolean;
  manifestReady: boolean;
};

type InventoryUnit = {
  id: number;
  unitId: string;
  unitNumber: number;
  palletId: number | null;
  sourcePalletId: number | null;

  sku: string | null;
  upc: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  brand: string | null;

  condition: string | null;
  verificationLevel: string;
  disposition: string;
  processingStatus: string;

  assignedCost: number | null;
  suggestedPrice: number | null;
  actualListPrice: number | null;
};

type ProcessingResponse = {
  success: boolean;
  error?: string;

  truckload?: {
    id: number;
    code: string;
    status: string;
    organizationId: number | null;
    locationId: number | null;
    expectedPallets: number;
  };

  processing?: {
    sourcePallets: number;
    builtPallets: number;
    totalUnits: number;
    saleReadyUnits: number;
    repairUnits: number;
    backyardUnits: number;
    disposalUnits: number;
  };

  pallets?: ProcessingPallet[];
  units?: InventoryUnit[];

  permissions?: {
    canEditCompletedRecords: boolean;
  };
};

type Props = {
  truckloadCode: string;
};

function shortCode(code: string) {
  const parts = code.split("-");
  return parts[parts.length - 1] || code;
}

function readable(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}

export default function ProcessingPanel({
  truckloadCode,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [truckloadStatus, setTruckloadStatus] =
    useState("");

  const [summary, setSummary] =
    useState<ProcessingResponse["processing"]>();

  const [pallets, setPallets] =
    useState<ProcessingPallet[]>([]);

  const [units, setUnits] =
    useState<InventoryUnit[]>([]);

  const [description, setDescription] =
    useState("");

  const [selectedDestinations, setSelectedDestinations] =
    useState<Record<number, string>>({});

  const loadProcessing = useCallback(async () => {
    try {
      setError("");

      const response = await fetch(
        `/api/processing?truckloadCode=${encodeURIComponent(
          truckloadCode
        )}`,
        {
          cache: "no-store",
        }
      );

      const data =
        (await response.json()) as ProcessingResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ?? "Could not load processing operation"
        );
      }

      setTruckloadStatus(
        data.truckload?.status ?? ""
      );

      setSummary(data.processing);
      setPallets(data.pallets ?? []);
      setUnits(data.units ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load processing operation"
      );
    } finally {
      setLoading(false);
    }
  }, [truckloadCode]);

  useEffect(() => {
    void loadProcessing();
  }, [loadProcessing]);

  const sourcePallets = useMemo(
    () =>
      pallets.filter(
        (pallet) => pallet.palletType === "SOURCE"
      ),
    [pallets]
  );

  const builtPallets = useMemo(
    () =>
      pallets.filter(
        (pallet) => pallet.palletType === "LDC_BUILT"
      ),
    [pallets]
  );

  const palletById = useMemo(
    () =>
      new Map(
        pallets.map((pallet) => [
          pallet.id,
          pallet,
        ])
      ),
    [pallets]
  );

  async function postAction(
    payload: Record<string, unknown>
  ) {
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/processing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          truckloadCode,
          ...payload,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ?? "Processing operation failed"
        );
      }

      await loadProcessing();

      return data;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Processing operation failed"
      );

      return null;
    } finally {
      setWorking(false);
    }
  }

  async function createRebuiltPallet() {
    const data = await postAction({
      action: "create-rebuilt-pallet",
      description:
        description.trim() ||
        "LDC rebuilt processing pallet",
    });

    if (!data) {
      return;
    }

    setDescription("");

    setMessage(
      `${data.pallet?.code ?? "Rebuilt pallet"} created successfully.`
    );
  }

  async function moveUnit(unit: InventoryUnit) {
    const rawDestination =
      selectedDestinations[unit.id];

    const destinationPalletId =
      Number(rawDestination);

    if (
      !Number.isInteger(destinationPalletId) ||
      destinationPalletId <= 0
    ) {
      setError(
        `Select a destination pallet for ${unit.unitId}.`
      );
      return;
    }

    const destination =
      palletById.get(destinationPalletId);

    const data = await postAction({
      action: "assign-unit-to-pallet",
      unitId: unit.id,
      palletId: destinationPalletId,
    });

    if (!data) {
      return;
    }

    setMessage(
      `${unit.unitId} moved to ${
        destination?.code ?? "destination pallet"
      }. Source lineage was preserved.`
    );
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-sm text-slate-400">
          Loading Processing...
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            LARCOOS Operations
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-white">
            Processing
          </h2>

          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Physical merchandise processing, verification,
            disposition, rebuilt pallets and permanent source
            lineage for {truckloadCode}.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Truckload Status
          </p>

          <p className="mt-1 font-semibold text-white">
            {truckloadStatus || "Unknown"}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-300">
          {message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Metric
          label="Source Pallets"
          value={summary?.sourcePallets ?? 0}
        />

        <Metric
          label="LDC Built"
          value={summary?.builtPallets ?? 0}
        />

        <Metric
          label="Units"
          value={summary?.totalUnits ?? 0}
        />

        <Metric
          label="Sale Ready"
          value={summary?.saleReadyUnits ?? 0}
        />

        <Metric
          label="Repair"
          value={summary?.repairUnits ?? 0}
        />

        <Metric
          label="Backyard"
          value={summary?.backyardUnits ?? 0}
        />

        <Metric
          label="Disposal"
          value={summary?.disposalUnits ?? 0}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Original Physical Intake
            </p>

            <h3 className="mt-1 text-lg font-semibold">
              Source Pallets
            </h3>
          </div>

          {sourcePallets.length === 0 ? (
            <p className="mt-5 text-sm text-slate-500">
              No source pallets registered.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {sourcePallets.map((pallet) => (
                <div
                  key={pallet.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold">
                        {shortCode(pallet.code)}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {pallet.code}
                      </p>
                    </div>

                    <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
                      SOURCE
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">
                        Mode
                      </span>
                      <span className="text-right">
                        {readable(
                          pallet.processingMode
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">
                        Verification
                      </span>
                      <span className="text-right">
                        {readable(
                          pallet.verificationLevel
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">
                        Processed
                      </span>
                      <span>
                        {pallet.processedPieces}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                LDC Transformation
              </p>

              <h3 className="mt-1 text-lg font-semibold">
                Rebuilt Pallets
              </h3>
            </div>

            <span className="text-sm text-slate-500">
              {builtPallets.length} built
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Optional pallet description"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-slate-500"
            />

            <button
              type="button"
              disabled={working}
              onClick={() => {
                void createRebuiltPallet();
              }}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working
                ? "Working..."
                : "+ Create Rebuilt Pallet"}
            </button>
          </div>

          {builtPallets.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-8 text-center">
              <p className="font-semibold text-slate-300">
                No rebuilt pallets yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Create R01 when LDC begins rebuilding
                merchandise.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {builtPallets.map((pallet) => (
                <div
                  key={pallet.id}
                  className="rounded-xl border border-slate-700 bg-slate-950 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold">
                        {shortCode(pallet.code)}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {pallet.code}
                      </p>
                    </div>

                    <span className="rounded-full border border-blue-900 bg-blue-950/30 px-2 py-1 text-xs font-semibold text-blue-300">
                      LDC BUILT
                    </span>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Current Units
                      </p>

                      <p className="mt-1 text-2xl font-bold">
                        {pallet.processedPieces}
                      </p>
                    </div>

                    <p className="text-xs text-slate-500">
                      {pallet.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Permanent Traceability
          </p>

          <h3 className="mt-1 text-lg font-semibold">
            Inventory Units & Lineage
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Original source pallet never changes. Current pallet
            represents the unit&apos;s present physical location.
          </p>
        </div>

        {units.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-700 p-10 text-center">
            <p className="font-semibold text-slate-300">
              No inventory units processed yet
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Units created during full processing will appear
              here.
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-3">
                    Unit
                  </th>
                  <th className="px-3 py-3">
                    Merchandise
                  </th>
                  <th className="px-3 py-3">
                    Condition
                  </th>
                  <th className="px-3 py-3">
                    Verification
                  </th>
                  <th className="px-3 py-3">
                    Disposition
                  </th>
                  <th className="px-3 py-3">
                    Lineage
                  </th>
                  <th className="px-3 py-3">
                    Move
                  </th>
                </tr>
              </thead>

              <tbody>
                {units.map((unit) => {
                  const source =
                    unit.sourcePalletId === null
                      ? null
                      : palletById.get(
                          unit.sourcePalletId
                        );

                  const current =
                    unit.palletId === null
                      ? null
                      : palletById.get(
                          unit.palletId
                        );

                  return (
                    <tr
                      key={unit.id}
                      className="border-b border-slate-900 align-top"
                    >
                      <td className="px-3 py-4">
                        <p className="font-semibold">
                          I
                          {String(
                            unit.unitNumber
                          ).padStart(4, "0")}
                        </p>

                        <p className="mt-1 max-w-[180px] break-all text-xs text-slate-600">
                          {unit.unitId}
                        </p>
                      </td>

                      <td className="px-3 py-4">
                        <p className="max-w-[220px] font-medium">
                          {unit.title ||
                            unit.description ||
                            unit.sku ||
                            "Unidentified item"}
                        </p>

                        {unit.sku && (
                          <p className="mt-1 text-xs text-slate-500">
                            SKU {unit.sku}
                          </p>
                        )}
                      </td>

                      <td className="px-3 py-4">
                        {readable(unit.condition)}
                      </td>

                      <td className="px-3 py-4">
                        {readable(
                          unit.verificationLevel
                        )}
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold">
                          {readable(
                            unit.disposition
                          )}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap font-semibold">
                          <span className="rounded-lg border border-slate-700 px-2 py-1">
                            {source
                              ? shortCode(
                                  source.code
                                )
                              : "SOURCE ?"}
                          </span>

                          <span className="text-slate-600">
                            →
                          </span>

                          <span className="rounded-lg border border-slate-700 px-2 py-1">
                            I
                            {String(
                              unit.unitNumber
                            ).padStart(4, "0")}
                          </span>

                          <span className="text-slate-600">
                            →
                          </span>

                          <span className="rounded-lg border border-blue-900 bg-blue-950/20 px-2 py-1 text-blue-300">
                            {current
                              ? shortCode(
                                  current.code
                                )
                              : "UNASSIGNED"}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex min-w-[250px] gap-2">
                          <select
                            value={
                              selectedDestinations[
                                unit.id
                              ] ?? ""
                            }
                            onChange={(event) =>
                              setSelectedDestinations(
                                (currentSelections) => ({
                                  ...currentSelections,
                                  [unit.id]:
                                    event.target
                                      .value,
                                })
                              )
                            }
                            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                          >
                            <option value="">
                              Destination...
                            </option>

                            {builtPallets.map(
                              (pallet) => (
                                <option
                                  key={pallet.id}
                                  value={pallet.id}
                                  disabled={
                                    pallet.id ===
                                    unit.palletId
                                  }
                                >
                                  {shortCode(
                                    pallet.code
                                  )}
                                  {pallet.id ===
                                  unit.palletId
                                    ? " (Current)"
                                    : ""}
                                </option>
                              )
                            )}
                          </select>

                          <button
                            type="button"
                            disabled={
                              working ||
                              builtPallets.length ===
                                0
                            }
                            onClick={() => {
                              void moveUnit(unit);
                            }}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 font-semibold transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Move
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
