import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/http";
import { fieldApi } from "@/lib/api/fieldApi";
import type { FieldJob, FieldRoute, FieldStop, FieldUser, PendingMutation } from "@/types/field";

vi.mock("@/lib/api/http", () => ({
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

describe("fieldApi", () => {
  afterEach(() => {
    apiRequestMock.mockReset();
  });

  it("normalizes login responses from backend auth payloads", async () => {
    apiRequestMock.mockResolvedValueOnce({
      access_token: "token-123",
      tenant_slug: "northline",
      user: {
        userId: "user-1",
        tenant_id: "tenant-1",
        fullName: "Ada Driver",
        email: "ada@example.com",
        role: "Driver",
        tenantName: "Northline",
        vehicle: "Van 4",
        shift: "Morning",
        scopes: ["scan", "pod", 42],
      },
    });

    const result = await fieldApi.login("ada@example.com", "secret");

    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/auth/login", {
      method: "POST",
      body: {
        email: "ada@example.com",
        password: "secret",
      },
    });
    expect(result).toEqual({
      accessToken: "token-123",
      tenantSlug: "northline",
      user: {
        id: "user-1",
        tenantId: "tenant-1",
        name: "Ada Driver",
        email: "ada@example.com",
        role: "Driver",
        tenantLabel: "Northline",
        vehicleLabel: "Van 4",
        shiftLabel: "Morning",
        permissions: ["scan", "pod"],
      },
    });
  });

  it("fetches assigned jobs and builds normalized route and stop data", async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        items: [
          {
            job_id: "job-1",
            shipment_id: "SHIP-1",
            job_type: "pickup",
            route_id: "route-1",
            stop_id: "stop-1",
            location_address: "12 Dock Road",
            status: "unknown",
            priority: "urgent",
            updated_at: "2026-04-19T10:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        routes: [
          {
            route_id: "route-1",
            name: "Route A",
            zone: "East",
            assigned_at: "2026-04-19T08:00:00.000Z",
            shift_window: "08:00-16:00",
            vehicleName: "Van 4",
          },
        ],
      })
      .mockResolvedValueOnce({
        stop: {
          stop_id: "stop-1",
          route_id: "route-1",
          shipment_id: "SHIP-1",
          sequence: 2,
          job_type: "pickup",
          name: "Pickup stop",
          location_address: "12 Dock Road",
          eta: "10:30",
          packages: 3,
          pod_requirements: {
            signature: true,
          },
          verification_codes: [
            {
              code_id: "code-1",
              target: "package",
              name: "Box label",
              code: "PKG-1",
              code_type: "qr",
            },
          ],
          stop_status: "in_progress",
          updated_at: "2026-04-19T10:15:00.000Z",
        },
      });

    const result = await fieldApi.fetchAssignedWork("token-123");

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, "/api/v1/field/jobs", {
      method: "GET",
      token: "token-123",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, "/api/v1/field/routes", {
      method: "GET",
      token: "token-123",
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(3, "/api/v1/field/stops/stop-1", {
      method: "GET",
      token: "token-123",
    });
    expect(result.jobs[0]).toMatchObject({
      id: "job-1",
      shipmentId: "SHIP-1",
      type: "pickup",
      workflowStage: "pickup",
      status: "assigned",
      priority: "normal",
      address: "12 Dock Road",
    });
    expect(result.routes[0]).toEqual({
      id: "route-1",
      label: "Route A",
      area: "East",
      vehicleLabel: "Van 4",
      assignedAt: "2026-04-19T08:00:00.000Z",
      shiftWindow: "08:00-16:00",
    });
    expect(result.stops[0]).toMatchObject({
      id: "stop-1",
      routeId: "route-1",
      shipmentId: "SHIP-1",
      type: "pickup",
      workflowStage: "pickup",
      title: "Pickup stop",
      etaLabel: "10:30",
      packageCount: 3,
      status: "in_progress",
      podRequirements: {
        otp: false,
        signature: true,
        photo: false,
        recipientName: false,
      },
      verificationCodes: [
        {
          id: "code-1",
          target: "package",
          label: "Box label",
          value: "PKG-1",
          codeType: "qr",
        },
      ],
    });
  });

  it("falls back to synthetic stops when stop details cannot be loaded", async () => {
    apiRequestMock
      .mockResolvedValueOnce({
        jobs: [
          {
            id: "job-2",
            shipmentId: "SHIP-2",
            type: "delivery",
            address: "44 Market Street",
            instructions: "Leave at reception. Call on arrival.",
            updatedAt: "2026-04-19T11:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("stop unavailable"));

    const result = await fieldApi.fetchAssignedWork("token-123");

    expect(result.stops).toEqual([
      {
        id: "stop-job-2",
        routeId: "unassigned-route",
        shipmentId: "SHIP-2",
        sequence: 0,
        type: "delivery",
        workflowStage: "delivery",
        title: "Leave at reception",
        address: "44 Market Street",
        contactName: undefined,
        contactPhone: undefined,
        instructions: "Leave at reception. Call on arrival.",
        etaLabel: "--:--",
        packageCount: 0,
        verificationCodes: [],
        status: "assigned",
        updatedAt: "2026-04-19T11:00:00.000Z",
      },
    ]);
  });

  it("maps pending mutations into backend sync events", async () => {
    apiRequestMock.mockResolvedValueOnce({
      results: [{ mutation_id: "mutation-1", status: "accepted" }],
    });

    const user: FieldUser = {
      id: "user-1",
      tenantId: "tenant-1",
      name: "Ada Driver",
      email: "ada@example.com",
      role: "Driver",
      tenantLabel: "Northline",
      vehicleLabel: "Van 4",
      shiftLabel: "Morning",
      permissions: [],
    };
    const jobs: FieldJob[] = [
      {
        id: "job-1",
        shipmentId: "SHIP-1",
        type: "delivery",
        workflowStage: "delivery",
        status: "assigned",
        priority: "normal",
        stopId: "stop-1",
        address: "12 Dock Road",
        updatedAt: "2026-04-19T10:00:00.000Z",
      },
    ];
    const stops: FieldStop[] = [
      {
        id: "stop-1",
        routeId: "route-1",
        shipmentId: "SHIP-1",
        sequence: 1,
        type: "delivery",
        workflowStage: "delivery",
        title: "Delivery stop",
        address: "12 Dock Road",
        etaLabel: "10:30",
        packageCount: 1,
        verificationCodes: [],
        status: "assigned",
        updatedAt: "2026-04-19T10:00:00.000Z",
      },
    ];
    const selected: PendingMutation[] = [
      {
        id: "mutation-1",
        type: "status_update",
        entityId: "stop-1",
        payload: {
          stopId: "stop-1",
          status: "completed",
        },
        createdAt: "2026-04-19T10:30:00.000Z",
        retryCount: 0,
        idempotencyKey: "idem-1",
        state: "pending",
      },
    ];

    const result = await fieldApi.syncBatch("token-123", selected, {
      user,
      jobs,
      routes: [],
      stops,
      podDrafts: [],
      scanVerifications: [],
      locationPings: [],
    });

    expect(apiRequestMock).toHaveBeenCalledWith("/api/v1/field/sync/batch", {
      method: "POST",
      token: "token-123",
      body: {
        mutations: [
          {
            mutationId: "mutation-1",
            eventId: "mutation-1",
            eventType: "field.stop.status_changed",
            type: "status_update",
            tenantId: "tenant-1",
            actorId: "user-1",
            shipmentId: "SHIP-1",
            jobId: "job-1",
            stopId: "stop-1",
            workflowStage: "delivery",
            occurredAt: "2026-04-19T10:30:00.000Z",
            idempotencyKey: "idem-1",
            payload: {
              stopId: "stop-1",
              status: "completed",
            },
          },
        ],
      },
    });
    expect(result).toEqual({
      results: [{ mutationId: "mutation-1", state: "synced" }],
    });
  });
});
