import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentNote } from "@/types/shipment";

type NotesPanelProps = {
  notes: ShipmentNote[];
  onNotesChange: (notes: ShipmentNote[]) => void;
  canWrite: boolean;
};

export function NotesPanel({ notes, onNotesChange, canWrite }: NotesPanelProps) {
  const [text, setText] = useState("");
  const tenant = useTenantStore((state) => state.tenant);

  const submit = () => {
    if (!text.trim()) {
      return;
    }
    onNotesChange([
      {
        id: crypto.randomUUID(),
        author_name: "You",
        text: text.trim(),
        created_at: new Date().toISOString()
      },
      ...notes
    ]);
    setText("");
  };

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <label className="mb-2 block text-sm font-medium text-gray-700">Add note</label>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Internal update..."
          />
          <Button className="mt-3" onClick={submit} disabled={!text.trim()}>
            Add note
          </Button>
        </div>
      ) : null}

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
    </div>
  );
}
