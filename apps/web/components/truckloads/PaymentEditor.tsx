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

type CostRecord = {
  id: number;
  costType: string;
  amount: string;
  currency: string;
  status: string;
  vendorName: string | null;
  reference: string | null;
  notes: string | null;
  incurredAt: string;
};

type CostData = {
  costs: CostRecord[];
  totals: {
    operationalCostIncurred: number;
  };
};

const COST_TYPES = [
  ["CUSTOMS", "Customs"],
  ["BROKER", "Broker"],
  ["FORKLIFT", "Forklift"],
  ["LABOR", "Labor"],
  ["FUEL", "Fuel"],
  ["TOLLS", "Tolls"],
  ["OTHER", "Other"],
] as const;
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
    operationalCostIncurred: number;
    operationalBalance: number;
    currentLandedCost: number;
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
  const [voidingPaymentId, setVoidingPaymentId] =
    useState<number | null>(null);

  const [costData, setCostData] =
    useState<CostData | null>(null);

  const [costType, setCostType] =
    useState("BROKER");

  const [costAmount, setCostAmount] =
    useState("");

  const [costVendor, setCostVendor] =
    useState("");

  const [costReference, setCostReference] =
    useState("");

  const [costNotes, setCostNotes] =
    useState("");

  const [savingCost, setSavingCost] =
    useState(false);

  const [voidingCostId, setVoidingCostId] =
    useState<number | null>(null);

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

  const loadCosts = useCallback(
    async () => {
      try {
        const response = await fetch(
          `/api/truckload-costs?code=${encodeURIComponent(
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
              "Failed to load operational costs"
          );
        }

        setCostData(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load operational costs"
        );
      }
    },
    [code]
  );

  useEffect(() => {
    void Promise.all([
      loadFinancials(),
      loadCosts(),
    ]);
  }, [loadFinancials, loadCosts]);

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

  async function handleVoidPayment(
    payment: PaymentRecord
  ) {
    if (voidingPaymentId !== null || payment.status === "VOID") {
      return;
    }

    const reason = window.prompt(
      `Reason for voiding payment #${payment.id}:`
    );

    if (reason === null) {
      return;
    }

    const cleanReason = reason.trim();

    if (cleanReason.length < 3) {
      setError(
        "Void reason must contain at least 3 characters."
      );
      return;
    }

    const confirmed = window.confirm(
      `Void payment #${payment.id} for ${money.format(
        Number(payment.amount)
      )}?\n\nThis will preserve the record in Payment History and exclude it from confirmed totals.`
    );

    if (!confirmed) {
      return;
    }

    setVoidingPaymentId(payment.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/truckload-payments",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            paymentId: payment.id,
            reason: cleanReason,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to void payment"
        );
      }

      setSuccess(
        `Payment #${payment.id} was voided. The ledger record was preserved.`
      );

      await loadFinancials();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to void payment"
      );
    } finally {
      setVoidingPaymentId(null);
    }
  }
  async function handleCost(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingCost) {
      return;
    }

    const numericAmount = Number(costAmount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      setError(
        "Operational cost must be greater than zero."
      );
      return;
    }

    setSavingCost(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/truckload-costs",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            costType,
            amount: numericAmount,
            currency: "USD",
            status: "CONFIRMED",
            vendorName: costVendor || null,
            reference: costReference || null,
            notes: costNotes || null,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Failed to record operational cost"
        );
      }

      setCostAmount("");
      setCostVendor("");
      setCostReference("");
      setCostNotes("");

      setSuccess(
        "Operational cost recorded. Landed cost has been recalculated."
      );

      await Promise.all([
        loadCosts(),
        loadFinancials(),
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record operational cost"
      );
    } finally {
      setSavingCost(false);
    }
  }

  async function handleVoidCost(
    cost: CostRecord
  ) {
    if (
      voidingCostId !== null ||
      cost.status === "VOID"
    ) {
      return;
    }

    const reason = window.prompt(
      `Reason for voiding cost #${cost.id}:`
    );

    if (reason === null) {
      return;
    }

    const cleanReason = reason.trim();

    if (cleanReason.length < 3) {
      setError(
        "Void reason must contain at least 3 characters."
      );
      return;
    }

    const confirmed = window.confirm(
      `Void cost #${cost.id} for ${money.format(
        Number(cost.amount)
      )}?

This preserves the record in Cost History and removes it from confirmed operational cost totals.`
    );

    if (!confirmed) {
      return;
    }

    setVoidingCostId(cost.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/truckload-costs",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            costId: cost.id,
            reason: cleanReason,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Failed to void operational cost"
        );
      }

      setSuccess(
        `Cost #${cost.id} was voided. The ledger record was preserved.`
      );

      await Promise.all([
        loadCosts(),
        loadFinancials(),
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to void operational cost"
      );
    } finally {
      setVoidingCostId(null);
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

  const operationalCostIncurred =
    data?.totals.operationalCostIncurred ?? 0;

  const operationalBalance =
    data?.totals.operationalBalance ?? 0;

  const currentLandedCost =
    data?.totals.currentLandedCost ??
    purchase +
      freightBasis +
      operationalCostIncurred;

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

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Operational Cost Incurred
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(
                  operationalCostIncurred
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Operational Paid
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(operationalPaid)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Operational Balance
              </p>

              <p className="mt-2 text-lg font-semibold">
                {money.format(
                  operationalBalance
                )}
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
                      <th className="px-4 py-3 text-right">
                        Action
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
                            <span
                              className={
                                payment.status === "VOID"
                                  ? "rounded-full border border-red-800 bg-red-950/40 px-2 py-1 text-xs font-semibold text-red-400"
                                  : payment.status === "PENDING"
                                    ? "rounded-full border border-amber-800 bg-amber-950/40 px-2 py-1 text-xs font-semibold text-amber-400"
                                    : "rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs font-semibold text-emerald-400"
                              }
                            >
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

                          <td className="px-4 py-3 text-right">
                            {payment.status === "VOID" ? (
                              <span className="text-xs font-medium text-slate-500">
                                Preserved
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={voidingPaymentId !== null}
                                onClick={() =>
                                  void handleVoidPayment(payment)
                                }
                                className="rounded-lg border border-red-900 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {voidingPaymentId === payment.id
                                  ? "Voiding..."
                                  : "VOID"}
                              </button>
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

          <form
            onSubmit={handleCost}
            className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/40 p-5"
          >
            <div>
              <h3 className="font-semibold">
                Record Operational Cost
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                Record an incurred operating cost. This changes landed cost but does not record money as paid.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Cost Type
                </span>

                <select
                  value={costType}
                  onChange={(event) =>
                    setCostType(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                >
                  {COST_TYPES.map(
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
                  min="0"
                  step="0.01"
                  value={costAmount}
                  onChange={(event) =>
                    setCostAmount(event.target.value)
                  }
                  placeholder="0.00"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Vendor
                </span>

                <input
                  type="text"
                  value={costVendor}
                  onChange={(event) =>
                    setCostVendor(event.target.value)
                  }
                  placeholder="Broker, vendor, employee..."
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Reference
                </span>

                <input
                  type="text"
                  value={costReference}
                  onChange={(event) =>
                    setCostReference(
                      event.target.value
                    )
                  }
                  placeholder="Invoice, receipt..."
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <label className="md:col-span-2 xl:col-span-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notes
                </span>

                <input
                  type="text"
                  value={costNotes}
                  onChange={(event) =>
                    setCostNotes(event.target.value)
                  }
                  placeholder="Optional cost notes"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={
                    savingCost ||
                    !costAmount ||
                    Number(costAmount) <= 0
                  }
                  className="w-full rounded-xl bg-white px-5 py-3 font-bold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingCost
                    ? "Recording..."
                    : "Record Cost"}
                </button>
              </div>
            </div>
          </form>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">
                  Cost History
                </h3>

                <p className="mt-1 text-sm text-slate-400">
                  Permanent record of incurred operational costs for this truckload.
                </p>
              </div>

              <span className="text-sm text-slate-400">
                {costData?.costs.length ?? 0} record
                {(costData?.costs.length ?? 0) === 1
                  ? ""
                  : "s"}
              </span>
            </div>

            {!costData ||
            costData.costs.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-400">
                No operational costs recorded.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-slate-950/80 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        Date
                      </th>
                      <th className="px-4 py-3">
                        Type
                      </th>
                      <th className="px-4 py-3">
                        Vendor
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
                      <th className="px-4 py-3 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {costData.costs.map(
                      (cost) => (
                        <tr
                          key={cost.id}
                          className="border-t border-slate-800"
                        >
                          <td className="px-4 py-3 text-slate-300">
                            {new Date(
                              cost.incurredAt
                            ).toLocaleDateString()}
                          </td>

                          <td className="px-4 py-3 font-medium">
                            {cost.costType}
                          </td>

                          <td className="px-4 py-3 text-slate-300">
                            {cost.vendorName || "—"}
                          </td>

                          <td className="px-4 py-3 text-slate-300">
                            {cost.reference || "—"}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={
                                cost.status === "VOID"
                                  ? "rounded-full border border-red-800 bg-red-950/40 px-2 py-1 text-xs font-semibold text-red-400"
                                  : cost.status === "OPEN"
                                    ? "rounded-full border border-amber-800 bg-amber-950/40 px-2 py-1 text-xs font-semibold text-amber-400"
                                    : "rounded-full border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs font-semibold text-emerald-400"
                              }
                            >
                              {cost.status}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right font-semibold">
                            {money.format(
                              Number(cost.amount)
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            {cost.status === "VOID" ? (
                              <span className="text-xs font-medium text-slate-500">
                                Preserved
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  voidingCostId !== null
                                }
                                onClick={() =>
                                  void handleVoidCost(
                                    cost
                                  )
                                }
                                className="rounded-lg border border-red-900 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {voidingCostId ===
                                cost.id
                                  ? "Voiding..."
                                  : "VOID"}
                              </button>
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