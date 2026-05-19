import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

type RemoveDomainDialogProps = {
  open: boolean;
  domain: string;
  isRemoving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function RemoveDomainDialog({ open, domain, isRemoving, onOpenChange, onConfirm }: RemoveDomainDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const normalizedConfirmation = confirmation.trim().toLowerCase();
  const canRemove = normalizedConfirmation === domain.toLowerCase();

  useEffect(() => {
    if (!open) setConfirmation("");
  }, [open]);

  function confirmRemove() {
    if (!canRemove || isRemoving) return;
    onConfirm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remove custom domain"
      description={`Remove ${domain} from this tenant and release it from Vercel.`}
    >
      <div className="space-y-3">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Traffic for this tenant will stop using this custom domain after removal. The domain can be added again later
          after DNS and Vercel verification.
        </div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="remove-domain-confirmation">
          Type <span className="font-semibold text-gray-950">{domain}</span> to confirm
        </label>
        <input
          id="remove-domain-confirmation"
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={isRemoving}
          className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] focus:ring-2 focus:ring-[var(--tenant-primary-light)]"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isRemoving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={confirmRemove}
          disabled={isRemoving || !canRemove}
          leftIcon={<Trash2 size={16} />}
        >
          {isRemoving ? "Removing..." : "Remove domain"}
        </Button>
      </div>
    </Dialog>
  );
}
