import { Avatar } from "@/components/ui/Avatar";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentNote } from "@/types/shipment";

type NotesPanelProps = {
  notes: ShipmentNote[];
};

/** Notes recorded on the shipment (booking notes and status-update notes). Notes are added through status updates. */
export function NotesPanel({ notes }: NotesPanelProps) {
  const tenant = useTenantStore((state) => state.tenant);

  if (notes.length === 0) {
    return <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">No notes yet. Add one with the next status update.</p>;
  }

  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-start gap-3">
            <Avatar src={note.author_avatar} fallback={note.author_name} className="h-9 w-9" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{note.author_name}</p>
              <p className="text-xs text-gray-500">{formatDateTime(note.created_at, tenant)}</p>
              <p className="mt-2 text-sm text-gray-700">{note.text}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
