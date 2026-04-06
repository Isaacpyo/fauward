import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { api } from "@/lib/api";

type EmailTemplate = {
  key: string;
  isEnabled: boolean;
  customSubject?: string | null;
};

async function fetchTemplates() {
  const response = await api.get<{ templates: EmailTemplate[] }>("/v1/tenant/email-templates");
  return response.data.templates;
}

export function EmailSettingsTab() {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ["email-templates"],
    queryFn: fetchTemplates
  });

  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [opsRecipients, setOpsRecipients] = useState("");
  const [customSubjectDrafts, setCustomSubjectDrafts] = useState<Record<string, string>>({});

  const updateSettings = useMutation({
    mutationFn: async () => {
      await api.patch("/v1/tenant/email-settings", {
        fromName,
        replyTo,
        opsRecipients
      });
    }
  });

  const updateTemplate = useMutation({
    mutationFn: async (input: { key: string; isEnabled?: boolean; customSubject?: string }) => {
      await api.patch(`/v1/tenant/email-templates/${input.key}`, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    }
  });

  const sendTest = useMutation({
    mutationFn: async (key: string) => {
      await api.post(`/v1/tenant/email-templates/${key}/test`);
    }
  });

  const templates = templatesQuery.data ?? [];
  const templatesWithLabel = useMemo(
    () =>
      templates.map((template) => ({
        ...template,
        label: template.key
          .split("_")
          .map((part) => part[0].toUpperCase() + part.slice(1))
          .join(" ")
      })),
    [templates]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Global sender settings</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Input value={fromName} onChange={(event) => setFromName(event.target.value)} placeholder="From name" />
          <Input value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="Reply-To email" />
          <Input
            value={opsRecipients}
            onChange={(event) => setOpsRecipients(event.target.value)}
            placeholder="Ops recipients (comma separated)"
          />
        </div>
        <Button className="mt-3" onClick={() => updateSettings.mutate()}>
          Save email settings
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Template controls</h3>
        <Table columns={["Template", "Enabled", "Custom subject", "Actions"]}>
          {templatesWithLabel.map((template) => (
            <TableRow key={template.key}>
              <TableCell>{template.label}</TableCell>
              <TableCell>
                <Switch
                  checked={template.isEnabled}
                  onCheckedChange={(checked) =>
                    updateTemplate.mutate({ key: template.key, isEnabled: checked })
                  }
                />
              </TableCell>
              <TableCell>
                <Input
                  value={customSubjectDrafts[template.key] ?? template.customSubject ?? ""}
                  onChange={(event) =>
                    setCustomSubjectDrafts((prev) => ({ ...prev, [template.key]: event.target.value }))
                  }
                  placeholder="Optional custom subject"
                />
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      updateTemplate.mutate({
                        key: template.key,
                        customSubject: customSubjectDrafts[template.key] ?? ""
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => sendTest.mutate(template.key)}>
                    Send test
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </div>
    </div>
  );
}

