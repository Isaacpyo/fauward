import { Copy, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

import { WEBHOOK_EVENTS } from "./types";
import type { WebhookEndpoint, WebhookEventType } from "./types";

type AddEditEndpointModalProps = {
  open: boolean;
  endpoint?: WebhookEndpoint;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: { id?: string; url: string; events: WebhookEventType[]; secret: string; active: boolean }) => Promise<void>;
  saving?: boolean;
};

function createSecret() {
  const seed = crypto.randomUUID().replace(/-/g, "");
  return `whsec_${seed}`;
}

export function AddEditEndpointModal({ open, endpoint, onOpenChange, onSave, saving }: AddEditEndpointModalProps) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventType[]>([]);
  const [secret, setSecret] = useState("");
  const [urlError, setUrlError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setUrl(endpoint?.url ?? "");
    setEvents(endpoint?.events ?? []);
    setSecret(endpoint?.secret ?? createSecret());
    setUrlError("");
    setCopied(false);
  }, [open, endpoint]);

  const validUrl = useMemo(() => url.trim().startsWith("https://"), [url]);
  const canSave = validUrl && events.length > 0;

  function toggleEvent(value: WebhookEventType) {
    setEvents((previous) => (previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value]));
  }

  async function handleSave() {
    if (!validUrl) {
      setUrlError("URL must start with https://");
      return;
    }

    await onSave({
      id: endpoint?.id,
      url: url.trim(),
      events,
      secret,
      active: endpoint?.active ?? true
    });
    onOpenChange(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={endpoint ? "Edit Endpoint" : "Add Endpoint"}
      description="Configure webhook URL, subscribed events, and signing secret."
    >
      <div className="space-y-4">
        <Input
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (event.target.value.startsWith("https://")) {
              setUrlError("");
            }
          }}
          placeholder="https://example.com/webhooks/fauward"
          error={urlError || undefined}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-gray-800">Events</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((eventType) => (
              <label key={eventType} className="flex min-h-[44px] items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={events.includes(eventType)}
                  onChange={() => toggleEvent(eventType)}
                />
                <span className="font-mono text-xs">{eventType}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-800">Secret</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs">{secret}</code>
            <Button variant="secondary" size="sm" onClick={handleCopy} leftIcon={<Copy size={14} />}>
              {copied ? "Copied!" : "Copy"}
            </Button>
            {!endpoint ? (
              <Button variant="secondary" size="sm" onClick={() => setSecret(createSecret())} leftIcon={<RefreshCw size={14} />}>
                Regenerate
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSave}>
            Save Endpoint
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

