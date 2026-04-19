import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";

import { Select } from "@/components/ui/Select";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type DriverLocation = {
  driverId: string;
  driverName: string;
  lat: number;
  lng: number;
  lastUpdated?: string;
  activeShipments: number;
  vehicleType?: string;
};

type LiveShipment = {
  shipmentId: string;
  trackingNumber: string;
  lat: number;
  lng: number;
  status: string;
  driverName?: string;
  recipientName: string;
  estimatedDelivery?: string;
};

const fallbackDrivers: DriverLocation[] = [
  {
    driverId: "drv-1",
    driverName: "Amina Yusuf",
    lat: 6.5244,
    lng: 3.3792,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    activeShipments: 5,
    vehicleType: "Van"
  },
  {
    driverId: "drv-2",
    driverName: "Daniel Cole",
    lat: 6.4654,
    lng: 3.4064,
    lastUpdated: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    activeShipments: 3,
    vehicleType: "Bike"
  }
];

const fallbackShipments: LiveShipment[] = [
  {
    shipmentId: "ship-1",
    trackingNumber: "FWD-2026-10451",
    lat: 6.5128,
    lng: 3.3841,
    status: "OUT_FOR_DELIVERY",
    driverName: "Amina Yusuf",
    recipientName: "Atlas Retail",
    estimatedDelivery: "Today 14:30"
  },
  {
    shipmentId: "ship-2",
    trackingNumber: "FWD-2026-10432",
    lat: 6.4581,
    lng: 3.395,
    status: "IN_TRANSIT",
    driverName: "Daniel Cole",
    recipientName: "Northline Freight",
    estimatedDelivery: "Today 16:10"
  }
];

async function fetchDriverLocations() {
  const response = await api.get<DriverLocation[]>("/v1/driver/locations");
  return response.data;
}

async function fetchLiveShipments() {
  const response = await api.get<{ shipments: LiveShipment[] }>("/v1/shipments/live-map");
  return response.data.shipments;
}

export function LiveMapPage() {
  const [driverFilter, setDriverFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const driversQuery = useQuery({
    queryKey: ["live-driver-locations"],
    queryFn: fetchDriverLocations,
    refetchInterval: 60_000
  });

  const shipmentsQuery = useQuery({
    queryKey: ["live-shipments"],
    queryFn: fetchLiveShipments,
    refetchInterval: 60_000
  });

  const drivers = driversQuery.data ?? fallbackDrivers;
  const shipments = shipmentsQuery.data ?? fallbackShipments;

  const filteredShipments = useMemo(() => {
    return shipments.filter((shipment) => {
      const byDriver = driverFilter === "all" ? true : shipment.driverName === driverFilter;
      const byStatus = statusFilter === "all" ? true : shipment.status === statusFilter;
      return byDriver && byStatus;
    });
  }, [shipments, driverFilter, statusFilter]);

  const center = useMemo(() => {
    const all = [...drivers, ...filteredShipments];
    if (all.length === 0) return { lat: 51.5074, lng: -0.1278 };
    const lat = all.reduce((sum, item) => sum + item.lat, 0) / all.length;
    const lng = all.reduce((sum, item) => sum + item.lng, 0) / all.length;
    return { lat, lng };
  }, [drivers, filteredShipments]);

  return (
    <PageShell title="Live Map" description="Command center for active driver locations and in-flight deliveries.">
      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <aside className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
          <Select
            value={driverFilter}
            onValueChange={setDriverFilter}
            options={[
              { label: "All drivers", value: "all" },
              ...drivers.map((driver) => ({ label: driver.driverName, value: driver.driverName }))
            ]}
          />
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { label: "All statuses", value: "all" },
              { label: "IN_TRANSIT", value: "IN_TRANSIT" },
              { label: "OUT_FOR_DELIVERY", value: "OUT_FOR_DELIVERY" }
            ]}
          />

          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            <p>Legend:</p>
            <p className="mt-1">Blue markers: drivers</p>
            <p>Amber markers: active shipments</p>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="h-[52vh] overflow-hidden rounded-lg border border-gray-200 bg-white">
            {mapsApiKey ? (
              <APIProvider apiKey={mapsApiKey}>
                <Map defaultCenter={center} defaultZoom={6} gestureHandling="greedy" mapId="fauward-live-map">
                  {drivers.map((driver) => (
                    <Marker
                      key={`driver-${driver.driverId}`}
                      position={{ lat: driver.lat, lng: driver.lng }}
                      title={`${driver.driverName} (${driver.activeShipments} active)`}
                    />
                  ))}
                  {filteredShipments.map((shipment) => (
                    <Marker
                      key={`shipment-${shipment.shipmentId}`}
                      position={{ lat: shipment.lat, lng: shipment.lng }}
                      title={`${shipment.trackingNumber} - ${shipment.status}`}
                    />
                  ))}
                </Map>
              </APIProvider>
            ) : (
              <div className="flex h-full flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Live operations</p>
                  <h3 className="mt-2 text-2xl font-semibold">Map preview unavailable locally</h3>
                  <p className="mt-2 max-w-xl text-sm text-slate-200">
                    Add `VITE_GOOGLE_MAPS_API_KEY` to enable the interactive map. The live dispatch summary below still shows active drivers and shipments.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Drivers online</p>
                    <p className="mt-2 text-3xl font-semibold">{drivers.length}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Active deliveries</p>
                    <p className="mt-2 text-3xl font-semibold">{filteredShipments.length}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Most recent ping</p>
                    <p className="mt-2 text-sm font-semibold">
                      {drivers[0]?.lastUpdated ? new Date(drivers[0].lastUpdated).toLocaleTimeString() : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900">Driver fleet</h3>
              <div className="mt-3 space-y-3">
                {drivers.map((driver) => (
                  <div key={driver.driverId} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{driver.driverName}</p>
                      <span className="text-xs text-gray-500">{driver.activeShipments} active</span>
                    </div>
                    <p className="mt-1 text-gray-600">{driver.vehicleType ?? "Vehicle unassigned"}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {driver.lastUpdated ? `Updated ${new Date(driver.lastUpdated).toLocaleTimeString()}` : "Awaiting ping"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900">Shipment watchlist</h3>
              <div className="mt-3 space-y-3">
                {filteredShipments.map((shipment) => (
                  <div key={shipment.shipmentId} className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono font-medium text-gray-900">{shipment.trackingNumber}</p>
                      <span className="text-xs text-gray-500">{shipment.status}</span>
                    </div>
                    <p className="mt-1 text-gray-700">{shipment.recipientName}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {shipment.driverName ?? "Unassigned"} {shipment.estimatedDelivery ? `· ETA ${shipment.estimatedDelivery}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
