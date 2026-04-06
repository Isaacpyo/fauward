import { useNavigate } from "react-router-dom";

import { CreateShipmentWizard } from "@/components/shipments/CreateShipmentWizard";
import { PageShell } from "@/layouts/PageShell";

export function CreateShipmentPage() {
  const navigate = useNavigate();

  return (
    <PageShell title="Create Shipment Wizard" description="Create a shipment in four validated steps.">
      <CreateShipmentWizard onCreated={(trackingNumber) => navigate(`/shipments/${trackingNumber}`)} />
    </PageShell>
  );
}
