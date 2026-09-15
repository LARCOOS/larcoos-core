"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PaymentEditorProps = {
  code: string;
  purchase: number;
  initialPaymentMethod: string;
  initialPaymentStatus: string;
  initialAmountPaid: number;
  initialPaymentDueDate: string | null;
  initialPaymentCountry?: string | null;
};

const PAYMENT_METHODS = [
  "Unspecified",
  "Cash",
  "Card",
  "Domestic Wire Transfer (USA)",
  "International Wire Transfer",
  "30-Day Credit",
];

const PAYMENT_STATUSES = [
  "Unpaid",
  "Partial",
  "Paid in Full",
];

const COUNTRIES = [
  "United States",
  "Mexico",
  "Argentina",
  "Belize",
  "Bolivia",
  "Brazil",
  "Canada",
  "Chile",
  "Colombia",
  "Costa Rica",
  "Cuba",
  "Dominican Republic",
  "Ecuador",
  "El Salvador",
  "Guatemala",
  "Guyana",
  "Haiti",
  "Honduras",
  "Jamaica",
  "Nicaragua",
  "Panama",
  "Paraguay",
  "Peru",
  "Puerto Rico",
  "Spain",
  "Suriname",
  "Trinidad and Tobago",
  "Uruguay",
  "Venezuela",
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Benin",
  "Bhutan",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Central African Republic",
  "Chad",
  "China",
  "Comoros",
  "Democratic Republic of the Congo",
  "Republic of the Congo",
  "Croatia",
  "Cyprus",
  "Czech Republic",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Egypt",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guinea",
  "Guinea-Bissau",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Ivory Coast",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Niger",
  "Nigeria",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Papua New Guinea",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Sri Lanka",
  "Sudan",
  "Sweden",
  "Switzerland",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

export default function PaymentEditor({
  code,
  purchase,
  initialPaymentMethod,
  initialPaymentStatus,
  initialAmountPaid,
  initialPaymentDueDate,
  initialPaymentCountry = null,
}: PaymentEditorProps) {
  const router = useRouter();

  const [paymentMethod, setPaymentMethod] = useState(
    initialPaymentMethod
  );

  const [paymentStatus, setPaymentStatus] = useState(
    initialPaymentStatus
  );

  const [amountPaid, setAmountPaid] = useState(
    String(initialAmountPaid)
  );

  const [paymentDueDate, setPaymentDueDate] = useState(
    initialPaymentDueDate
      ? initialPaymentDueDate.slice(0, 10)
      : ""
  );

  const [paymentCountry, setPaymentCountry] = useState(
    initialPaymentCountry ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const numericAmountPaid = Number(amountPaid) || 0;

  const balanceDue = useMemo(() => {
    return Math.max(purchase - numericAmountPaid, 0);
  }, [purchase, numericAmountPaid]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }),
    []
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch("/api/truckloads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          paymentMethod,
          paymentStatus,
          amountPaid: numericAmountPaid,
          paymentDueDate: paymentDueDate || null,
          paymentCountry: paymentCountry || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to update payment"
        );
      }

      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update payment"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Purchase & Payment
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Track purchase terms, international payments and
            outstanding balance.
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Balance Due
          </p>

          <p className="mt-1 text-xl font-bold">
            {money.format(balanceDue)}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-5"
      >
        <label>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Payment Method
          </span>

          <select
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Payment Country
          </span>

          <select
            value={paymentCountry}
            onChange={(event) =>
              setPaymentCountry(event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          >
            <option value="">Select country</option>

            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Payment Status
          </span>

          <select
            value={paymentStatus}
            onChange={(event) =>
              setPaymentStatus(event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          >
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Amount Paid
          </span>

          <input
            type="number"
            min="0"
            max={purchase}
            step="0.01"
            value={amountPaid}
            onChange={(event) =>
              setAmountPaid(event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </label>

        <label>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Due Date
          </span>

          <input
            type="date"
            value={paymentDueDate}
            onChange={(event) =>
              setPaymentDueDate(event.target.value)
            }
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </label>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Purchase Price
          </p>

          <p className="mt-2 text-lg font-semibold">
            {money.format(purchase)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Paid
          </p>

          <p className="mt-2 text-lg font-semibold">
            {money.format(numericAmountPaid)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Outstanding
          </p>

          <p className="mt-2 text-lg font-semibold">
            {money.format(balanceDue)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Country
          </p>

          <p className="mt-2 text-lg font-semibold">
            {paymentCountry || "Not selected"}
          </p>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-white px-5 py-3 font-bold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Payment"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-4 text-sm font-medium text-red-400">
          {error}
        </p>
      )}

      {saved && !error && (
        <p className="mt-4 text-sm font-medium text-emerald-400">
          Payment information saved successfully.
        </p>
      )}
    </section>
  );
}