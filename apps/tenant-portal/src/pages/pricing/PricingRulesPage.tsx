import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PricingSectionPage } from "./PricingSectionPage";
import { api } from "@/lib/api";

type PricingRule = {
  id: string;
  priority: number;
  name: string;
  action: string;
  actionValue: number;
  isEnabled: boolean;
  conditions: Record<string, unknown>;
};

export function PricingRulesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [action, setAction] = useState("MULTIPLY");
  const [actionValue, setActionValue] = useState("1");
  const [conditionSummary, setConditionSummary] = useState("{}");

  const rulesQuery = useQuery({
    queryKey: ["pricing-rules"],
    queryFn: async () => (await api.get<{ rules: PricingRule[] }>("/v1/pricing/rules")).data.rules
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/v1/pricing/rules", {
        name,
        action,
        actionValue: Number(actionValue),
        conditions: JSON.parse(conditionSummary || "{}")
      });
    },
    onSuccess: async () => {
      setName("");
      setActionValue("1");
      setConditionSummary("{}");
      await queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/v1/pricing/rules/${id}/toggle`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/pricing/rules/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
    }
  });

  const rules = rulesQuery.data ?? [];

  return (
    <PricingSectionPage title="Dynamic Pricing Rules" description="Priority-ordered conditional rule engine for pricing overrides and promotions.">
      <div className="grid gap-3 lg:grid-cols-4">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Rule name" />
        <Select
          value={action}
          onValueChange={setAction}
          options={[
            { label: "ADD", value: "ADD" },
            { label: "SUBTRACT", value: "SUBTRACT" },
            { label: "MULTIPLY", value: "MULTIPLY" },
            { label: "OVERRIDE_TOTAL", value: "OVERRIDE_TOTAL" },
            { label: "SET_MIN", value: "SET_MIN" },
            { label: "SET_MAX", value: "SET_MAX" }
          ]}
        />
        <Input value={actionValue} onChange={(event) => setActionValue(event.target.value)} placeholder="Action value" />
        <Button onClick={() => createMutation.mutate()}>New Rule</Button>
      </div>

      <Input
        value={conditionSummary}
        onChange={(event) => setConditionSummary(event.target.value)}
        placeholder='Conditions JSON, e.g. {"serviceTiers":["EXPRESS"],"daysOfWeek":[0,6]}'
      />

      <Table columns={["Priority", "Name", "Conditions", "Action", "Enabled", "Actions"]}>
        {rules.map((rule) => (
          <TableRow key={rule.id}>
            <TableCell>{rule.priority}</TableCell>
            <TableCell>{rule.name}</TableCell>
            <TableCell>{JSON.stringify(rule.conditions)}</TableCell>
            <TableCell>
              {rule.action} {Number(rule.actionValue).toFixed(2)}
            </TableCell>
            <TableCell>
              <Switch checked={rule.isEnabled} onCheckedChange={() => toggleMutation.mutate(rule.id)} />
            </TableCell>
            <TableCell>
              <Button variant="secondary" size="sm" onClick={() => deleteMutation.mutate(rule.id)}>
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </Table>
    </PricingSectionPage>
  );
}

