import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type ChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
};

const defaultItems: ChecklistItem[] = [
  { id: "branding", title: "Set tenant branding", completed: true },
  { id: "team", title: "Invite your team", completed: false },
  { id: "domain", title: "Configure custom domain", completed: false },
  { id: "webhook", title: "Add webhook endpoint", completed: false }
];

export function OnboardingChecklist() {
  const [expanded, setExpanded] = useState(true);
  const completed = defaultItems.filter((item) => item.completed).length;

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900">Onboarding checklist</h3>
          <Badge variant="primary">
            {completed}/{defaultItems.length}
          </Badge>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-gray-200 px-4 py-4">
          {defaultItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-700">{item.title}</span>
              <Badge variant={item.completed ? "success" : "neutral"}>{item.completed ? "Done" : "Pending"}</Badge>
            </div>
          ))}
          <Button variant="secondary" size="sm">
            Continue setup
          </Button>
        </div>
      ) : null}
    </section>
  );
}
