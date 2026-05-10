import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type Condition = { field: string; operator: string; value: string };
type Action = { type: string; value: string };
type ShippingRule = {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  conditions: Condition[];
  actions: Action[];
};

const conditionFields = ["destinationCountry", "originCountry", "weightKg", "lengthCm", "widthCm", "heightCm", "declaredValue", "serviceType", "originBranchId", "customerTag"];
const operators = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains"];
const actionTypes = ["assignCarrier", "assignRoute", "requireCustomsDeclaration", "addInsurance", "blockBooking", "flagForReview", "setServiceType", "notifyOperator"];

function blankRule(): Omit<ShippingRule, "id"> {
  return {
    name: "",
    priority: 0,
    isActive: true,
    conditions: [{ field: "destinationCountry", operator: "eq", value: "NG" }],
    actions: [{ type: "assignCarrier", value: "" }]
  };
}

export function ShippingRulesPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Omit<ShippingRule, "id"> & { id?: string }>(blankRule());
  const [mockShipment, setMockShipment] = useState(JSON.stringify({ destinationCountry: "NG", weightKg: 3, serviceType: "STANDARD" }, null, 2));
  const [testResults, setTestResults] = useState<Array<{ rule: string; result: unknown }>>([]);

  const rulesQuery = useQuery({
    queryKey: ["shipping-rules"],
    queryFn: async () => {
      const response = await api.get<{ rules?: ShippingRule[]; data?: ShippingRule[] }>("/v1/tenant/shipping-rules");
      return response.data.rules ?? response.data.data ?? [];
    }
  });
  const rules = rulesQuery.data ?? [];

  const saveRule = useMutation({
    mutationFn: async () => {
      const payload = { ...draft, priority: Number(draft.priority) };
      if (draft.id) return api.put(`/v1/tenant/shipping-rules/${draft.id}`, payload);
      return api.post("/v1/tenant/shipping-rules", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping-rules"] });
      setDraft(blankRule());
    }
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ShippingRule> }) => api.put(`/v1/tenant/shipping-rules/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipping-rules"] })
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => api.delete(`/v1/tenant/shipping-rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipping-rules"] })
  });

  const dryRun = useMutation({
    mutationFn: async () => {
      const shipment = JSON.parse(mockShipment);
      const activeRules = rules.filter((rule) => rule.isActive);
      const responses = await Promise.all(activeRules.map(async (rule) => ({
        rule: rule.name,
        result: (await api.post(`/v1/tenant/shipping-rules/${rule.id}/test`, shipment)).data
      })));
      return responses;
    },
    onSuccess: setTestResults
  });

  const activeCount = useMemo(() => rules.filter((rule) => rule.isActive).length, [rules]);

  function updateCondition(index: number, patch: Partial<Condition>) {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition, i) => i === index ? { ...condition, ...patch } : condition)
    }));
  }

  function updateAction(index: number, patch: Partial<Action>) {
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((action, i) => i === index ? { ...action, ...patch } : action)
    }));
  }

  return (
    <PageShell title="Shipping rules" description="Create booking-time IF/THEN rules and test them before enabling.">
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Table columns={["Name", "Priority", "Active", "Conditions", "Actions", "Manage"]}>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-semibold text-gray-900">{rule.name}</TableCell>
                <TableCell>{rule.priority}</TableCell>
                <TableCell>
                  <Switch checked={rule.isActive} onCheckedChange={(checked) => updateRule.mutate({ id: rule.id, data: { isActive: checked } })} />
                </TableCell>
                <TableCell>{rule.conditions?.length ?? 0}</TableCell>
                <TableCell>{rule.actions?.length ?? 0}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setDraft(rule)}>Edit</Button>
                    <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => window.confirm("Delete this rule?") && deleteRule.mutate(rule.id)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </Table>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Dry-run test panel</h2>
              <span className="text-xs text-gray-500">{activeCount} active rules</span>
            </div>
            <Textarea value={mockShipment} onChange={(event) => setMockShipment(event.target.value)} rows={8} />
            <Button className="mt-3" variant="secondary" loading={dryRun.isPending} onClick={() => dryRun.mutate()}>Test rules</Button>
            {testResults.length ? (
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-gray-50 p-3 text-xs">{JSON.stringify(testResults, null, 2)}</pre>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{draft.id ? "Edit rule" : "Create rule"}</h2>
            <Button size="sm" variant="ghost" onClick={() => setDraft(blankRule())}>Clear</Button>
          </div>
          <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Rule name" />
          <Input type="number" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) }))} placeholder="Priority" />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Conditions</h3>
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setDraft((current) => ({ ...current, conditions: [...current.conditions, { field: "weightKg", operator: "lt", value: "5" }] }))}>Add</Button>
            </div>
            {draft.conditions.map((condition, index) => (
              <div key={index} className="grid gap-2 rounded-md border border-gray-100 p-3">
                <Select value={condition.field} onValueChange={(value) => updateCondition(index, { field: value })} options={conditionFields.map((value) => ({ label: value, value }))} />
                <Select value={condition.operator} onValueChange={(value) => updateCondition(index, { operator: value })} options={operators.map((value) => ({ label: value, value }))} />
                <Input value={condition.value} onChange={(event) => updateCondition(index, { value: event.target.value })} placeholder="Value" />
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Actions</h3>
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setDraft((current) => ({ ...current, actions: [...current.actions, { type: "flagForReview", value: "" }] }))}>Add</Button>
            </div>
            {draft.actions.map((action, index) => (
              <div key={index} className="grid gap-2 rounded-md border border-gray-100 p-3">
                <Select value={action.type} onValueChange={(value) => updateAction(index, { type: value })} options={actionTypes.map((value) => ({ label: value, value }))} />
                <Input value={action.value} onChange={(event) => updateAction(index, { value: event.target.value })} placeholder="Value" />
              </div>
            ))}
          </section>

          <Button loading={saveRule.isPending} onClick={() => saveRule.mutate()}>Save rule</Button>
        </aside>
      </div>
    </PageShell>
  );
}
