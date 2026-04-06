import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

export function TaxPage() {
  const [enabled, setEnabled] = useState(true);
  const [taxName, setTaxName] = useState("VAT");
  const [rate, setRate] = useState("20");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [exemptOrgs, setExemptOrgs] = useState("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/pricing/tax", {
        enabled,
        taxName,
        rate: Number(rate),
        taxNumber,
        taxIncluded,
        exemptOrgs: exemptOrgs
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      });
    }
  });

  return (
    <PricingSectionPage title="Tax Configuration" description="Set VAT/GST/Sales Tax behaviour and organisation exemptions.">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Tax enabled</p>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <Input className="mt-2" value={taxName} onChange={(event) => setTaxName(event.target.value)} placeholder="Tax name (VAT/GST/Sales Tax)" />
          <Input className="mt-2" type="number" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Tax rate %" />
          <Input className="mt-2" value={taxNumber} onChange={(event) => setTaxNumber(event.target.value)} placeholder="Tax registration number" />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Tax included in prices</p>
            <Switch checked={taxIncluded} onCheckedChange={setTaxIncluded} />
          </div>
          <Input
            className="mt-2"
            value={exemptOrgs}
            onChange={(event) => setExemptOrgs(event.target.value)}
            placeholder="Exempt organisation IDs (comma separated)"
          />
        </div>
      </div>
      <Button onClick={() => saveMutation.mutate()}>Save tax config</Button>
    </PricingSectionPage>
  );
}

