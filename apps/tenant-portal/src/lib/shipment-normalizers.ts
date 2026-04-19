import type { InvoiceState, ShipmentState } from "@/types/domain";
import type { ShipmentDetail, ShipmentDocument, ShipmentListItem, ShipmentTimelineEvent } from "@/types/shipment";

const shipmentStates: ShipmentState[] = [
  "PENDING",
  "PROCESSING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED_DELIVERY",
  "RETURNED",
  "CANCELLED",
  "EXCEPTION"
];

const invoiceStates: InvoiceState[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const asNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const formatName = (value: string) =>
  value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function normalizeShipmentState(value: unknown): ShipmentState {
  const status = asString(value).toUpperCase() as ShipmentState;
  return shipmentStates.includes(status) ? status : "PENDING";
}

function normalizeInvoiceState(value: unknown): InvoiceState {
  const status = asString(value).toUpperCase() as InvoiceState;
  return invoiceStates.includes(status) ? status : "DRAFT";
}

function normalizeServiceTier(value: unknown): "Standard" | "Express" | "Same Day" {
  const normalized = asString(value).toUpperCase().replaceAll("_", " ");
  if (normalized === "SAME DAY") return "Same Day";
  if (normalized === "EXPRESS") return "Express";
  return "Standard";
}

function deriveFileName(value: string, fallback: string) {
  try {
    const url = new URL(value);
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
    return lastSegment ? decodeURIComponent(lastSegment) : fallback;
  } catch {
    const lastSegment = value.split("/").filter(Boolean).at(-1);
    return lastSegment ? decodeURIComponent(lastSegment) : fallback;
  }
}

function addressToString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return "Not available";
  }

  const preferredKeys = [
    "line1",
    "line2",
    "street",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "county",
    "postalCode",
    "postcode",
    "country"
  ];

  const values = [
    ...preferredKeys.map((key) => asString(record[key])).filter(Boolean),
    ...Object.entries(record)
      .filter(([key]) => !preferredKeys.includes(key))
      .map(([, entry]) => asString(entry))
      .filter(Boolean)
  ];

  return values.length > 0 ? Array.from(new Set(values)).join(", ") : "Not available";
}

function cityFromAddress(value: unknown): string {
  const record = asRecord(value);
  if (!record) {
    return "Unknown";
  }

  return (
    asString(record.city)
    || asString(record.town)
    || asString(record.state)
    || asString(record.country)
    || "Unknown"
  );
}

function userNameFromRecord(value: unknown): string {
  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const first = asString(record.firstName) || asString(record.first_name);
  const last = asString(record.lastName) || asString(record.last_name);
  const full = [first, last].filter(Boolean).join(" ").trim();

  return full || asString(record.email) || asString(record.name);
}

function driverNameFromRecord(value: unknown): string {
  const record = asRecord(value);
  if (!record) {
    return "";
  }

  return (
    asString(record.driver_name)
    || asString(record.driverName)
    || userNameFromRecord(record.user)
    || asString(record.name)
  );
}

function locationToString(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) {
    return typeof value === "string" ? value : undefined;
  }

  const lat = record.lat ?? record.latitude;
  const lng = record.lng ?? record.longitude;
  if (lat !== undefined && lng !== undefined) {
    return `${asNumber(lat).toFixed(5)}, ${asNumber(lng).toFixed(5)}`;
  }

  return addressToString(record);
}

function notesFromEvents(events: ShipmentTimelineEvent[]): ShipmentDetail["notes"] {
  return events
    .filter((event) => Boolean(event.note))
    .map((event) => ({
      id: `note-${event.id}`,
      author_name: event.actor,
      text: event.note ?? "",
      created_at: event.timestamp
    }));
}

function normalizeTimelineEvent(input: unknown, index: number): ShipmentTimelineEvent {
  const event = asRecord(input);
  const status = normalizeShipmentState(event?.status);
  const note = asString(event?.notes) || asString(event?.note) || undefined;

  return {
    id: asString(event?.id, `event-${index}`),
    status,
    description: note || `${formatName(status)} recorded`,
    location: locationToString(event?.location),
    timestamp: asString(event?.timestamp, new Date().toISOString()),
    actor: asString(event?.actor) || asString(event?.actorType) || "Operations",
    note
  };
}

function normalizeDocuments(input: unknown): ShipmentDocument[] {
  return asArray(input).map((entry, index) => {
    const document = asRecord(entry);
    const fileUrl = asString(document?.file_url) || asString(document?.fileUrl) || "#";
    const explicitType = asString(document?.file_type) || asString(document?.type).toLowerCase();
    const fileType =
      explicitType === "jpg" || explicitType === "jpeg"
        ? "jpg"
        : explicitType === "png"
          ? "png"
          : explicitType === "webp"
            ? "webp"
            : "pdf";

    return {
      id: asString(document?.id, `document-${index}`),
      file_name: asString(document?.file_name) || deriveFileName(fileUrl, `${fileType}-document-${index + 1}`),
      file_url: fileUrl,
      file_type: fileType,
      uploaded_by: asString(document?.uploaded_by) || asString(document?.generatedBy) || "Operations",
      uploaded_at: asString(document?.uploaded_at) || asString(document?.generatedAt) || new Date().toISOString(),
      preview_url: fileType === "pdf" ? undefined : fileUrl
    };
  });
}

export function normalizeShipmentListItem(input: unknown, index = 0): ShipmentListItem {
  const shipment = asRecord(input);
  const organisation = asRecord(shipment?.organisation);
  const originAddress = shipment?.originAddress ?? shipment?.origin_address ?? shipment?.pickup_address ?? shipment?.origin;
  const destinationAddress = shipment?.destinationAddress ?? shipment?.destination_address ?? shipment?.delivery_address ?? shipment?.destination;

  return {
    id: asString(shipment?.id, `shipment-${index}`),
    tracking_number:
      asString(shipment?.tracking_number)
      || asString(shipment?.trackingNumber)
      || `SHIPMENT-${index + 1}`,
    status: normalizeShipmentState(shipment?.status),
    customer_name:
      asString(shipment?.customer_name)
      || asString(shipment?.customerName)
      || asString(organisation?.name)
      || "Customer",
    origin: asString(shipment?.origin) || addressToString(originAddress),
    destination: asString(shipment?.destination) || addressToString(destinationAddress),
    route_id: asString(shipment?.route_id) || asString(shipment?.routeId) || undefined,
    route_name:
      asString(shipment?.route_name)
      || asString(shipment?.routeName)
      || asString(asRecord(shipment?.route)?.name)
      || undefined,
    driver_name:
      asString(shipment?.driver_name)
      || asString(shipment?.driverName)
      || driverNameFromRecord(shipment?.driver)
      || undefined,
    service_tier: normalizeServiceTier(shipment?.service_tier ?? shipment?.serviceTier),
    created_at: asString(shipment?.created_at) || asString(shipment?.createdAt) || new Date().toISOString(),
    reference: asString(shipment?.reference) || asString(shipment?.reference_number) || asString(shipment?.referenceNumber) || undefined
  };
}

export function normalizeShipmentListResponse(input: unknown): ShipmentListItem[] {
  const payload = asRecord(input);
  const rawRows = Array.isArray(input) ? input : asArray(payload?.data);
  return rawRows.map((row, index) => normalizeShipmentListItem(row, index));
}

export function normalizeShipmentDetail(input: unknown, fallbackId: string): ShipmentDetail {
  const shipment = asRecord(input);
  const timeline = asArray(shipment?.timeline).length > 0
    ? asArray(shipment?.timeline).map((event, index) => normalizeTimelineEvent(event, index))
    : asArray(shipment?.events).map((event, index) => normalizeTimelineEvent(event, index));
  const items = asArray(shipment?.items);
  const invoice = asRecord(shipment?.invoice);
  const organisation = asRecord(shipment?.organisation);
  const driver = asRecord(shipment?.driver);
  const podAssets = asArray(shipment?.podAssets);
  const documents = normalizeDocuments(shipment?.documents);
  const notes = asArray(shipment?.notes).length > 0
    ? asArray(shipment?.notes).map((entry, index) => {
        const note = asRecord(entry);
        return {
          id: asString(note?.id, `note-${index}`),
          author_name: asString(note?.author_name) || asString(note?.authorName) || "Operations",
          author_avatar: asString(note?.author_avatar) || asString(note?.authorAvatar) || undefined,
          text: asString(note?.text) || asString(note?.body),
          created_at: asString(note?.created_at) || asString(note?.createdAt) || new Date().toISOString()
        };
      })
    : notesFromEvents(timeline);
  const assignedDriverName = driverNameFromRecord(driver) || undefined;
  const customerName =
    asString(shipment?.customer_name)
    || asString(shipment?.customerName)
    || asString(organisation?.name)
    || "Customer";
  const weight = asNumber(shipment?.package_weight_kg ?? shipment?.packageWeightKg ?? shipment?.weightKg);
  const packageQuantity = asNumber(shipment?.package_quantity ?? shipment?.packageQuantity)
    || items.reduce((sum, item) => sum + asNumber(asRecord(item)?.quantity, 1), 0)
    || 1;

  return {
    id: asString(shipment?.id, fallbackId),
    tracking_number:
      asString(shipment?.tracking_number)
      || asString(shipment?.trackingNumber)
      || fallbackId,
    status: normalizeShipmentState(shipment?.status),
    service_tier: normalizeServiceTier(shipment?.service_tier ?? shipment?.serviceTier),
    customer_id: asString(shipment?.customer_id) || asString(shipment?.customerId) || "unknown-customer",
    customer_name: customerName,
    organisation_name: asString(organisation?.name) || undefined,
    reference_number:
      asString(shipment?.reference_number)
      || asString(shipment?.referenceNumber)
      || asString(shipment?.reference)
      || undefined,
    created_at: asString(shipment?.created_at) || asString(shipment?.createdAt) || new Date().toISOString(),
    pickup_address: addressToString(shipment?.pickup_address ?? shipment?.originAddress ?? shipment?.origin_address),
    delivery_address: addressToString(shipment?.delivery_address ?? shipment?.destinationAddress ?? shipment?.destination_address),
    origin_city: asString(shipment?.origin_city) || cityFromAddress(shipment?.originAddress ?? shipment?.origin_address),
    destination_city: asString(shipment?.destination_city) || cityFromAddress(shipment?.destinationAddress ?? shipment?.destination_address),
    package_weight_kg: weight,
    package_dimensions_cm:
      asString(shipment?.package_dimensions_cm)
      || asString(shipment?.packageDimensionsCm)
      || undefined,
    package_quantity: packageQuantity,
    package_description:
      asString(shipment?.package_description)
      || asString(shipment?.packageDescription)
      || asString(asRecord(items[0])?.description)
      || undefined,
    special_instructions:
      asString(shipment?.special_instructions)
      || asString(shipment?.specialInstructions)
      || undefined,
    pricing_amount: asNumber(shipment?.pricing_amount ?? shipment?.pricingAmount ?? shipment?.price),
    assigned_driver_id: asString(shipment?.assigned_driver_id) || asString(shipment?.assignedDriverId) || undefined,
    assigned_driver_name: assignedDriverName,
    assigned_driver_avatar: asString(asRecord(driver?.user)?.avatarUrl) || undefined,
    assigned_staff_name:
      asString(shipment?.assigned_staff_name)
      || asString(shipment?.assignedStaffName)
      || undefined,
    timeline,
    documents,
    invoice: invoice
      ? {
          id: asString(invoice.id, "invoice"),
          number: asString(invoice.invoiceNumber) || asString(invoice.number) || "Invoice",
          status: normalizeInvoiceState(invoice.status),
          amount: asNumber(invoice.total ?? invoice.amount),
          due_date: asString(invoice.dueDate) || asString(invoice.due_date) || new Date().toISOString()
        }
      : undefined,
    notes,
    exception_reason: asString(shipment?.exception_reason) || asString(shipment?.failedReason) || undefined,
    pod_photo_url: asString(asRecord(podAssets[0])?.fileUrl) || undefined,
    signature_url:
      asString(
        asRecord(
          podAssets.find((entry) => asString(asRecord(entry)?.type).toUpperCase() === "SIGNATURE")
        )?.fileUrl
      ) || undefined,
    estimated_delivery_date:
      asString(shipment?.estimated_delivery_date)
      || asString(shipment?.estimatedDelivery)
      || undefined
  };
}

export function normalizePodResponse(input: unknown) {
  const payload = asRecord(input);
  return {
    podAssets: asArray(payload?.podAssets).map((entry, index) => {
      const asset = asRecord(entry);
      return {
        id: asString(asset?.id, `pod-${index}`),
        type: asString(asset?.type, "PHOTO"),
        fileUrl: asString(asset?.fileUrl),
        capturedAt: asString(asset?.capturedAt) || undefined
      };
    }),
    recipientName: asString(payload?.recipientName, "Recipient"),
    deliveredAt: asString(payload?.deliveredAt) || null,
    capturedBy: asString(payload?.capturedBy, "Field Operator")
  };
}
