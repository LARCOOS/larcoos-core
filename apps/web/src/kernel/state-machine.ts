export const TRUCKLOAD_STATUSES = [
  "Planned",
  "Purchased",
  "Shipping",
  "Received",
  "Unloading",
  "Unloaded",
  "Processing",
  "Processed",
  "Manifested",
  "Ready for Export",
  "In Transit to Mexico",
  "Customs",
  "Released",
  "Received at ViDaMar",
  "Selling",
  "Sold",
  "Closed",
] as const;

export type TruckloadStatus =
  (typeof TRUCKLOAD_STATUSES)[number];

export type TransitionMode =
  | "AUTOMATIC"
  | "MANUAL"
  | "CORRECTION";

export type TransitionRequirement =
  | "PURCHASE_PAYMENT_CONFIRMED"
  | "PURCHASE_EVIDENCE"
  | "SHIPPING_CONFIRMED"
  | "ARRIVAL_RECORDED"
  | "ARRIVAL_EVIDENCE"
  | "UNLOADING_STARTED"
  | "ALL_PALLETS_UNLOADED"
  | "UNLOADING_FINISHED"
  | "PROCESSING_STARTED"
  | "PROCESSING_COMPLETED"
  | "MANIFEST_COMPLETED"
  | "EXPORT_READY"
  | "MEXICO_DEPARTURE_CONFIRMED"
  | "CUSTOMS_STARTED"
  | "CUSTOMS_RELEASED"
  | "VIDAMAR_RECEIPT_CONFIRMED"
  | "SALE_STARTED"
  | "ALL_INVENTORY_SOLD"
  | "ECONOMIC_LIFECYCLE_CLOSED";

export type TruckloadTransitionDefinition = {
  from: TruckloadStatus;
  to: TruckloadStatus;
  eventType: string;
  requirements: readonly TransitionRequirement[];
};

export const TRUCKLOAD_TRANSITIONS:
  readonly TruckloadTransitionDefinition[] = [
  {
    from: "Planned",
    to: "Purchased",
    eventType: "TRUCKLOAD_PURCHASED",
    requirements: [
      "PURCHASE_PAYMENT_CONFIRMED",
      "PURCHASE_EVIDENCE",
    ],
  },
  {
    from: "Purchased",
    to: "Shipping",
    eventType: "TRUCKLOAD_SHIPPING_STARTED",
    requirements: ["SHIPPING_CONFIRMED"],
  },
  {
    from: "Shipping",
    to: "Received",
    eventType: "TRUCK_RECEIVED",
    requirements: [
      "ARRIVAL_RECORDED",
      "ARRIVAL_EVIDENCE",
    ],
  },
  {
    from: "Received",
    to: "Unloading",
    eventType: "UNLOADING_STARTED",
    requirements: ["UNLOADING_STARTED"],
  },
  {
    from: "Unloading",
    to: "Unloaded",
    eventType: "UNLOADING_FINISHED",
    requirements: [
      "ALL_PALLETS_UNLOADED",
      "UNLOADING_FINISHED",
    ],
  },
  {
    from: "Unloaded",
    to: "Processing",
    eventType: "PROCESSING_STARTED",
    requirements: ["PROCESSING_STARTED"],
  },
  {
    from: "Processing",
    to: "Processed",
    eventType: "PROCESSING_COMPLETED",
    requirements: ["PROCESSING_COMPLETED"],
  },
  {
    from: "Processed",
    to: "Manifested",
    eventType: "MANIFEST_COMPLETED",
    requirements: ["MANIFEST_COMPLETED"],
  },
  {
    from: "Manifested",
    to: "Ready for Export",
    eventType: "TRUCKLOAD_READY_FOR_EXPORT",
    requirements: ["EXPORT_READY"],
  },
  {
    from: "Ready for Export",
    to: "In Transit to Mexico",
    eventType: "MEXICO_TRANSPORT_STARTED",
    requirements: ["MEXICO_DEPARTURE_CONFIRMED"],
  },
  {
    from: "In Transit to Mexico",
    to: "Customs",
    eventType: "CUSTOMS_PROCESS_STARTED",
    requirements: ["CUSTOMS_STARTED"],
  },
  {
    from: "Customs",
    to: "Released",
    eventType: "CUSTOMS_RELEASED",
    requirements: ["CUSTOMS_RELEASED"],
  },
  {
    from: "Released",
    to: "Received at ViDaMar",
    eventType: "TRUCKLOAD_RECEIVED_AT_VIDAMAR",
    requirements: ["VIDAMAR_RECEIPT_CONFIRMED"],
  },
  {
    from: "Received at ViDaMar",
    to: "Selling",
    eventType: "TRUCKLOAD_SELLING_STARTED",
    requirements: ["SALE_STARTED"],
  },
  {
    from: "Selling",
    to: "Sold",
    eventType: "TRUCKLOAD_SOLD",
    requirements: ["ALL_INVENTORY_SOLD"],
  },
  {
    from: "Sold",
    to: "Closed",
    eventType: "TRUCKLOAD_CLOSED",
    requirements: ["ECONOMIC_LIFECYCLE_CLOSED"],
  },
];

export function isTruckloadStatus(
  value: unknown
): value is TruckloadStatus {
  return (
    typeof value === "string" &&
    (TRUCKLOAD_STATUSES as readonly string[]).includes(value)
  );
}

export function getTruckloadTransition(
  from: TruckloadStatus,
  to: TruckloadStatus
): TruckloadTransitionDefinition | null {
  return (
    TRUCKLOAD_TRANSITIONS.find(
      (transition) =>
        transition.from === from &&
        transition.to === to
    ) ?? null
  );
}

export function getNextTruckloadTransition(
  current: TruckloadStatus
): TruckloadTransitionDefinition | null {
  return (
    TRUCKLOAD_TRANSITIONS.find(
      (transition) => transition.from === current
    ) ?? null
  );
}

export function evaluateTransitionRequirements(
  transition: TruckloadTransitionDefinition,
  satisfiedRequirements: readonly TransitionRequirement[]
) {
  const satisfied =
    new Set<TransitionRequirement>(satisfiedRequirements);

  const missingRequirements =
    transition.requirements.filter(
      (requirement) => !satisfied.has(requirement)
    );

  return {
    allowed: missingRequirements.length === 0,
    missingRequirements,
  };
}

export function assertTruckloadTransition(
  from: TruckloadStatus,
  to: TruckloadStatus,
  satisfiedRequirements: readonly TransitionRequirement[]
) {
  const transition =
    getTruckloadTransition(from, to);

  if (!transition) {
    throw new Error(
      `Invalid truckload transition: ${from} -> ${to}`
    );
  }

  const evaluation =
    evaluateTransitionRequirements(
      transition,
      satisfiedRequirements
    );

  if (!evaluation.allowed) {
    throw new Error(
      `Truckload transition blocked: missing ${evaluation.missingRequirements.join(", ")}`
    );
  }

  return transition;
}