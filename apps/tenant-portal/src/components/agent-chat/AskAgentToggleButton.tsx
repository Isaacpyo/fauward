import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

import { AskAgentPanel } from "./AskAgentPanel";

// Self-contained: a single render of this component owns both the trigger and the
// panel state. Drop it into any page's PageShell `actions` slot and it works. The
// panel itself is decoupled from the host page, so this can be promoted to a global
// rail later without a rewrite.
export function AskAgentToggleButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<Sparkles className="h-4 w-4 text-tenant-primary" />}
        onClick={() => setOpen(true)}
      >
        Ask the agent
      </Button>
      <AskAgentPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
