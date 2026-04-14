import { create } from "zustand";
import { clearTokens } from "@/lib/auth";

export type StopStatus = "pending" | "completed" | "failed";

export type DriverShipment = {
  id: string;
  trackingNumber: string;
  description: string;
  status: "PENDING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED_DELIVERY" | "EXCEPTION";
  weightKg: number;
  dimensionsCm: string;
  quantity: number;
  specialInstructions?: string;
  customerNotes?: string;
  timeline: Array<{ id: string; label: string; at: string }>;
};

export type RouteStop = {
  id: string;
  number: number;
  customerName: string;
  address: string;
  phone: string;
  status: StopStatus;
  current: boolean;
  shipmentCount: number;
  shipments: DriverShipment[];
};

type DriverStoreState = {
  isAuthenticated: boolean;
  tenant: { name: string; logoUrl: string; primaryColor: string };
  user: { name: string; email: string; phone: string; vehicle: string };
  routeStarted: boolean;
  stops: RouteStop[];
  history: Array<{ id: string; trackingNumber: string; customer: string; status: string; time: string }>;
  /** Called after a successful API login to persist email in the store. */
  setAuthenticated: (authenticated: boolean, email?: string) => void;
  /** @deprecated Use setAuthenticated — kept for backward compat */
  login: (email: string) => void;
  logout: () => void;
  startRoute: () => void;
  completeStop: (id: string) => void;
  failStop: (id: string) => void;
  markShipmentDelivered: (stopId: string, shipmentId: string) => void;
  markShipmentFailed: (stopId: string, shipmentId: string) => void;
};

const mockStops: RouteStop[] = [
  {
    id: "stop_1",
    number: 1,
    customerName: "Acme Retail",
    address: "14 Holloway Rd, London N7",
    phone: "+44 20 7946 0123",
    status: "pending",
    current: true,
    shipmentCount: 2,
    shipments: [
      {
        id: "shp_1",
        trackingNumber: "FWD-2026-10021",
        description: "2 cartons electronics",
        status: "OUT_FOR_DELIVERY",
        weightKg: 5.2,
        dimensionsCm: "40x30x25",
        quantity: 2,
        specialInstructions: "Call before arrival.",
        customerNotes: "Leave at reception if unavailable.",
        timeline: [
          { id: "t1", label: "Out for delivery", at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
          { id: "t2", label: "In transit", at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
          { id: "t3", label: "Picked up", at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() }
        ]
      },
      {
        id: "shp_2",
        trackingNumber: "FWD-2026-10022",
        description: "Documents",
        status: "OUT_FOR_DELIVERY",
        weightKg: 0.3,
        dimensionsCm: "22x16x2",
        quantity: 1,
        timeline: [
          { id: "t4", label: "Out for delivery", at: new Date(Date.now() - 75 * 60 * 1000).toISOString() },
          { id: "t5", label: "In transit", at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
          { id: "t6", label: "Picked up", at: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString() }
        ]
      }
    ]
  },
  {
    id: "stop_2",
    number: 2,
    customerName: "Northline Foods",
    address: "2 Wharf Street, London SE1",
    phone: "+44 20 7555 9021",
    status: "pending",
    current: false,
    shipmentCount: 1,
    shipments: [
      {
        id: "shp_3",
        trackingNumber: "FWD-2026-10023",
        description: "Cold chain box",
        status: "OUT_FOR_DELIVERY",
        weightKg: 3.1,
        dimensionsCm: "36x24x24",
        quantity: 1,
        timeline: [
          { id: "t7", label: "Out for delivery", at: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
          { id: "t8", label: "In transit", at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
          { id: "t9", label: "Picked up", at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString() }
        ]
      }
    ]
  }
];

export const useDriverStore = create<DriverStoreState>((set) => ({
  isAuthenticated: false,
  tenant: {
    name: "Fauward",
    logoUrl: "/icons/icon-192.svg",
    primaryColor: "#0d1f3c"
  },
  user: {
    name: "Jamie Driver",
    email: "jamie.driver@fauward.com",
    phone: "+44 7700 900100",
    vehicle: "Ford Transit - LN66 FWD"
  },
  routeStarted: false,
  stops: mockStops,
  history: [
    {
      id: "hist_1",
      trackingNumber: "FWD-2026-09991",
      customer: "Portbridge",
      status: "DELIVERED",
      time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "hist_2",
      trackingNumber: "FWD-2026-09975",
      customer: "Lagos Hub",
      status: "FAILED_DELIVERY",
      time: new Date(Date.now() - 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString()
    }
  ],
  setAuthenticated: (authenticated, email) =>
    set((state) => ({
      isAuthenticated: authenticated,
      user: email ? { ...state.user, email } : state.user
    })),
  login: (email) =>
    set((state) => ({
      isAuthenticated: true,
      user: { ...state.user, email }
    })),
  logout: () => {
    clearTokens();
    set({ isAuthenticated: false });
  },
  startRoute: () => set({ routeStarted: true }),
  completeStop: (id) =>
    set((state) => ({
      stops: state.stops.map((stop) =>
        stop.id === id ? { ...stop, status: "completed", current: false } : stop
      )
    })),
  failStop: (id) =>
    set((state) => ({
      stops: state.stops.map((stop) => (stop.id === id ? { ...stop, status: "failed", current: false } : stop))
    })),
  markShipmentDelivered: (stopId, shipmentId) =>
    set((state) => ({
      stops: state.stops.map((stop) =>
        stop.id !== stopId
          ? stop
          : {
              ...stop,
              shipments: stop.shipments.map((shipment) =>
                shipment.id === shipmentId ? { ...shipment, status: "DELIVERED" } : shipment
              )
            }
      )
    })),
  markShipmentFailed: (stopId, shipmentId) =>
    set((state) => ({
      stops: state.stops.map((stop) =>
        stop.id !== stopId
          ? stop
          : {
              ...stop,
              shipments: stop.shipments.map((shipment) =>
                shipment.id === shipmentId ? { ...shipment, status: "FAILED_DELIVERY" } : shipment
              )
            }
      )
    }))
}));

