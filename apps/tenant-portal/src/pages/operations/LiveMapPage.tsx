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

  const drivers = driversQuery.data ?? [];
  const shipments = shipmentsQuery.data ?? [];

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

        <section className="h-[72vh] overflow-hidden rounded-lg border border-gray-200">
          <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ""}>
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
        </section>
      </div>
    </PageShell>
  );
}

