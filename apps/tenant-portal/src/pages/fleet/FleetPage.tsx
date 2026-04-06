import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type FleetVehicle = {
  id: string;
  registration?: string;
  type?: string;
  make?: string;
  model?: string;
  capacityKg?: number;
  capacityM3?: number;
  isActive: boolean;
  drivers?: Array<{ id: string; user: { firstName?: string | null; lastName?: string | null; email: string } }>;
};

type FleetDriver = {
  id: string;
  isAvailable: boolean;
  licenceNumber?: string | null;
  todaysRouteStops: number;
  deliveriesCompletedToday: number;
  user: { firstName?: string | null; lastName?: string | null; email: string };
  vehicle?: { registration?: string | null; type?: string | null } | null;
};

async function fetchVehicles() {
  const response = await api.get<{ vehicles: FleetVehicle[] }>("/v1/fleet/vehicles");
  return response.data.vehicles;
}

async function fetchDrivers() {
  const response = await api.get<{ drivers: FleetDriver[] }>("/v1/fleet/drivers");
  return response.data.drivers;
}

export function FleetPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("drivers");
  const [vehicleForm, setVehicleForm] = useState({
    registration: "",
    type: "VAN",
    capacityKg: "",
    capacityM3: "",
    make: "",
    model: ""
  });
  const [driverForm, setDriverForm] = useState({
    userId: "",
    vehicleId: "",
    licenceNumber: ""
  });

  const vehiclesQuery = useQuery({
    queryKey: ["fleet-vehicles"],
    queryFn: fetchVehicles
  });
  const driversQuery = useQuery({
    queryKey: ["fleet-drivers"],
    queryFn: fetchDrivers
  });

  const createVehicle = useMutation({
    mutationFn: async () => {
      await api.post("/v1/fleet/vehicles", {
        registration: vehicleForm.registration,
        type: vehicleForm.type,
        capacityKg: Number(vehicleForm.capacityKg || 0),
        capacityM3: Number(vehicleForm.capacityM3 || 0),
        make: vehicleForm.make,
        model: vehicleForm.model
      });
    },
    onSuccess: async () => {
      setVehicleForm({ registration: "", type: "VAN", capacityKg: "", capacityM3: "", make: "", model: "" });
      await queryClient.invalidateQueries({ queryKey: ["fleet-vehicles"] });
    }
  });

  const createDriver = useMutation({
    mutationFn: async () => {
      await api.post("/v1/fleet/drivers", {
        userId: driverForm.userId,
        vehicleId: driverForm.vehicleId || null,
        licenceNumber: driverForm.licenceNumber
      });
    },
    onSuccess: async () => {
      setDriverForm({ userId: "", vehicleId: "", licenceNumber: "" });
      await queryClient.invalidateQueries({ queryKey: ["fleet-drivers"] });
    }
  });

  const toggleDriverAvailability = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      await api.patch(`/v1/fleet/drivers/${id}`, { isAvailable });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fleet-drivers"] });
    }
  });

  const vehicles = vehiclesQuery.data ?? [];
  const drivers = driversQuery.data ?? [];

  return (
    <PageShell title="Fleet" description="Driver and vehicle management for operations control.">
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "drivers", label: "Drivers" },
          { value: "vehicles", label: "Vehicles" }
        ]}
      >
        <TabsContent value="drivers">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-4">
              <Input value={driverForm.userId} onChange={(event) => setDriverForm((prev) => ({ ...prev, userId: event.target.value }))} placeholder="TENANT_DRIVER user ID" />
              <Input value={driverForm.vehicleId} onChange={(event) => setDriverForm((prev) => ({ ...prev, vehicleId: event.target.value }))} placeholder="Vehicle ID (optional)" />
              <Input value={driverForm.licenceNumber} onChange={(event) => setDriverForm((prev) => ({ ...prev, licenceNumber: event.target.value }))} placeholder="Licence number" />
              <Button onClick={() => createDriver.mutate()}>Add Driver</Button>
            </div>

            <Table columns={["Driver", "Licence", "Vehicle", "Stops", "Completed", "Available"]}>
              {drivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell>{[driver.user.firstName, driver.user.lastName].filter(Boolean).join(" ") || driver.user.email}</TableCell>
                  <TableCell>{driver.licenceNumber ?? "N/A"}</TableCell>
                  <TableCell>{driver.vehicle?.registration ?? "Unassigned"}</TableCell>
                  <TableCell>{driver.todaysRouteStops}</TableCell>
                  <TableCell>{driver.deliveriesCompletedToday}</TableCell>
                  <TableCell>
                    <Switch
                      checked={driver.isAvailable}
                      onCheckedChange={(checked) => toggleDriverAvailability.mutate({ id: driver.id, isAvailable: checked })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="vehicles">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-6">
              <Input value={vehicleForm.registration} onChange={(event) => setVehicleForm((prev) => ({ ...prev, registration: event.target.value }))} placeholder="Registration" />
              <Input value={vehicleForm.type} onChange={(event) => setVehicleForm((prev) => ({ ...prev, type: event.target.value }))} placeholder="Type (VAN/TRUCK/...)" />
              <Input value={vehicleForm.capacityKg} onChange={(event) => setVehicleForm((prev) => ({ ...prev, capacityKg: event.target.value }))} placeholder="Capacity KG" />
              <Input value={vehicleForm.capacityM3} onChange={(event) => setVehicleForm((prev) => ({ ...prev, capacityM3: event.target.value }))} placeholder="Capacity M3" />
              <Input value={vehicleForm.make} onChange={(event) => setVehicleForm((prev) => ({ ...prev, make: event.target.value }))} placeholder="Make" />
              <div className="flex gap-2">
                <Input value={vehicleForm.model} onChange={(event) => setVehicleForm((prev) => ({ ...prev, model: event.target.value }))} placeholder="Model" />
                <Button onClick={() => createVehicle.mutate()}>Add</Button>
              </div>
            </div>

            <Table columns={["Registration", "Type", "Capacity", "Assigned Driver", "Available"]}>
              {vehicles.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  <TableCell>{vehicle.registration ?? "N/A"}</TableCell>
                  <TableCell>{vehicle.type ?? "N/A"}</TableCell>
                  <TableCell>{vehicle.capacityKg ?? 0}kg / {vehicle.capacityM3 ?? 0}m3</TableCell>
                  <TableCell>
                    {[vehicle.drivers?.[0]?.user.firstName, vehicle.drivers?.[0]?.user.lastName].filter(Boolean).join(" ") ||
                      vehicle.drivers?.[0]?.user.email ||
                      "Unassigned"}
                  </TableCell>
                  <TableCell>{vehicle.isActive ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

