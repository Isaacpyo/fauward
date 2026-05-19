import { Trash2 } from "lucide-react";

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
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remove custom domain"
      description={`Remove ${domain} from this tenant and release it from Vercel.`}
    >
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isRemoving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={onConfirm}
          disabled={isRemoving}
          leftIcon={<Trash2 size={16} />}
        >
          {isRemoving ? "Removing..." : "Confirm"}
        </Button>
      </div>
    </Dialog>
  );
}
