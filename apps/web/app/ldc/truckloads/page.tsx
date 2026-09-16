"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import LdcWorkspaceNav from "@/components/workspaces/ldc/LdcWorkspaceNav";

type ApiTruckload = {
  id: number;
  code: string;
  supplier: string;
  retailer: string;
  pallets: number;
  purchase: string | number;
  freight: string | number;
  destination: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type Truckload = {
  id: number;
  code: string;
  supplier: string;
  retailer: string;
  pallets: number;
  purchase: number;
  freight: number;
  destination: string;
  status: string;
};

type Sale = {
  id: number;
  code: string;
  truckloadId: number | null;
  customerName: string | null;
  paymentStatus: string;
  currency: string;
  grossAmount: number;
  amountReceived: number;
  balance: number;
};

type TruckloadSalesSummary = {
  saleCount: number;
  grossAmount: number;
  amountReceived: number;
  balance: number;
  paymentStatus: string;
  currency: string;
};

function normalizeTruckload(
  load: ApiTruckload
): Truckload {
  return {
    id: load.id,
    code: load.code,
    supplier: load.supplier,
    retailer: load.retailer,
    pallets: load.pallets,
    purchase: Number(load.purchase),
    freight: Number(load.freight),
    destination: load.destination,
    status: load.status,
  };
}

function formatMoney(
  value: number,
  currency = "USD"
) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function operationalStatusClass(status: string) {
  if (
    status === "Delivered" ||
    status === "Ready for Export"
  ) {
    return "border-emerald-800 bg-emerald-950/40 text-emerald-300";
  }

  if (
    status === "Received" ||
    status === "Processing" ||
    status === "Unloading" ||
    status === "Unloaded" ||
    status === "In Transit"
  ) {
    return "border-amber-800 bg-amber-950/40 text-amber-300";
  }

  return "border-neutral-700 bg-neutral-800 text-neutral-300";
}

function paymentStatusClass(status: string) {
  if (status === "Paid in Full") {
    return "border-emerald-800 bg-emerald-950/50 text-emerald-300";
  }

  if (status === "Partial") {
    return "border-amber-800 bg-amber-950/50 text-amber-300";
  }

  if (status === "Unpaid") {
    return "border-red-900 bg-red-950/30 text-red-300";
  }

  return "border-neutral-700 bg-neutral-950 text-neutral-500";
}

export default function TruckloadsPage() {
  const [truckloads, setTruckloads] =
    useState<Truckload[]>([]);

  const [sales, setSales] =
    useState<Sale[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [showForm, setShowForm] =
    useState(false);

  const [supplier, setSupplier] =
    useState("");

  const [retailer, setRetailer] =
    useState("");

  const [pallets, setPallets] =
    useState("24");

  const [purchase, setPurchase] =
    useState("");

  const [freight, setFreight] =
    useState("");

  const [destination, setDestination] =
    useState("ViDaMar - Puruandiro");

  const [status, setStatus] =
    useState("Planned");

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [truckloadsResponse, salesResponse] =
        await Promise.all([
          fetch("/api/truckloads", {
            cache: "no-store",
          }),
          fetch("/api/sales", {
            cache: "no-store",
          }),
        ]);

      if (!truckloadsResponse.ok) {
        throw new Error(
          "Failed to load truckloads"
        );
      }

      if (!salesResponse.ok) {
        const result = await salesResponse
          .json()
          .catch(() => null);

        throw new Error(
          result?.error ??
            "Failed to load sales"
        );
      }

      const truckloadsData: ApiTruckload[] =
        await truckloadsResponse.json();

      const salesData: Sale[] =
        await salesResponse.json();

      setTruckloads(
        truckloadsData.map(normalizeTruckload)
      );

      setSales(salesData);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not load LDC truckload data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const salesByTruckload = useMemo(() => {
    const summaries =
      new Map<number, TruckloadSalesSummary>();

    for (const sale of sales) {
      if (sale.truckloadId === null) {
        continue;
      }

      const existing =
        summaries.get(sale.truckloadId);

      const grossAmount =
        Number(sale.grossAmount);

      const amountReceived =
        Number(sale.amountReceived);

      const balance =
        Number(sale.balance);

      if (!existing) {
        summaries.set(
          sale.truckloadId,
          {
            saleCount: 1,
            grossAmount,
            amountReceived,
            balance,
            paymentStatus:
              balance <= 0
                ? "Paid in Full"
                : amountReceived > 0
                  ? "Partial"
                  : "Unpaid",
            currency: sale.currency,
          }
        );

        continue;
      }

      existing.saleCount += 1;
      existing.grossAmount += grossAmount;
      existing.amountReceived +=
        amountReceived;
      existing.balance += balance;

      if (existing.balance <= 0) {
        existing.paymentStatus =
          "Paid in Full";
      } else if (
        existing.amountReceived > 0
      ) {
        existing.paymentStatus =
          "Partial";
      } else {
        existing.paymentStatus =
          "Unpaid";
      }
    }

    return summaries;
  }, [sales]);

  const totalCost =
    truckloads.reduce(
      (total, load) =>
        total +
        load.purchase +
        load.freight,
      0
    );

  const totalPallets =
    truckloads.reduce(
      (total, load) =>
        total + load.pallets,
      0
    );

  const costPerPallet =
    totalPallets > 0
      ? totalCost / totalPallets
      : 0;

  async function createTruckload(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const purchaseNumber =
      Number(purchase);

    const freightNumber =
      Number(freight);

    const palletNumber =
      Number(pallets);

    if (
      !supplier.trim() ||
      !retailer.trim() ||
      !destination.trim() ||
      !Number.isInteger(palletNumber) ||
      palletNumber <= 0 ||
      !Number.isFinite(purchaseNumber) ||
      purchaseNumber < 0 ||
      !Number.isFinite(freightNumber) ||
      freightNumber < 0
    ) {
      setError(
        "Please enter valid truckload information."
      );

      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        "/api/truckloads",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            supplier:
              supplier.trim(),
            retailer:
              retailer.trim(),
            pallets:
              palletNumber,
            purchase:
              purchaseNumber,
            freight:
              freightNumber,
            destination:
              destination.trim(),
            status,
          }),
        }
      );

      if (!response.ok) {
        const result =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          result?.error ??
            "Failed to create truckload"
        );
      }

      setSupplier("");
      setRetailer("");
      setPallets("24");
      setPurchase("");
      setFreight("");
      setDestination(
        "ViDaMar - Puruandiro"
      );
      setStatus("Planned");
      setShowForm(false);

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not save the truckload to the database."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mx-auto max-w-[1500px]">
        <LdcWorkspaceNav />

        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">
              LDC LLC / OPERATIONS
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Truckloads
            </h1>

            <p className="mt-2 text-neutral-400">
              Physical operations, procurement costs
              and customer receivables by truckload.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setError("");
              setShowForm(true);
            }}
            className="rounded-lg bg-white px-5 py-3 font-semibold text-black hover:bg-neutral-200"
          >
            + New Truckload
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <Metric
            title="Truckloads"
            value={String(
              truckloads.length
            )}
          />

          <Metric
            title="Total Pallets"
            value={String(
              totalPallets
            )}
          />

          <Metric
            title="Landed Cost"
            value={formatMoney(
              totalCost
            )}
          />

          <Metric
            title="Cost / Pallet"
            value={formatMoney(
              costPerPallet
            )}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 px-6 py-5">
            <h2 className="text-lg font-semibold">
              LDC Truckload Registry
            </h2>

            <p className="mt-1 text-sm text-neutral-500">
              Operational status and customer
              receivables remain separate.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] text-left text-sm">
              <thead className="bg-neutral-950 text-neutral-500">
                <tr>
                  <th className="px-5 py-4">
                    ID
                  </th>

                  <th className="px-5 py-4">
                    Supplier
                  </th>

                  <th className="px-5 py-4">
                    Retailer
                  </th>

                  <th className="px-5 py-4">
                    Pallets
                  </th>

                  <th className="px-5 py-4">
                    Purchase
                  </th>

                  <th className="px-5 py-4">
                    Freight
                  </th>

                  <th className="px-5 py-4">
                    Landed Cost
                  </th>

                  <th className="px-5 py-4">
                    Destination
                  </th>

                  <th className="px-5 py-4">
                    Operational Status
                  </th>

                  <th className="px-5 py-4">
                    Customer Payment
                  </th>

                  <th className="px-5 py-4 text-right">
                    Collected
                  </th>

                  <th className="px-5 py-4 text-right">
                    Balance
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-6 py-10 text-center text-neutral-500"
                    >
                      Loading truckloads...
                    </td>
                  </tr>
                ) : truckloads.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-6 py-10 text-center text-neutral-500"
                    >
                      No truckloads registered.
                    </td>
                  </tr>
                ) : (
                  truckloads.map(
                    (load) => {
                      const landed =
                        load.purchase +
                        load.freight;

                      const saleSummary =
                        salesByTruckload.get(
                          load.id
                        );

                      return (
                        <tr
                          key={load.id}
                          className="border-t border-neutral-800"
                        >
                          <td className="px-5 py-5 font-semibold">
                            <Link
                              href={`/ldc/truckloads/${encodeURIComponent(
                                load.code
                              )}`}
                              className="transition hover:underline"
                            >
                              {load.code}
                            </Link>
                          </td>

                          <td className="px-5 py-5">
                            {load.supplier}
                          </td>

                          <td className="px-5 py-5">
                            {load.retailer}
                          </td>

                          <td className="px-5 py-5">
                            {load.pallets}
                          </td>

                          <td className="px-5 py-5">
                            {formatMoney(
                              load.purchase
                            )}
                          </td>

                          <td className="px-5 py-5">
                            {formatMoney(
                              load.freight
                            )}
                          </td>

                          <td className="px-5 py-5 font-semibold">
                            {formatMoney(
                              landed
                            )}
                          </td>

                          <td className="px-5 py-5">
                            {load.destination}
                          </td>

                          <td className="px-5 py-5">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${operationalStatusClass(
                                load.status
                              )}`}
                            >
                              {load.status}
                            </span>
                          </td>

                          <td className="px-5 py-5">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paymentStatusClass(
                                saleSummary
                                  ?.paymentStatus ??
                                  "No Sale"
                              )}`}
                            >
                              {saleSummary
                                ?.paymentStatus ??
                                "No Sale"}
                            </span>

                            {saleSummary &&
                              saleSummary.saleCount >
                                1 && (
                                <div className="mt-1 text-xs text-neutral-500">
                                  {
                                    saleSummary.saleCount
                                  }{" "}
                                  sales
                                </div>
                              )}
                          </td>

                          <td className="px-5 py-5 text-right font-medium text-emerald-400">
                            {saleSummary
                              ? formatMoney(
                                  saleSummary.amountReceived,
                                  saleSummary.currency
                                )
                              : "—"}
                          </td>

                          <td className="px-5 py-5 text-right font-medium">
                            {saleSummary ? (
                              <span
                                className={
                                  saleSummary.balance >
                                  0
                                    ? "text-amber-300"
                                    : "text-emerald-400"
                                }
                              >
                                {formatMoney(
                                  saleSummary.balance,
                                  saleSummary.currency
                                )}
                              </span>
                            ) : (
                              <span className="text-neutral-600">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500">
                    LDC LLC
                  </p>

                  <h2 className="mt-1 text-2xl font-bold">
                    New Truckload
                  </h2>

                  <p className="mt-1 text-sm text-neutral-400">
                    Register a new
                    liquidation load.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    setShowForm(false)
                  }
                  className="rounded-lg px-3 py-2 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={
                  createTruckload
                }
                className="grid gap-5 md:grid-cols-2"
              >
                <Field label="Supplier">
                  <input
                    required
                    value={supplier}
                    onChange={(event) =>
                      setSupplier(
                        event.target.value
                      )
                    }
                    placeholder="The Liquidation Group"
                    className={inputStyle}
                  />
                </Field>

                <Field label="Retailer">
                  <input
                    required
                    value={retailer}
                    onChange={(event) =>
                      setRetailer(
                        event.target.value
                      )
                    }
                    placeholder="Lowe's"
                    className={inputStyle}
                  />
                </Field>

                <Field label="Pallets">
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={pallets}
                    onChange={(event) =>
                      setPallets(
                        event.target.value
                      )
                    }
                    className={inputStyle}
                  />
                </Field>

                <Field label="Purchase Cost">
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchase}
                    onChange={(event) =>
                      setPurchase(
                        event.target.value
                      )
                    }
                    placeholder="4700"
                    className={inputStyle}
                  />
                </Field>

                <Field label="Freight Cost">
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={freight}
                    onChange={(event) =>
                      setFreight(
                        event.target.value
                      )
                    }
                    placeholder="900"
                    className={inputStyle}
                  />
                </Field>

                <Field label="Status">
                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(
                        event.target.value
                      )
                    }
                    className={inputStyle}
                  >
                    <option>
                      Planned
                    </option>

                    <option>
                      Purchased
                    </option>

                    <option>
                      In Transit
                    </option>

                    <option>
                      Received
                    </option>

                    <option>
                      Unloading
                    </option>

                    <option>
                      Unloaded
                    </option>

                    <option>
                      Processing
                    </option>

                    <option>
                      Ready for Export
                    </option>

                    <option>
                      Delivered
                    </option>
                  </select>
                </Field>

                <div className="md:col-span-2">
                  <Field label="Destination">
                    <input
                      required
                      value={destination}
                      onChange={(event) =>
                        setDestination(
                          event.target.value
                        )
                      }
                      className={inputStyle}
                    />
                  </Field>
                </div>

                <div className="mt-2 flex justify-end gap-3 border-t border-neutral-800 pt-5 md:col-span-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setShowForm(false)
                    }
                    className="rounded-lg border border-neutral-700 px-5 py-3 font-medium hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-white px-5 py-3 font-semibold text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : "Create Truckload"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle =
  "mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-neutral-300">
      {label}
      {children}
    </label>
  );
}

function Metric({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-sm text-neutral-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold">
        {value}
      </p>
    </div>
  );
}