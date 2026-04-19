import { CreateShipmentWizard } from "@/components/shipments/CreateShipmentWizard";
import { PageShell } from "@/layouts/PageShell";

export function CreateShipmentPage() {
  return (
    <PageShell title="Create Shipment Wizard" description="Create a shipment in four validated steps.">
      <CreateShipmentWizard />
    </PageShell>
  );
}
