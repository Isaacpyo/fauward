import { useState } from "react";

import type { InviteMember, OnboardingState } from "@/components/onboarding/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type StepInviteTeamProps = {
  state: OnboardingState;
  onChange: (state: OnboardingState) => void;
  onSkip: () => void;
};

export function StepInviteTeam({ state, onChange, onSkip }: StepInviteTeamProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteMember["role"]>("Manager");

  const add = () => {
    if (!email.trim()) {
      return;
    }
    onChange({
      ...state,
      invitedMembers: [
        ...state.invitedMembers,
        {
          id: crypto.randomUUID(),
          email: email.trim(),
          role
        }
      ]
    });
    setEmail("");
  };

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Invite your team</h2>
      <p className="text-sm text-gray-600">Add managers, finance, and staff users now or skip.</p>

      <div className="grid gap-3 sm:grid-cols-[1fr,160px,100px]">
        <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
        <Select
          value={role}
          onValueChange={(value) => setRole(value as InviteMember["role"])}
          options={[
            { label: "Manager", value: "Manager" },
            { label: "Finance", value: "Finance" },
            { label: "Staff", value: "Staff" }
          ]}
        />
        <Button onClick={add}>Add</Button>
      </div>

      {state.invitedMembers.length > 0 ? (
        <ul className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          {state.invitedMembers.map((member) => (
            <li key={member.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm">
              <span className="text-gray-800">{member.email}</span>
              <span className="text-gray-500">{member.role}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <button type="button" className="text-sm text-gray-600 underline" onClick={onSkip}>
        Skip for now
      </button>
    </section>
  );
}
