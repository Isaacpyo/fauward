import { Outlet } from "react-router-dom";

import { AgentNav } from "@/components/agent/AgentNav";

export function AgentLayout() {
  return (
    <div className="min-h-screen bg-[var(--surface-bg)]">
      <AgentNav />
      <main className="mx-auto w-full max-w-4xl px-4 pb-10">
        <Outlet />
      </main>
    </div>
  );
}