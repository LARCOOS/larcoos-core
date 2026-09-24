"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type PaymentEditorProps = {
  code: string;
  purchase: number;
  initialPaymentMethod: string;
  initialPaymentStatus: string;
  initialAmountPaid: number;
  initialPaymentDueDate: string | null;
  initialPaymentCountry?: string | null;
};

type PaymentRecord = {
  id: number;
  obligationType: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  payeeName: string | null;
  reference: string | null;
  notes: string | null;
  paidAt: string;
};

type FinancialData = {
  truckload: {
    id: number;
    code: string;
    purchase: number;
    estimatedFreight: number;
    actualFreight: number | null;
  };
  payments: PaymentRecord[];
  totals: {
    merchandisePaid: number;
    freightPaid: number;
    operationalPaid: number;
    confirmedTotal: number;
    supplierBalance: number;
    freightBalance: number;
    merchandisePaymentStatus: string;
  };
};

const PAYMENT_METHODS = [
  "Unspecified",
  "Cash",
  "Card",
  "Domestic Wire Transfer (USA)",
  "International Wire Transfer",
  "30-Day Credit",
];

const OBLIGATION_TYPES = [
  ["MERCHANDISE", "Merchandise / Supplier"],
  ["FREIGHT", "Freight"],
  ["CUSTOMS", "Customs"],
  ["BROKER", "Broker"],
  ["FORKLIFT", "Forklift"],
  ["LABOR", "Labor"],
  ["FUEL", "Fuel"],
  ["TOLLS", "Tolls"],
  ["OTHER", "Other"],
] as const;

export default function PaymentEditor({
  code,
  purchase,
}: PaymentEditorProps) {
  const [data, setData] =
    useState<FinancialData | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [obligationType, setObligationType] =
    useState("MERCHANDISE");

  const [amount, setAmount] = useState("");
  const [method, setMethod] =
    useState("Unspecified");

  const [payeeName, setPayeeName] =
    useState("");

  const [reference, setReference] =
    useState("");

  const [notes, setNotes] = useState("");

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }),
    []
  );

  const loadFinancials = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/truckload-payments?code=${encodeURIComponent(
            code
          )}`,
          {
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Failed to load financial data"
          );
        }

        setData(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load financial data"
        );
      } finally {
        setLoading(false);
      }
    },
    [code]
  );

  useEffect(() => {
    void loadFinancials();
  }, [loadFinancials]);

  async function handlePayment(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      setError(
        "Payment amount must be greater than zero."
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/truckload-payments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            obligationType,
            amount: numericAmount,
            currency: "USD",
            method,
            status: "CONFIRMED",
            payeeName: payeeName || null,
            reference: reference || null,
            notes: notes || null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to record payment"
        );
      }

      setAmount("");
      setReference("");
      setNotes("");
      setSuccess(
        "Confirmed payment recorded in the procurement ledger."
      );

      await loadFinancials();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record payment"
      );
    } finally {
      setSaving(false);
    }
  }

  const actualFreight =
    data?.truckload.actualFreight ?? null;

  const freightBasis =
    actualFreight ??
    data?.truckload.estimatedFreight ??
    0;

  const merchandisePaid =
    data?.totals.merchandisePaid ?? 0;

  const supplierBalance =
    data?.totals.supplierBalance ??
    Math.max(purchase - merchandisePaid, 0);

  const freightPaid =
    data?.totals.freightPaid ?? 0;

  const freightBalance =
    data?.totals.freightBalance ??
    Math.max(freightBasis - freightPaid, 0);

  const operationalPaid =
    data?.totals.operationalPaid ?? 0;

  const currentLandedCost =
    purchase +
    freightBasis +
    operationalPaid;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">
              Procurement & Financials
            </h2>

            {data && (
              <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
                Ledger Active
              </span>
            )}
          </div>

          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Merchandise, freight and operating payments
            are recorded as permanent ledger entries.
            Payment status is calculated from confirmed
            money instead of being entered manually.
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Current Landed Cost
          </p>

          <p className="mt-1 text-xl font-bold">
            {money.format(currentLandedCost)}
          </p>
        </div>
      </div>

      {loading && (
        <p className="mt-6 text-sm text-slate-400">
          Loading financial ledger...
        </p>
      )}

      {!loading && data && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Purchase Cost
              </p>

              <p className="mt-2 text-xl font-semibold">
                {money.format(
                  data.truckload.purchase
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Supplier Paid
              </p>

              <p className="mt-2 text-xl font-semibold">
                {money.format(merchandisePaid)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Supplier Balance
              </p>

              <p className="mt-2 text-xl font-semibold">
                {money.format(supplierBalance)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Merchandise Status
              </p>

              <p className="mt-2 text-xl font-semibold">
                {
                  data.totals
                    .merchandisePaymentStatus
                }
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Estimated Freight
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(
                  data.truckload.estimatedFreight
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Actual Freight
              </p>

              <p className="mt-2 text-lg font-semibold">
                {actualFreight === null
                  ? "Not confirmed"
                  : money.format(actualFreight)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Freight Paid
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(freightPaid)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Freight Balance
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(freightBalance)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Operational Costs Paid
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(operationalPaid)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Confirmed Cash Out
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(
                  data.totals.confirmedTotal
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Freight Basis
              </p>

              <p className="mt-2 text-lg font-semibold">
                {actualFreight === null
                  ? "Estimated"
                  : "Actual"}
              </p>
            </div>
          </div>

          <form
            onSubmit={handlePayment}
            className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/40 p-5"
          >
            <div>
              <h3 className="font-semibold">
                Record Confirmed Payment
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                This creates a permanent procurement
                ledger entry. It does not manually edit
                Paid in Full.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payment For
                </span>

                <select
                  value={obligationType}
                  onChange={(event) =>
                    setObligationType(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                >
                  {OBLIGATION_TYPES.map(
                    ([value, label]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Amount
                </span>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) =>
                    setAmount(event.target.value)
                  }
                  placeholder="0.00"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Method
                </span>

                <select
                  value={method}
                  onChange={(event) =>
                    setMethod(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                >
                  {PAYMENT_METHODS.map(
                    (paymentMethod) => (
                      <option
                        key={paymentMethod}
                        value={paymentMethod}
                      >
                        {paymentMethod}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payee
                </span>

                <input
                  type="text"
                  value={payeeName}
                  onChange={(event) =>
                    setPayeeName(
                      event.target.value
                    )
                  }
                  placeholder="Supplier or carrier"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Reference
                </span>

                <input
                  type="text"
                  value={reference}
                  onChange={(event) =>
                    setReference(
                      event.target.value
                    )
                  }
                  placeholder="Wire, invoice, check..."
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label className="md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notes
                </span>

                <input
                  type="text"
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  placeholder="Optional payment notes"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={
                    saving ||
                    !amount ||
                    Number(amount) <= 0
                  }
                  className="w-full rounded-xl bg-white px-5 py-3 font-bold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving
                    ? "Recording..."
                    : "Record Payment"}
                </button>
              </div>
            </div>
          </form>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">
                  Payment History
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Permanent procurement ledger for this
                  truckload.
                </p>
              </div>

              <span className="text-sm text-slate-400">
                {data.payments.length} record
                {data.payments.length === 1
                  ? ""
                  : "s"}
              </span>
            </div>

            {data.payments.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-400">
                No procurement payments recorded.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-950/80 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        Date
                      </th>
                      <th className="px-4 py-3">
                        Type
                      </th>
                      <th className="px-4 py-3">
                        Payee
                      </th>
                      <th className="px-4 py-3">
                        Method
                      </th>
                      <th className="px-4 py-3">
                        Reference
                      </th>
                      <th className="px-4 py-3">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right">
                        Amount
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.payments.map(
                      (payment) => (
                        <tr
                          key={payment.id}
                          className="border-t border-slate-800"
                        >
                          <td className="px-4 py-3 text-slate-300">
                            {new Date(
                              payment.paidAt
                            ).toLocaleDateString()}
                          </td>

                          <td className="px-4 py-3 font-medium">
                            {
                              payment.obligationType
                            }
                          </td>

                          <td className="px-4 py-3 text-slate-300">
                            {payment.payeeName ||
                              "—"}
                          </td>

                          <td className="px-4 py-3 text-slate-300">
                            {payment.method}
                          </td>

                          <td className="px-4 py-3 text-slate-300">
                            {payment.reference ||
                              "—"}
                          </td>

                          <td className="px-4 py-3">
                            <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs font-semibold text-emerald-400">
                              {payment.status}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right font-semibold">
                            {money.format(
                              Number(
                                payment.amount
                              )
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="mt-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm font-medium text-red-400">
          {error}
        </p>
      )}

      {success && !error && (
        <p className="mt-5 rounded-xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm font-medium text-emerald-400">
          {success}
        </p>
      )}
    </section>
  );
}