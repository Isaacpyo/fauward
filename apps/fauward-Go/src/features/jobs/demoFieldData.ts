import type {
  FieldJob,
  FieldRoute,
  FieldStop,
  LocationPing,
  PendingMutation,
  PodDraft,
  ScanVerificationRecord,
} from "@/types/field";

export type SeededFieldData = {
  jobs: FieldJob[];
  routes: FieldRoute[];
  stops: FieldStop[];
  pendingMutations: PendingMutation[];
  podDrafts: PodDraft[];
  scanVerifications: ScanVerificationRecord[];
  locationPings: LocationPing[];
};

export const createSeededFieldData = (): SeededFieldData => {
  const now = new Date().toISOString();

  const route: FieldRoute = {
    id: "route-ops-lag-01",
    label: "Lagos lifecycle board",
    area: "Ikeja / Yaba / Apapa",
    vehicleLabel: "FG-2142",
    assignedAt: now,
    shiftWindow: "08:00 - 18:00",
  };

  const stops: FieldStop[] = [
    {
      id: "stop-shipment-creation",
      routeId: route.id,
      shipmentId: "SHP-24001",
      sequence: 1,
      type: "shipment",
      workflowStage: "shipment_creation",
      title: "Create shipment record",
      address: "Merchant desk, 18 Allen Avenue, Ikeja",
      contactName: "Efe Ojo",
      contactPhone: "+234 800 111 2401",
      instructions: "Create the shipment, confirm sender details, and print the shipment label.",
      etaLabel: "08:15",
      packageCount: 3,
      verificationCodes: [
        {
          id: "code-shipment-creation-shipment",
          target: "shipment",
          label: "Shipment reference",
          value: "SHP-24001",
          codeType: "barcode",
        },
        {
          id: "code-shipment-creation-label",
          target: "label",
          label: "Master label",
          value: "LBL-24001-A",
          codeType: "qr",
        },
      ],
      status: "in_progress",
      updatedAt: now,
    },
    {
      id: "stop-warehouse-intake",
      routeId: route.id,
      shipmentId: "SHP-24002",
      sequence: 2,
      type: "hub",
      workflowStage: "warehouse_intake",
      title: "Receive inbound pallet",
      address: "Warehouse lane 4, Acme Road, Ikeja",
      contactName: "Warehouse Control",
      contactPhone: "+234 800 111 2402",
      instructions: "Confirm the shipment barcode and the pallet package barcode before shelving.",
      etaLabel: "09:00",
      packageCount: 8,
      verificationCodes: [
        {
          id: "code-warehouse-intake-shipment",
          target: "shipment",
          label: "Inbound shipment",
          value: "SHP-24002",
          codeType: "barcode",
        },
        {
          id: "code-warehouse-intake-package",
          target: "package",
          label: "Pallet package",
          value: "PKG-24002-01",
          codeType: "barcode",
        },
      ],
      status: "assigned",
      updatedAt: now,
    },
    {
      id: "stop-dispatch-handoff",
      routeId: route.id,
      shipmentId: "SHP-24003",
      sequence: 3,
      type: "dispatch",
      workflowStage: "dispatch_handoff",
      title: "Dispatch rider handoff",
      address: "Dispatch cage B, Apapa logistics yard",
      contactName: "Dispatch Supervisor",
      contactPhone: "+234 800 111 2403",
      instructions: "Verify the rider handoff label and confirm the shipment leaves the bay.",
      etaLabel: "10:00",
      packageCount: 4,
      verificationCodes: [
        {
          id: "code-dispatch-handoff-shipment",
          target: "shipment",
          label: "Dispatch shipment",
          value: "SHP-24003",
          codeType: "barcode",
        },
        {
          id: "code-dispatch-handoff-label",
          target: "label",
          label: "Dispatch label",
          value: "DSP-24003-B",
          codeType: "qr",
        },
      ],
      status: "assigned",
      updatedAt: now,
    },
    {
      id: "stop-pickup",
      routeId: route.id,
      shipmentId: "SHP-24004",
      sequence: 4,
      type: "pickup",
      workflowStage: "pickup",
      title: "Pickup supplier cartons",
      address: "21 Sabo Street, Yaba",
      contactName: "Ayo Balogun",
      contactPhone: "+234 800 111 2404",
      instructions: "Verify the pickup label, confirm the carton count, and move the task forward.",
      etaLabel: "11:00",
      packageCount: 6,
      verificationCodes: [
        {
          id: "code-pickup-shipment",
          target: "shipment",
          label: "Pickup shipment",
          value: "SHP-24004",
          codeType: "barcode",
        },
        {
          id: "code-pickup-label",
          target: "label",
          label: "Pickup label",
          value: "PU-24004-A",
          codeType: "qr",
        },
      ],
      status: "assigned",
      updatedAt: now,
    },
    {
      id: "stop-linehaul",
      routeId: route.id,
      shipmentId: "SHP-24005",
      sequence: 5,
      type: "transfer",
      workflowStage: "linehaul",
      title: "Linehaul transfer departure",
      address: "Outbound gate 2, Apapa logistics yard",
      contactName: "Linehaul Desk",
      contactPhone: "+234 800 111 2405",
      instructions: "Capture the transfer departure and keep location pings running during movement.",
      etaLabel: "12:30",
      packageCount: 10,
      verificationCodes: [],
      status: "assigned",
      updatedAt: now,
    },
    {
      id: "stop-delivery",
      routeId: route.id,
      shipmentId: "SHP-24006",
      sequence: 6,
      type: "delivery",
      workflowStage: "delivery",
      title: "Deliver customer order",
      address: "42 Commercial Avenue, Yaba",
      contactName: "Mariam Yusuf",
      contactPhone: "+234 800 111 2406",
      instructions: "Verify shipment items, then collect OTP, signature, and photo proof before completion.",
      etaLabel: "14:00",
      packageCount: 2,
      podRequirements: {
        otp: true,
        signature: true,
        photo: true,
        recipientName: true,
      },
      verificationCodes: [
        {
          id: "code-delivery-shipment",
          target: "shipment",
          label: "Delivery shipment",
          value: "SHP-24006",
          codeType: "qr",
        },
        {
          id: "code-delivery-package",
          target: "package",
          label: "Delivery package",
          value: "PKG-24006-01",
          codeType: "barcode",
        },
        {
          id: "code-delivery-label",
          target: "label",
          label: "Delivery label",
          value: "DLV-24006-M",
          codeType: "barcode",
        },
      ],
      status: "assigned",
      updatedAt: now,
    },
    {
      id: "stop-return-initiation",
      routeId: route.id,
      shipmentId: "SHP-24007",
      sequence: 7,
      type: "return",
      workflowStage: "return_initiation",
      title: "Collect customer return",
      address: "University Gate, Herbert Macaulay Way",
      contactName: "Tolu Afolabi",
      contactPhone: "+234 800 111 2407",
      instructions: "Verify the return label, capture return photos, and record the customer signoff.",
      etaLabel: "15:10",
      packageCount: 1,
      podRequirements: {
        otp: false,
        signature: true,
        photo: true,
        recipientName: true,
      },
      verificationCodes: [
        {
          id: "code-return-initiation-shipment",
          target: "shipment",
          label: "Return shipment",
          value: "SHP-24007",
          codeType: "barcode",
        },
        {
          id: "code-return-initiation-label",
          target: "label",
          label: "Return label",
          value: "RET-24007-C",
          codeType: "qr",
        },
      ],
      status: "assigned",
      updatedAt: now,
    },
    {
      id: "stop-return-receipt",
      routeId: route.id,
      shipmentId: "SHP-24008",
      sequence: 8,
      type: "return",
      workflowStage: "return_receipt",
      title: "Receive return at hub",
      address: "Reverse logistics zone, Acme Road, Ikeja",
      contactName: "Returns Desk",
      contactPhone: "+234 800 111 2408",
      instructions: "Scan the inbound return package and confirm receipt into the warehouse.",
      etaLabel: "16:30",
      packageCount: 1,
      verificationCodes: [
        {
          id: "code-return-receipt-shipment",
          target: "shipment",
          label: "Return receipt shipment",
          value: "SHP-24008",
          codeType: "barcode",
        },
        {
          id: "code-return-receipt-package",
          target: "package",
          label: "Return receipt package",
          value: "PKG-24008-01",
          codeType: "barcode",
        },
      ],
      status: "assigned",
      updatedAt: now,
    },
  ];

  const jobs: FieldJob[] = stops.map((stop, index) => ({
    id: `job-${stop.shipmentId.toLowerCase()}`,
    shipmentId: stop.shipmentId,
    type: stop.type,
    workflowStage: stop.workflowStage,
    status: stop.status,
    priority:
      index === 0
        ? "high"
        : stop.workflowStage === "delivery" || stop.workflowStage === "return_initiation"
          ? "critical"
          : stop.workflowStage === "pickup" || stop.workflowStage === "dispatch_handoff"
            ? "high"
            : "normal",
    routeId: stop.routeId,
    stopId: stop.id,
    address: stop.address,
    contactName: stop.contactName,
    contactPhone: stop.contactPhone,
    instructions: stop.instructions,
    timeWindowStart: stop.etaLabel,
    timeWindowEnd: stop.etaLabel,
    updatedAt: stop.updatedAt,
  }));

  const scanVerifications: ScanVerificationRecord[] = [
    {
      id: "scan-shipment-creation-1",
      shipmentId: "SHP-24001",
      stopId: "stop-shipment-creation",
      target: "shipment",
      expectedValue: "SHP-24001",
      codeType: "barcode",
      scannedValue: "SHP-24001",
      result: "matched",
      createdAt: now,
      synced: true,
    },
  ];

  const locationPings: LocationPing[] = [
    {
      id: "location-linehaul-1",
      lat: 6.4551,
      lng: 3.3846,
      accuracy: 15,
      source: "gps",
      stopId: "stop-linehaul",
      createdAt: now,
      synced: false,
    },
  ];

  const pendingMutations: PendingMutation[] = [
    {
      id: "mutation-location-linehaul-1",
      type: "location_update",
      entityId: "location-linehaul-1",
      payload: {
        stopId: "stop-linehaul",
        lat: 6.4551,
        lng: 3.3846,
        accuracy: 15,
      },
      createdAt: now,
      retryCount: 0,
      idempotencyKey: "idem-location-linehaul-1",
      state: "pending",
    },
  ];

  const podDrafts: PodDraft[] = [
    {
      id: "pod-draft-delivery-1",
      shipmentId: "SHP-24006",
      stopId: "stop-delivery",
      recipientName: "Mariam Yusuf",
      otpCode: "",
      photoRefs: [],
      notes: "",
      state: "draft",
    },
  ];

  return {
    jobs,
    routes: [route],
    stops,
    pendingMutations,
    podDrafts,
    scanVerifications,
    locationPings,
  };
};
