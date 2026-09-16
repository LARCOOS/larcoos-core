"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import LdcWorkspaceNav from "@/components/workspaces/ldc/LdcWorkspaceNav";

type SourceTruckload = {
  id: number;
  code: string;
  supplier: string;
  retailer: string;
  status: string;
};

type Sale = {
  id: number;
  code: string;
  customerName: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  currency: string;
  grossAmount: number;
  amountReceived: number;
  balance: number;
  saleDate: string;
  notes: string | null;
  truckloadId: number | null;
  sourceTruckload: SourceTruckload | null;
};

type Truckload = {
  id: number;
  code: string;
  supplier: string;
  retailer: string;
  status: string;
};

const PAYMENT_METHODS = [
  "Unspecified",
  "Cash",
  "Card",
  "Domestic Wire Transfer (USA)",
  "International Wire Transfer",
  "Check",
  "ACH",
  "Other",
];

function money(value: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function paymentClass(status: string) {
  if (status === "Paid in Full") {
    return "border-emerald-800 bg-emerald-950/50 text-emerald-300";
  }

  if (status === "Partial") {
    return "border-amber-800 bg-amber-950/50 text-amber-300";
  }

  return "border-neutral-700 bg-neutral-900 text-neutral-400";
}

export default function LdcSalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [truckloads, setTruckloads] = useState<Truckload[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [truckloadId, setTruckloadId] = useState("");
  const [grossAmount, setGrossAmount] = useState("");
  const [initialPayment, setInitialPayment] = useState("0");
  const [paymentMethod, setPaymentMethod] =
    useState("Unspecified");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [salesResponse, truckloadsResponse] =
        await Promise.all([
          fetch("/api/sales", {
            cache: "no-store",
          }),
          fetch("/api/truckloads", {
            cache: "no-store",
          }),
        ]);

      if (!salesResponse.ok) {
        const data = await salesResponse.json();
        throw new Error(
          data.error ?? "Failed to load sales"
        );
      }

      if (!truckloadsResponse.ok) {
        throw new Error("Failed to load truckloads");
      }

      const salesData = await salesResponse.json();
      const truckloadsData =
        await truckloadsResponse.json();

      setSales(salesData);
      setTruckloads(truckloadsData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load Sales"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const metrics = useMemo(() => {
    const grossRevenue = sales.reduce(
      (total, sale) => total + Number(sale.grossAmount),
      0
    );

    const collected = sales.reduce(
      (total, sale) =>
        total + Number(sale.amountReceived),
      0
    );

    const outstanding = sales.reduce(
      (total, sale) => total + Number(sale.balance),
      0
    );

    return {
      totalSales: sales.length,
      grossRevenue,
      collected,
      outstanding,
    };
  }, [sales]);

  async function createSale(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          truckloadId:
            truckloadId === ""
              ? null
              : Number(truckloadId),
          grossAmount: Number(grossAmount),
          initialPayment: Number(initialPayment || 0),
          paymentMethod,
          currency,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ?? "Failed to create sale"
        );
      }

      setCustomerName("");
      setTruckloadId("");
      setGrossAmount("");
      setInitialPayment("0");
      setPaymentMethod("Unspecified");
      setCurrency("USD");
      setNotes("");
      setShowForm(false);

      await loadData();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to create sale"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <LdcWorkspaceNav />

        <header className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-medium text-neutral-500">
              LDC LLC / SALES ENGINE
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              Sales
            </h1>

            <p className="mt-3 max-w-3xl text-neutral-400">
              Revenue generated by LDC, customer payments,
              outstanding balances and merchandise source
              traceability.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-500"
          >
            {showForm ? "Close" : "+ New Sale"}
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Sales"
            value={String(metrics.totalSales)}
          />

          <MetricCard
            label="Gross Revenue"
            value={money(metrics.grossRevenue)}
          />

          <MetricCard
            label="Collected"
            value={money(metrics.collected)}
          />

          <MetricCard
            label="Outstanding"
            value={money(metrics.outstanding)}
          />
        </section>

        {showForm && (
          <form
            onSubmit={createSale}
            className="mb-8 rounded-2xl border border-emerald-900/60 bg-emerald-950/10 p-6"
          >
            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Sales Engine
              </div>

              <h2 className="mt-2 text-2xl font-semibold">
                Register New Sale
              </h2>

              <p className="mt-2 text-sm text-neutral-400">
                Record customer revenue separately from
                supplier-side truckload payments.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Customer">
                <input
                  required
                  value={customerName}
                  onChange={(event) =>
                    setCustomerName(event.target.value)
                  }
                  className="input"
                  placeholder="Customer name"
                />
              </Field>

              <Field label="Source Truckload">
                <select
                  value={truckloadId}
                  onChange={(event) =>
                    setTruckloadId(event.target.value)
                  }
                  className="input"
                >
                  <option value="">
                    No truckload selected
                  </option>

                  {truckloads.map((truckload) => (
                    <option
                      key={truckload.id}
                      value={truckload.id}
                    >
                      {truckload.code} — {truckload.retailer}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Gross Sale Amount">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={grossAmount}
                  onChange={(event) =>
                    setGrossAmount(event.target.value)
                  }
                  className="input"
                  placeholder="0.00"
                />
              </Field>

              <Field label="Initial Payment">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={initialPayment}
                  onChange={(event) =>
                    setInitialPayment(event.target.value)
                  }
                  className="input"
                />
              </Field>

              <Field label="Payment Method">
                <select
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value)
                  }
                  className="input"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Currency">
                <select
                  value={currency}
                  onChange={(event) =>
                    setCurrency(event.target.value)
                  }
                  className="input"
                >
                  <option value="USD">USD</option>
                  <option value="MXN">MXN</option>
                </select>
              </Field>
            </div>

            <div className="mt-5">
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  className="input min-h-24"
                  placeholder="Optional sale notes"
                />
              </Field>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Register Sale"}
              </button>
            </div>
          </form>
        )}

        <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 p-6">
            <h2 className="text-xl font-semibold">
              Sales Registry
            </h2>

            <p className="mt-1 text-sm text-neutral-500">
              One source of truth for LDC customer sales.
            </p>
          </div>

          {loading ? (
            <div className="p-10 text-center text-neutral-500">
              Loading sales...
            </div>
          ) : sales.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-lg font-semibold">
                No sales recorded yet
              </div>

              <p className="mt-2 text-sm text-neutral-500">
                Register the first LDC sale to begin revenue
                tracking.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-neutral-950/70 text-xs uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-5 py-4">Sale</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">
                      Source Truckload
                    </th>
                    <th className="px-5 py-4 text-right">
                      Gross
                    </th>
                    <th className="px-5 py-4 text-right">
                      Collected
                    </th>
                    <th className="px-5 py-4 text-right">
                      Balance
                    </th>
                    <th className="px-5 py-4">
                      Payment
                    </th>
                    <th className="px-5 py-4">Date</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-800">
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      className="transition hover:bg-neutral-800/40"
                    >
                      <td className="px-5 py-5">
                        <div className="font-semibold text-white">
                          {sale.code}
                        </div>

                        <div className="mt-1 text-xs text-neutral-500">
                          {sale.paymentMethod}
                        </div>
                      </td>

                      <td className="px-5 py-5 text-neutral-300">
                        {sale.customerName ?? "—"}
                      </td>

                      <td className="px-5 py-5">
                        {sale.sourceTruckload ? (
                          <>
                            <div className="font-medium text-neutral-200">
                              {sale.sourceTruckload.code}
                            </div>

                            <div className="mt-1 text-xs text-neutral-500">
                              {sale.sourceTruckload.retailer}
                            </div>
                          </>
                        ) : (
                          <span className="text-neutral-600">
                            —
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-5 text-right font-medium">
                        {money(
                          sale.grossAmount,
                          sale.currency
                        )}
                      </td>

                      <td className="px-5 py-5 text-right text-emerald-400">
                        {money(
                          sale.amountReceived,
                          sale.currency
                        )}
                      </td>

                      <td className="px-5 py-5 text-right text-amber-300">
                        {money(
                          sale.balance,
                          sale.currency
                        )}
                      </td>

                      <td className="px-5 py-5">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paymentClass(
                            sale.paymentStatus
                          )}`}
                        >
                          {sale.paymentStatus}
                        </span>
                      </td>

                      <td className="px-5 py-5 text-neutral-400">
                        {new Date(
                          sale.saleDate
                        ).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <style jsx>{`
          :global(.input) {
            width: 100%;
            border: 1px solid rgb(64 64 64);
            border-radius: 0.75rem;
            background: rgb(10 10 10);
            padding: 0.75rem 0.875rem;
            color: white;
            outline: none;
          }

          :global(.input:focus) {
            border-color: rgb(5 150 105);
          }
        `}</style>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </div>

      <div className="mt-3 text-2xl font-bold">
        {value}
      </div>
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-neutral-300">
        {label}
      </span>

      {children}
    </label>
  );
}