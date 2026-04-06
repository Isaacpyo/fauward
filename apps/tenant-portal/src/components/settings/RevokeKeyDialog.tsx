import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

type RevokeKeyDialogProps = {
  open: boolean;
  keyName?: string;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function RevokeKeyDialog({ open, keyName, loading, onOpenChange, onConfirm }: RevokeKeyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Revoke API key">
      <p className="text-sm text-gray-700">
        Are you sure you want to revoke <span className="font-semibold">{keyName ?? "this key"}</span>? This action cannot be undone. Any integrations using this key will stop working immediately.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm} loading={loading}>
          Revoke
        </Button>
      </div>
    </Dialog>
  );
}

