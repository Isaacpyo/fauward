# Fauward Agent — Tool Reference

← [Back to README](../README.md)

---

## Events handled

| Event type | Trigger | Required `payload` fields | What the agent does |
|---|---|---|---|
| `shipment_created` | New shipment booked | `originPostcode`, `destPostcode`, `weightKg` | Assign driver, select carrier |
| `status_changed` | Shipment status update | `newStatus`, `previousStatus` | Take action based on new status |
| `sla_check` | Scheduled interval | `slaDeadline` | Flag at-risk shipments |
| `failed_delivery` | Delivery attempt failed | `reason` | Notify customer, flag SLA risk, recommend reroute |
| `nl_query` | Tenant asks a question | `question`, `dateFrom?`, `dateTo?` | Query analytics, return plain-English answer |

All events require `eventId` (string, min 1). Events without it are rejected with `400 { "error": "eventId is required" }`.

---

## Operational tools

### `assign_shipment`
Assigns a shipment to a driver. Writes a `ShipmentEvent`, an `AuditLog`, and an `OutboxEvent` in a single transaction.

- **Authority:** `auto_approved` when the shipment has no current driver. `requires_approval` when a driver is already assigned (reassignment).
- **Always call `get_available_drivers` first** — the model is instructed to do this in the system prompt.

**Arguments:**

| Field | Type | Description |
|---|---|---|
| `shipmentId` | `string` | Target shipment |
| `driverId` | `string` | Selected driver |
| `reason` | `string` | Why this driver was chosen |

---

### `get_available_drivers`
Returns all available drivers for the tenant including location, vehicle capacity, and active job count.

- **Authority:** `auto_approved`
- **Read-only**

**Arguments:**

| Field | Type | Description |
|---|---|---|
| `tenantId` | `string` | Must match run context |
| `originPostcode` | `string \| null` | Optional proximity filter |

---

### `get_shipment_details`
Full shipment record: status, route, SLA deadline, driver, history (last 25 events), items, documents, POD assets.

- **Authority:** `auto_approved`
- **Read-only**

**Arguments:**

| Field | Type |
|---|---|
| `shipmentId` | `string` |

---

### `reroute_shipment`
Reassigns a shipment to a different driver. Writes a `ShipmentEvent`, `AuditLog`, and `OutboxEvent`.

- **Authority:** `requires_approval` — always. This tool is never executed autonomously.
- **Always call `get_shipment_details` first.**

**Arguments:**

| Field | Type | Description |
|---|---|---|
| `shipmentId` | `string` | Target shipment |
| `newDriverId` | `string` | Replacement driver |
| `reason` | `string` | Reason for rerouting |

---

### `send_customer_notification`
Queues an email or SMS via the notification queue. Deduplication is enforced per `shipmentId + templateKey + channel` within a run.

- **Authority:** `auto_approved`
- `templateKey` is validated against the approved enum — no free-form messages.

**Arguments:**

| Field | Type | Allowed values |
|---|---|---|
| `shipmentId` | `string` | — |
| `channel` | `enum` | `email`, `sms` |
| `templateKey` | `enum` | `out_for_delivery`, `delayed`, `failed_delivery`, `reattempt_scheduled`, `sla_risk_update` |
| `customMessage` | `string \| null` | Supplementary note only — must not replace the template |

---

### `get_carrier_rates`
Returns active rate card options for a route, ordered by base price. Calculates estimated total from `basePrice + pricePerKg × weightKg`, clamped to `minCharge` / `maxCharge`.

- **Authority:** `auto_approved`
- **Read-only**

**Arguments:**

| Field | Type |
|---|---|
| `originPostcode` | `string` |
| `destPostcode` | `string` |
| `weightKg` | `number` (positive) |
| `tenantId` | `string` |

---

### `flag_sla_risk`
Logs an SLA risk event visible to supervisors. Writes a `ShipmentEvent` and `AuditLog` in a transaction.

- **Authority:** `auto_approved`
- Use `HIGH` for estimated delay >60 min, `MEDIUM` for 30–60 min.

**Arguments:**

| Field | Type | Description |
|---|---|---|
| `shipmentId` | `string` | — |
| `riskLevel` | `enum` | `HIGH`, `MEDIUM` |
| `estimatedDelayMinutes` | `number \| null` | — |
| `reason` | `string` | — |

---

## Analytics tools

All 7 analytics tools share the same argument shape. All are `auto_approved`, read-only, and validated with Zod `.strict()`.

**Common arguments:**

| Field | Type | Default |
|---|---|---|
| `tenantId` | `string` | — (required) |
| `dateFrom` | `string \| null` | 30 days before `dateTo` |
| `dateTo` | `string \| null` | `now()` |

---

### `get_failed_shipments_count`
Count of shipments with status `FAILED_DELIVERY` created in the date range.

**Returns:** `{ tenantId, dateFrom, dateTo, failedDeliveriesCount }`

---

### `get_delay_reasons`
Groups exception/failure events by reason code extracted from event notes. Returns the top 20 reasons by frequency.

**Returns:** `{ tenantId, dateFrom, dateTo, totalExceptionEvents, reasonBreakdown: [{ reason, count }] }`

---

### `get_sla_breach_rate`
Counts late deliveries (delivered after `estimatedDelivery`) and overdue open shipments (past `estimatedDelivery`, not yet in a terminal status).

**Returns:** `{ tenantId, dateFrom, dateTo, totalShipments, lateDeliveries, overdueOpen, totalBreaches, breachRate, breachRatePercent }`

---

### `get_driver_performance`
Per-driver job count, delivery count, on-time delivery count, and on-time rate. Only includes drivers with at least one job in the period.

**Returns:** `{ tenantId, dateFrom, dateTo, drivers: [{ driverId, name, totalJobs, deliveredCount, onTimeCount, onTimeRate }] }`

---

### `get_carrier_performance`
Returns the active carrier catalogue (rate cards). Per-carrier volume and on-time rate tracking requires the Phase 2 carrier-shipment linkage.

**Returns:** `{ tenantId, dateFrom, dateTo, note, carriers: [{ carrier, rateCardId, serviceTier, currency }] }`

---

### `get_shipments_by_status`
Count of shipments grouped by status for the date range.

**Returns:** `{ tenantId, dateFrom, dateTo, total, byStatus: { STATUS: count } }`

---

### `get_weekly_operations_summary`
Pre-built digest combining all key KPIs in a single call: delivery count, failure count, delivery success rate, SLA breach rate, and top 5 delay reasons. Designed for use by `nl_query` events.

**Returns:** `{ tenantId, dateFrom, dateTo, totalShipments, delivered, failed, deliverySuccessRate, lateDeliveries, overdueOpen, slaBreachRate, slaBreachRatePercent, topDelayReasons, shipmentsByStatus }`

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | Yes | - | Provider key consumed only by `LLMGatewayService` |
| `DEEPSEEK_BASE_URL` | No | provider default | Provider base URL consumed only by `LLMGatewayService` |
| `AGENT_MODEL` | No | `deepseek-v4-pro` | Legacy config; current model selection is centralized in the gateway routing table |
| `AGENT_FLASH_MODEL` | No | `deepseek-v4-flash` | Legacy config; current model selection is centralized in the gateway routing table |
| `AGENT_MAX_ITERATIONS` | No | `15` | Maximum tool-calling iterations before forced stop |
| `AGENT_REQUEST_TIMEOUT_MS` | No | `120000` | Legacy timeout; gateway tasks enforce their own timeouts |
| `AGENT_SERVICE_TOKEN` | Yes (prod) | — | Bearer token for internal `handle-event` calls |
| `REDIS_HOST` | No | `localhost` | Redis host for BullMQ worker |

**Model routing logic** (in `agent.config.ts → selectModel()`):

| Event type | Model used |
|---|---|
| `shipment_created`, `failed_delivery`, `sla_check` | `AGENT_MODEL` (pro) |
| `nl_query`, `status_changed` | `AGENT_FLASH_MODEL` (flash) |
