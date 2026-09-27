"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReceivingEvidencePanel from "./ReceivingEvidencePanel";

type ReceivingRecord = {
  id: number;
  truckloadId: number;

  receivedAt: string | null;

  originName: string | null;
  originCity: string | null;
  originState: string | null;
  originCountry: string | null;

  carrierName: string | null;
  driverName: string | null;
  driverPhone: string | null;

  truckNumber: string | null;
  trailerNumber: string | null;

  distanceMiles: number | null;

  freightCost: string | number | null;
  costPerMile: string | number | null;
  costPerPallet: string | number | null;

  unloadingStartedAt: string | null;
  unloadingFinishedAt: string | null;
  unloadingSeconds: number | null;

  palletsExpected: number | null;
  palletsUnloaded: number;

  forkliftUsed: boolean;
  forkliftName: string | null;

  forkliftSafetyCheckedAt: string | null;
  forkliftSafetyActorId: number | null;
  forkliftSafetyNotes: string | null;

  dockDoor: string | null;
  notes: string | null;
};

type Worker = {
  id: number;
  receivingId: number;
  actorId: number | null;

  workerName: string;
  role: string;

  startedAt: string | null;
  finishedAt: string | null;
  workSeconds: number | null;

  notes: string | null;
};

type OperationCheckIn = {
  id: number;
  receivingId: number;
  actorId: number;
  role: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  notes: string | null;
};
type ReceivingResponse = {
  success: boolean;

  error?: string;

  truckload?: {
    id: number;
    code: string;
    status: string;
    pallets: number;
    freight: number;
  };

  receiving?: ReceivingRecord | null;
  workers?: Worker[];
  currentActorId?: number;
  operationCheckIns?: OperationCheckIn[];

  permissions?: {
    canEditCompletedRecords: boolean;
  };
};

type Props = {
  truckloadCode: string;
};

type WorkerDraft = {
  workerName: string;
  role: string;
};

const WORKER_ROLES = [
  "Receiver",
  "Forklift Operator",
  "Warehouse Unloader",
  "Supervisor",
];

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "$0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

export default function ReceivingPanel({
  truckloadCode,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [truckloadStatus, setTruckloadStatus] = useState("");
  const [truckloadId, setTruckloadId] = useState<number | null>(null);
  const [expectedPallets, setExpectedPallets] = useState(0);
  const [defaultFreight, setDefaultFreight] = useState(0);

  const [receiving, setReceiving] =
    useState<ReceivingRecord | null>(null);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [currentActorId, setCurrentActorId] = useState<number | null>(null);
  const [operationCheckIns, setOperationCheckIns] = useState<OperationCheckIn[]>([]);
  const [operationRole, setOperationRole] = useState("Receiver");
  const [operationNotes, setOperationNotes] = useState("");
  const [evidenceCategories, setEvidenceCategories] = useState<string[]>([]);
  const [requestedEvidenceCategory, setRequestedEvidenceCategory] =
    useState<string | null>(null);

  const handleEvidenceCategoriesChange = useCallback(
    (categories: string[]) => {
      setEvidenceCategories(categories);
    },
    []
  );

  const hasEmptyTrailerEvidence =
    evidenceCategories.includes("EMPTY_TRAILER");

  const [originName, setOriginName] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [originState, setOriginState] = useState("");
  const [originCountry, setOriginCountry] =
    useState("United States");

  const [carrierName, setCarrierName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  const [truckNumber, setTruckNumber] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");

  const [distanceMiles, setDistanceMiles] = useState("");
  const [freightCost, setFreightCost] = useState("");

  const [forkliftUsed, setForkliftUsed] = useState(false);
  const [forkliftName, setForkliftName] = useState("");
  const [dockDoor, setDockDoor] = useState("");
  const [notes, setNotes] = useState("");

  const [canEditCompletedRecords, setCanEditCompletedRecords] =
    useState(false);
  const [editingCompletedRecord, setEditingCompletedRecord] =
    useState(false);
  const [correctionReason, setCorrectionReason] = useState("");

  const [workerDrafts, setWorkerDrafts] = useState<WorkerDraft[]>([
    {
      workerName: "Victor Manuel Orozco Aguilar",
      role: "Receiver",
    },
  ]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const loadReceiving = useCallback(async () => {
    try {
      setError("");

      const response = await fetch(
        `/api/receiving?truckloadCode=${encodeURIComponent(
          truckloadCode
        )}`,
        {
          cache: "no-store",
        }
      );

      const data = (await response.json()) as ReceivingResponse;

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ?? "Could not load receiving operation"
        );
      }

      if (data.truckload) {
        setTruckloadId(data.truckload.id);
        setTruckloadStatus(data.truckload.status);
        setExpectedPallets(data.truckload.pallets);
        setDefaultFreight(data.truckload.freight);

        if (!freightCost) {
          setFreightCost(String(data.truckload.freight));
        }
      }

      const record = data.receiving ?? null;

      setReceiving(record);
      setWorkers(data.workers ?? []);
      setCurrentActorId(data.currentActorId ?? null);
      setOperationCheckIns(data.operationCheckIns ?? []);
      setCanEditCompletedRecords(
        Boolean(data.permissions?.canEditCompletedRecords)
      );

      if (record) {
        setOriginName(record.originName ?? "");
        setOriginCity(record.originCity ?? "");
        setOriginState(record.originState ?? "");
        setOriginCountry(record.originCountry ?? "United States");

        setCarrierName(record.carrierName ?? "");
        setDriverName(record.driverName ?? "");
        setDriverPhone(record.driverPhone ?? "");

        setTruckNumber(record.truckNumber ?? "");
        setTrailerNumber(record.trailerNumber ?? "");

        setDistanceMiles(
          record.distanceMiles === null
            ? ""
            : String(record.distanceMiles)
        );

        setFreightCost(
          record.freightCost === null
            ? String(data.truckload?.freight ?? 0)
            : String(record.freightCost)
        );

        setForkliftUsed(record.forkliftUsed);
        setForkliftName(record.forkliftName ?? "");
        setDockDoor(record.dockDoor ?? "");
        setNotes(record.notes ?? "");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load receiving operation"
      );
    } finally {
      setLoading(false);
    }
  }, [truckloadCode, freightCost]);

  useEffect(() => {
    void loadReceiving();
    // We intentionally load when the truckload changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckloadCode]);

  useEffect(() => {
    if (!receiving?.unloadingStartedAt) {
      setElapsedSeconds(receiving?.unloadingSeconds ?? 0);
      return;
    }

    if (receiving.unloadingFinishedAt) {
      setElapsedSeconds(receiving.unloadingSeconds ?? 0);
      return;
    }

    const calculateElapsed = () => {
      const started = new Date(
        receiving.unloadingStartedAt as string
      ).getTime();

      if (Number.isNaN(started)) {
        setElapsedSeconds(0);
        return;
      }

      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - started) / 1000))
      );
    };

    calculateElapsed();

    const timer = window.setInterval(calculateElapsed, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    receiving?.unloadingStartedAt,
    receiving?.unloadingFinishedAt,
    receiving?.unloadingSeconds,
  ]);

  const activeOperationCheckIn =
    currentActorId === null
      ? undefined
      : operationCheckIns.find(
          (checkIn) =>
            checkIn.actorId === currentActorId &&
            !checkIn.checkedOutAt
        );

  const hasBeenReceived = Boolean(receiving?.receivedAt);

  const unloadingRunning = Boolean(
    receiving?.unloadingStartedAt &&
      !receiving?.unloadingFinishedAt
  );

  const unloadingFinished = Boolean(
    receiving?.unloadingFinishedAt
  );

  const completedRecord =
    truckloadStatus === "Unloaded" && unloadingFinished;

  const completedFieldsEditable =
    completedRecord &&
    canEditCompletedRecords &&
    editingCompletedRecord;

  const palletsUnloaded = receiving?.palletsUnloaded ?? 0;

  const remainingPallets = Math.max(
    0,
    expectedPallets - palletsUnloaded
  );

  const progress =
    expectedPallets > 0
      ? Math.min(
          100,
          (palletsUnloaded / expectedPallets) * 100
        )
      : 0;

  const freightMetrics = useMemo(() => {
    const freight = Number(freightCost || defaultFreight || 0);
    const miles = Number(distanceMiles || 0);

    const costPerMile =
      miles > 0 && Number.isFinite(freight)
        ? freight / miles
        : null;

    const costPerPallet =
      expectedPallets > 0 && Number.isFinite(freight)
        ? freight / expectedPallets
        : null;

    return {
      freight,
      costPerMile,
      costPerPallet,
    };
  }, [
    freightCost,
    defaultFreight,
    distanceMiles,
    expectedPallets,
  ]);

  async function postAction(
    payload: Record<string, unknown>
  ) {
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/receiving", {
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
          data.error ?? "Receiving operation failed"
        );
      }

      await loadReceiving();

      return data;
    } catch (err) {
      const text =
        err instanceof Error
          ? err.message
          : "Receiving operation failed";

      setError(text);
      throw err;
    } finally {
      setWorking(false);
    }
  }

  async function receiveTruck() {
    try {
      await postAction({
        action: "receive",

        originName,
        originCity,
        originState,
        originCountry,

        carrierName,
        driverName,
        driverPhone,

        truckNumber,
        trailerNumber,

        distanceMiles:
          distanceMiles.trim() === ""
            ? null
            : Number(distanceMiles),

        freightCost:
          freightCost.trim() === ""
            ? defaultFreight
            : Number(freightCost),
      });

      setMessage(
        "Truck received. Arrival timestamp and freight metrics were recorded in LARCOOS."
      );
    } catch {
      // Error is already displayed by postAction.
    }
  }

  async function checkInOperation() {
    const role = operationRole.trim();

    if (!role) {
      setError("Role is required");
      return;
    }

    try {
      await postAction({
        action: "check-in",
        role,
        notes: operationNotes.trim() || null,
      });

      setOperationNotes("");
      setMessage(
        "Operation check-in recorded in LARCOOS."
      );
    } catch {
      // Error is already displayed by postAction.
    }
  }

  async function checkOutOperation() {
    try {
      await postAction({
        action: "check-out",
      });

      setMessage(
        "Operation check-out recorded in LARCOOS."
      );
    } catch {
      // Error is already displayed by postAction.
    }
  }
  async function saveUnloadingSetup() {
    try {
      await postAction({
        action: "save-unloading-setup",
        forkliftUsed,
        forkliftName:
          forkliftUsed && forkliftName.trim()
            ? forkliftName.trim()
            : null,
        dockDoor: dockDoor.trim() || null,
      });

      setMessage(
        "Unloading setup saved in LARCOOS."
      );
    } catch {
      // Error is already displayed by postAction.
    }
  }

  async function completeForkliftSafetyCheck() {
    try {
      await postAction({
        action: "forklift-safety-check",
      });

      setMessage(
        "Forklift safety check completed and recorded."
      );
    } catch {
      // Error is already displayed by postAction.
    }
  }
  async function startUnloading() {
    try {
      const validWorkers = workerDrafts
        .map((worker) => ({
          workerName: worker.workerName.trim(),
          role: worker.role.trim(),
        }))
        .filter(
          (worker) =>
            worker.workerName.length > 0 &&
            worker.role.length > 0
        );

      await postAction({
        action: "start-unloading",

        forkliftUsed,

        forkliftName:
          forkliftUsed && forkliftName.trim()
            ? forkliftName.trim()
            : null,

        dockDoor:
          dockDoor.trim() || null,

        workers: validWorkers,
      });

      setMessage(
        "Unloading started. The persistent LARCOOS timer is now running."
      );
    } catch {
      // Error is already displayed by postAction.
    }
  }

  async function finishUnloading() {
    try {
      const data = await postAction({
        action: "finish-unloading",
      });

      const performance = data.performance;

      if (performance) {
        setMessage(
          `Unloading completed: ${
            performance.palletsUnloaded
          } pallets in ${formatDuration(
            performance.unloadingSeconds
          )}.`
        );
      } else {
        setMessage("Unloading completed.");
      }
    } catch {
      // Error is already displayed by postAction.
    }
  }

  function cancelCompletedCorrection() {
    if (receiving) {
      setOriginName(receiving.originName ?? "");
      setOriginCity(receiving.originCity ?? "");
      setOriginState(receiving.originState ?? "");
      setOriginCountry(
        receiving.originCountry ?? "United States"
      );

      setCarrierName(receiving.carrierName ?? "");
      setDriverName(receiving.driverName ?? "");
      setDriverPhone(receiving.driverPhone ?? "");

      setTruckNumber(receiving.truckNumber ?? "");
      setTrailerNumber(receiving.trailerNumber ?? "");

      setDistanceMiles(
        receiving.distanceMiles === null
          ? ""
          : String(receiving.distanceMiles)
      );

      setFreightCost(
        receiving.freightCost === null
          ? String(defaultFreight)
          : String(receiving.freightCost)
      );

      setForkliftUsed(receiving.forkliftUsed);
      setForkliftName(receiving.forkliftName ?? "");
      setDockDoor(receiving.dockDoor ?? "");
      setNotes(receiving.notes ?? "");
    }

    setCorrectionReason("");
    setEditingCompletedRecord(false);
    setError("");
  }

  async function saveCompletedCorrection() {
    const reason = correctionReason.trim();

    if (reason.length < 5) {
      setError(
        "Correction Reason is required and must contain at least 5 characters."
      );
      return;
    }

    try {
      await postAction({
        action: "correct-completed",
        reason,

        originName,
        originCity,
        originState,
        originCountry,

        carrierName,
        driverName,
        driverPhone,

        truckNumber,
        trailerNumber,

        distanceMiles:
          distanceMiles.trim() === ""
            ? null
            : Number(distanceMiles),

        freightCost:
          freightCost.trim() === ""
            ? null
            : Number(freightCost),

        forkliftUsed,
        forkliftName:
          forkliftUsed && forkliftName.trim()
            ? forkliftName.trim()
            : null,

        dockDoor: dockDoor.trim() || null,
        notes: notes.trim() || null,
      });

      setEditingCompletedRecord(false);
      setCorrectionReason("");
      setMessage(
        "Completed receiving record corrected. The change, reason, actor, before/after values and timestamp were preserved in the LARCOOS Audit Trail."
      );
    } catch {
      // Error is already displayed by postAction.
    }
  }

  function addWorker() {
    setWorkerDrafts((current) => [
      ...current,
      {
        workerName: "",
        role: "Warehouse Unloader",
      },
    ]);
  }

  function updateWorker(
    index: number,
    field: keyof WorkerDraft,
    value: string
  ) {
    setWorkerDrafts((current) =>
      current.map((worker, workerIndex) =>
        workerIndex === index
          ? {
              ...worker,
              [field]: value,
            }
          : worker
      )
    );
  }

  function removeWorker(index: number) {
    setWorkerDrafts((current) =>
      current.filter(
        (_, workerIndex) => workerIndex !== index
      )
    );
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <p className="text-sm text-zinc-400">
          Loading Receiving & Unloading...
        </p>
      </section>
    );
  }

  return (
    <section
      className={[
        "space-y-6 rounded-2xl border p-6",
        completedRecord
          ? "border-emerald-900 bg-emerald-950/10"
          : "border-zinc-800 bg-zinc-950",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            LARCOOS Operations
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-white">
            Receiving & Unloading
          </h2>

          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Physical receiving, freight metrics, unloading
            personnel, pallet sequence and persistent operation
            timing for {truckloadCode}.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div
            className={[
              "rounded-xl border px-4 py-3",
              completedRecord
                ? "border-emerald-900 bg-emerald-950/30"
                : "border-zinc-800 bg-zinc-900",
            ].join(" ")}
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Operational Status
            </p>

            <p
              className={[
                "mt-1 font-semibold",
                completedRecord
                  ? "text-emerald-300"
                  : "text-white",
              ].join(" ")}
            >
              {truckloadStatus || "Unknown"}
            </p>
          </div>

          {completedRecord &&
            canEditCompletedRecords &&
            !editingCompletedRecord && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setCorrectionReason("");
                  setEditingCompletedRecord(true);
                }}
                className="rounded-xl border border-amber-700 bg-amber-950/20 px-4 py-3 text-sm font-semibold text-amber-300 hover:bg-amber-950/40"
              >
                EDIT COMPLETED RECORD
              </button>
            )}
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

      {completedRecord && !editingCompletedRecord && (
        <div className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-4">
          <p className="text-sm font-semibold text-emerald-300">
            COMPLETED RECORD — LOCKED
          </p>
          <p className="mt-1 text-xs text-emerald-200/60">
            Receiving and unloading are complete. Operational history
            remains locked. Authorized managers may create an audited
            correction without reopening the truckload.
          </p>
        </div>
      )}

      {editingCompletedRecord && (
        <div className="rounded-xl border border-amber-700 bg-amber-950/20 p-4">
          <p className="text-sm font-semibold text-amber-300">
            MANAGER CORRECTION MODE
          </p>
          <p className="mt-1 text-xs text-amber-200/60">
            Administrative receiving fields are editable. Unloading
            timestamps, pallet history and completed status remain
            locked.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Expected Pallets"
          value={String(expectedPallets)}
        />

        <MetricCard
          label="Unloaded"
          value={`${palletsUnloaded} / ${expectedPallets}`}
        />

        <MetricCard
          label="Freight"
          value={formatMoney(
            receiving?.freightCost ??
              freightMetrics.freight
          )}
        />

        <MetricCard
          label="Operation Timer"
          value={formatDuration(elapsedSeconds)}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs text-zinc-400">
          <span>Unloading Progress</span>
          <span>{progress.toFixed(0)}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-white transition-all duration-300"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      <div
        className={[
          "rounded-2xl border p-5",
          completedRecord
            ? "border-emerald-900 bg-emerald-950/10"
            : "border-zinc-800 bg-zinc-900/40",
        ].join(" ")}
      >
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">
            1. Truck Arrival
          </h3>

          <p className="mt-1 text-sm text-zinc-500">
            Record where the load came from and who delivered it.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Origin / Facility"
            value={originName}
            onChange={setOriginName}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="Supplier warehouse"
          />

          <Field
            label="Origin City"
            value={originCity}
            onChange={setOriginCity}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="City"
          />

          <Field
            label="Origin State"
            value={originState}
            onChange={setOriginState}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="State"
          />

          <Field
            label="Origin Country"
            value={originCountry}
            onChange={setOriginCountry}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="United States"
          />

          <Field
            label="Carrier"
            value={carrierName}
            onChange={setCarrierName}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="Carrier name"
          />

          <Field
            label="Driver"
            value={driverName}
            onChange={setDriverName}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="Driver name"
          />

          <Field
            label="Driver Phone"
            value={driverPhone}
            onChange={setDriverPhone}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="Phone"
          />

          <Field
            label="Truck Number"
            value={truckNumber}
            onChange={setTruckNumber}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="Truck / tractor"
          />

          <Field
            label="Trailer Number"
            value={trailerNumber}
            onChange={setTrailerNumber}
            disabled={hasBeenReceived && !completedFieldsEditable}
            placeholder="Trailer"
          />

          <Field
            label="Distance Miles"
            value={distanceMiles}
            onChange={setDistanceMiles}
            disabled={hasBeenReceived && !completedFieldsEditable}
            type="number"
            placeholder="0"
          />

          <Field
            label="Freight Cost"
            value={freightCost}
            onChange={setFreightCost}
            disabled={hasBeenReceived && !completedFieldsEditable}
            type="number"
            placeholder="0.00"
          />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Cost / Mile"
            value={
              receiving?.costPerMile !== null &&
              receiving?.costPerMile !== undefined
                ? formatMoney(receiving.costPerMile)
                : freightMetrics.costPerMile === null
                ? "—"
                : formatMoney(freightMetrics.costPerMile)
            }
          />

          <MetricCard
            label="Cost / Pallet"
            value={
              receiving?.costPerPallet !== null &&
              receiving?.costPerPallet !== undefined
                ? formatMoney(receiving.costPerPallet)
                : freightMetrics.costPerPallet === null
                ? "—"
                : formatMoney(freightMetrics.costPerPallet)
            }
          />

          <MetricCard
            label="Arrival"
            value={formatDateTime(receiving?.receivedAt)}
          />
        </div>

        <div className="mt-5">
          {!hasBeenReceived ? (
            <button
              type="button"
              onClick={receiveTruck}
              disabled={working}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? "RECEIVING..." : "RECEIVE TRUCK"}
            </button>
          ) : (
            <div className="inline-flex rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-300">
              TRUCK RECEIVED
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">
            2. Operation Check-In
          </h3>

          <p className="mt-1 text-sm text-zinc-500">
            Record authenticated personnel participating in this truckload operation.
          </p>
        </div>

        {activeOperationCheckIn ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-4">
              <p className="text-sm font-semibold text-emerald-300">
                CHECKED IN
              </p>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Role
                  </p>
                  <p className="mt-1 text-white">
                    {activeOperationCheckIn.role}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Checked In
                  </p>
                  <p className="mt-1 text-white">
                    {formatDateTime(activeOperationCheckIn.checkedInAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Actor ID
                  </p>
                  <p className="mt-1 text-white">
                    {activeOperationCheckIn.actorId}
                  </p>
                </div>
              </div>

              {activeOperationCheckIn.notes && (
                <p className="mt-3 text-sm text-zinc-400">
                  {activeOperationCheckIn.notes}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={checkOutOperation}
              disabled={working}
              className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? "CHECKING OUT..." : "CHECK OUT"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Role
                </span>

                <select
                  value={operationRole}
                  onChange={(event) =>
                    setOperationRole(event.target.value)
                  }
                  disabled={!hasBeenReceived || working}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {WORKER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Operation Notes
                </span>

                <input
                  type="text"
                  value={operationNotes}
                  onChange={(event) =>
                    setOperationNotes(event.target.value)
                  }
                  disabled={!hasBeenReceived || working}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </div>

            {!hasBeenReceived && (
              <p className="text-xs text-amber-300">
                Receive the truck before checking in to the operation.
              </p>
            )}

            <button
              type="button"
              onClick={checkInOperation}
              disabled={!hasBeenReceived || working}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? "CHECKING IN..." : "CHECK IN"}
            </button>
          </div>
        )}

        {operationCheckIns.length > 0 && (
          <div className="mt-6 border-t border-zinc-800 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Operation History
            </p>

            <div className="mt-3 space-y-2">
              {operationCheckIns.map((checkIn) => (
                <div
                  key={checkIn.id}
                  className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm md:grid-cols-4"
                >
                  <span className="text-zinc-300">
                    Actor {checkIn.actorId}
                  </span>
                  <span className="text-zinc-300">
                    {checkIn.role}
                  </span>
                  <span className="text-zinc-500">
                    In: {formatDateTime(checkIn.checkedInAt)}
                  </span>
                  <span className="text-zinc-500">
                    Out: {formatDateTime(checkIn.checkedOutAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div
        className={[
          "rounded-2xl border p-5",
          completedRecord
            ? "border-emerald-900 bg-emerald-950/10"
            : "border-zinc-800 bg-zinc-900/40",
        ].join(" ")}
      >
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">
            3. Unloading Setup
          </h3>

          <p className="mt-1 text-sm text-zinc-500">
            Assign equipment and people before starting the
            persistent unloading timer.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <input
              type="checkbox"
              checked={forkliftUsed}
              onChange={(event) =>
                setForkliftUsed(event.target.checked)
              }
              disabled={
                !hasBeenReceived ||
                unloadingRunning ||
                (unloadingFinished && !completedFieldsEditable)
              }
              className="h-4 w-4"
            />

            <span className="text-sm text-zinc-200">
              Forklift Used
            </span>
          </label>

          <Field
            label="Forklift"
            value={forkliftName}
            onChange={setForkliftName}
            disabled={
              !hasBeenReceived ||
              !forkliftUsed ||
              unloadingRunning ||
              (unloadingFinished && !completedFieldsEditable)
            }
            placeholder="Forklift ID / rental"
          />

          <Field
            label="Dock / Door"
            value={dockDoor}
            onChange={setDockDoor}
            disabled={
              !hasBeenReceived ||
              unloadingRunning ||
              (unloadingFinished && !completedFieldsEditable)
            }
            placeholder="Dock 1"
          />
        </div>

        {!unloadingRunning &&
          !unloadingFinished &&
          hasBeenReceived && (
            <div className="mt-5 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
              <div>
                <h4 className="font-medium text-white">
                  Equipment Readiness
                </h4>
                <p className="mt-1 text-sm text-zinc-500">
                  Save the unloading setup before starting the operation.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveUnloadingSetup}
                  disabled={working}
                  className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {working ? "SAVING..." : "SAVE SETUP"}
                </button>
              </div>

              {forkliftUsed && (
                <div
                  className={[
                    "rounded-xl border p-4",
                    receiving?.forkliftSafetyCheckedAt
                      ? "border-emerald-900 bg-emerald-950/20"
                      : "border-amber-900 bg-amber-950/20",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Forklift Safety Check
                      </p>

                      {receiving?.forkliftSafetyCheckedAt ? (
                        <p className="mt-1 text-xs text-emerald-300">
                          COMPLETED ·{" "}
                          {formatDateTime(
                            receiving.forkliftSafetyCheckedAt
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-amber-300">
                          REQUIRED BEFORE START UNLOADING
                        </p>
                      )}
                    </div>

                    {!receiving?.forkliftSafetyCheckedAt && (
                      <button
                        type="button"
                        onClick={completeForkliftSafetyCheck}
                        disabled={
                          working ||
                          !receiving?.forkliftUsed
                        }
                        className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {working
                          ? "RECORDING..."
                          : "COMPLETE SAFETY CHECK"}
                      </button>
                    )}
                  </div>

                  {!receiving?.forkliftUsed &&
                    !receiving?.forkliftSafetyCheckedAt && (
                      <p className="mt-3 text-xs text-zinc-500">
                        Save Setup first so the selected forklift is
                        registered in LARCOOS.
                      </p>
                    )}
                </div>
              )}
            </div>
          )}
        {(completedRecord || editingCompletedRecord) && (
          <div className="mt-4">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Receiving Notes
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={!completedFieldsEditable}
                rows={4}
                placeholder="Receiving notes"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          </div>
        )}

        {editingCompletedRecord && (
          <div className="mt-6 space-y-4 rounded-2xl border border-amber-800 bg-amber-950/10 p-5">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                Correction Reason *
              </span>
              <textarea
                value={correctionReason}
                onChange={(event) =>
                  setCorrectionReason(event.target.value)
                }
                rows={3}
                placeholder="Explain why this completed record must be corrected."
                className="w-full rounded-xl border border-amber-900 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-amber-700"
              />
              <span className="block text-xs text-zinc-500">
                Required. This reason becomes part of the permanent
                Audit Trail.
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveCompletedCorrection}
                disabled={
                  working ||
                  correctionReason.trim().length < 5
                }
                className="rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {working
                  ? "SAVING CORRECTION..."
                  : "SAVE AUDITED CORRECTION"}
              </button>

              <button
                type="button"
                onClick={cancelCompletedCorrection}
                disabled={working}
                className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {!unloadingRunning &&
          !unloadingFinished &&
          hasBeenReceived && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-white">
                  Unloading Team
                </h4>

                <button
                  type="button"
                  onClick={addWorker}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                >
                  + ADD WORKER
                </button>
              </div>

              {workerDrafts.map((worker, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Field
                    label="Worker"
                    value={worker.workerName}
                    onChange={(value) =>
                      updateWorker(
                        index,
                        "workerName",
                        value
                      )
                    }
                    placeholder="Employee name"
                  />

                  <label className="space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Role
                    </span>

                    <select
                      value={worker.role}
                      onChange={(event) =>
                        updateWorker(
                          index,
                          "role",
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-zinc-600"
                    >
                      {WORKER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeWorker(index)}
                      disabled={workerDrafts.length === 1}
                      className="rounded-xl border border-zinc-800 px-3 py-2.5 text-sm text-zinc-400 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        {workers.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 font-medium text-white">
              Assigned Team
            </h4>

            <div className="grid gap-3 md:grid-cols-2">
              {workers.map((worker) => (
                <div
                  key={worker.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <p className="font-medium text-white">
                    {worker.workerName}
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    {worker.role}
                  </p>

                  <p className="mt-2 text-xs text-zinc-600">
                    Started:{" "}
                    {formatDateTime(worker.startedAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          {!hasBeenReceived ? (
            <p className="text-sm text-zinc-500">
              Receive the truck before unloading.
            </p>
          ) : !receiving?.unloadingStartedAt ? (
            <button
              type="button"
              onClick={startUnloading}
              disabled={working}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working
                ? "STARTING..."
                : "START UNLOADING"}
            </button>
          ) : unloadingRunning ? (
            <div className="inline-flex items-center gap-3 rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-3">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />

              <span className="text-sm font-semibold text-amber-300">
                UNLOADING IN PROGRESS
              </span>
            </div>
          ) : (
            <div className="inline-flex rounded-xl border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-300">
              UNLOADING COMPLETED
            </div>
          )}
        </div>
      </div>

      <div
        className={[
          "rounded-2xl border p-5",
          completedRecord
            ? "border-emerald-900 bg-emerald-950/10"
            : "border-zinc-800 bg-zinc-900/40",
        ].join(" ")}
      >
        <h3 className="text-lg font-semibold text-white">
          4. Finish Unloading
        </h3>

        <p className="mt-1 text-sm text-zinc-500">
          LARCOOS will calculate total duration, pallets/hour and
          minutes/pallet and preserve the operation in the Kernel.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Timer"
            value={formatDuration(elapsedSeconds)}
          />

          <MetricCard
            label="Expected Load"
            value={`${expectedPallets} pallets`}
          />

          <MetricCard
            label="Unload Mode"
            value="Continuous"
          />

          <MetricCard
            label="Finished At"
            value={formatDateTime(
              receiving?.unloadingFinishedAt
            )}
          />
        </div>

        <div
          className={[
            "mt-5 rounded-xl border p-4",
            hasEmptyTrailerEvidence
              ? "border-emerald-900 bg-emerald-950/20"
              : "border-amber-900 bg-amber-950/20",
          ].join(" ")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                Empty Trailer Photo
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Required after physical unloading and before the operation can be closed.
              </p>
            </div>

            {hasEmptyTrailerEvidence ? (
              <span className="text-xs font-semibold text-emerald-300">
                PHOTO REGISTERED
              </span>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setRequestedEvidenceCategory("EMPTY_TRAILER")
                }
                disabled={
                  working ||
                  !unloadingRunning ||
                  unloadingFinished
                }
                className="rounded-lg border border-amber-700 bg-amber-950/30 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                TAKE / UPLOAD EMPTY TRAILER PHOTO
              </button>
            )}
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={finishUnloading}
            disabled={
              working ||
              !unloadingRunning ||
              !hasEmptyTrailerEvidence
            }
            className="rounded-xl border border-zinc-600 bg-zinc-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {working
              ? "FINISHING..."
              : unloadingFinished
              ? "UNLOADING COMPLETED"
              : !hasEmptyTrailerEvidence
              ? "EMPTY TRAILER PHOTO REQUIRED"
              : "FINISH UNLOADING"}
          </button>
        </div>
      </div>

      {truckloadId !== null && (
        <ReceivingEvidencePanel
          truckloadId={truckloadId}
          truckloadCode={truckloadCode}
          onCategoriesChange={handleEvidenceCategoriesChange}
          requestCategory={requestedEvidenceCategory}
          onRequestHandled={() => setRequestedEvidenceCategory(null)}
        />
      )}
    </section>
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>

      <p className="mt-2 text-lg font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        step={type === "number" ? "any" : undefined}
        min={type === "number" ? "0" : undefined}
        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}
