"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EvidenceAsset = {
  id: number;
  evidenceId: string;
  category: string;
  originalFilename: string;
  uploadedAt: string;
  verificationStatus: string;
};

type Props = {
  truckloadId: number;
  truckloadCode: string;
};

const RECEIVING_EVIDENCE = [
  ["ARRIVAL", "Arrival", "Truck/load at arrival."],
  ["TRUCK_ID", "Truck ID", "Tractor identification."],
  ["TRAILER_ID", "Trailer ID", "Trailer identification."],
  ["SEAL", "Seal", "Seal number and condition."],
  ["DOORS_BEFORE_OPENING", "Doors Before Opening", "Trailer before opening."],
  ["OPEN_TRAILER", "Open Trailer", "First view after opening."],
  ["LOAD_CONDITION", "Load Condition", "Overall merchandise condition."],
  ["EMPTY_TRAILER", "Empty Trailer", "Trailer after unloading."],
  ["DOCK_CONDITION", "Dock Condition", "Dock after unloading."],
  ["FINAL_UNLOADING", "Final Unloading", "Completed unloading evidence."],
] as const;

export default function ReceivingEvidencePanel({
  truckloadId,
  truckloadCode,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [evidence, setEvidence] = useState<EvidenceAsset[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("ARRIVAL");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadEvidence = useCallback(async () => {
    try {
      setError("");

      const response = await fetch(
        `/api/evidence?entityType=TRUCKLOAD&entityId=${encodeURIComponent(String(truckloadId))}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Could not load receiving evidence");
      }

      setEvidence(Array.isArray(data.evidence) ? data.evidence : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load receiving evidence"
      );
    } finally {
      setLoading(false);
    }
  }, [truckloadId]);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);
  function chooseFile(category: string) {
    setSelectedCategory(category);
    setError("");
    setMessage("");
    setTimeout(() => inputRef.current?.click(), 0);
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setError("");
    setMessage("");

    try {
      const category = RECEIVING_EVIDENCE.find(
        (item) => item[0] === selectedCategory
      );

      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "TRUCKLOAD");
      formData.append("entityId", String(truckloadId));
      formData.append("entityCode", truckloadCode);
      formData.append("category", selectedCategory);

      if (category) {
        formData.append(
          "purpose",
          `Receiving evidence - ${category[1]}`
        );
      }

      formData.append(
        "metadata",
        JSON.stringify({
          module: "RECEIVING",
          truckloadCode,
          evidenceCategory: selectedCategory,
        })
      );

      const response = await fetch("/api/evidence", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Evidence upload failed");
      }

      await loadEvidence();

      setMessage(
        `${selectedCategory} evidence uploaded and registered in LARCOOS.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Evidence upload failed"
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }
  const completedCategories = new Set(
    evidence.map((asset) => asset.category)
  );

  const completedCount = RECEIVING_EVIDENCE.filter(
    (category) => completedCategories.has(category[0])
  ).length;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            void uploadFile(file);
          }
        }}
      />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            LARCOOS Evidence Layer
          </p>

          <h3 className="mt-2 text-lg font-semibold text-white">
            Receiving Evidence
          </h3>

          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Document truck identity, trailer condition and the physical
            receiving operation for {truckloadCode}.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Evidence Checklist
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {completedCount} / {RECEIVING_EVIDENCE.length}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-xl border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {message}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {RECEIVING_EVIDENCE.map(([code, label, description]) => {
          const files = evidence.filter(
            (asset) => asset.category === code
          );

          const completed = files.length > 0;

          return (
            <div
              key={code}
              className={[
                "rounded-xl border p-4",
                completed
                  ? "border-emerald-900 bg-emerald-950/20"
                  : "border-zinc-800 bg-zinc-950",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={
                      completed
                        ? "text-sm font-semibold text-emerald-300"
                        : "text-sm font-semibold text-white"
                    }
                  >
                    {label}
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    {description}
                  </p>
                </div>

                <span
                  className={
                    completed
                      ? "rounded-full bg-emerald-950 px-2 py-1 text-[10px] font-semibold text-emerald-300"
                      : "rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-500"
                  }
                >
                  {completed ? files.length : "PENDING"}
                </span>
              </div>

              <button
                type="button"
                disabled={uploading}
                onClick={() => chooseFile(code)}
                className="mt-4 w-full rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading && selectedCategory === code
                  ? "UPLOADING..."
                  : completed
                    ? "+ ADD EVIDENCE"
                    : "UPLOAD / TAKE PHOTO"}
              </button>
            </div>
          );
        })}
      </div>

      {loading && (
        <p className="mt-4 text-xs text-zinc-500">
          Loading evidence history...
        </p>
      )}

      <p className="mt-5 text-xs text-zinc-600">
        Evidence is stored privately and registered with its integrity
        hash and permanent LARCOOS event history.
      </p>
    </div>
  );
}