import type { ReactNode } from "react";

import { PageShell } from "@/layouts/PageShell";

type PricingSectionPageProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function PricingSectionPage({ title, description, children }: PricingSectionPageProps) {
  return (
    <PageShell title={title} description={description}>
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        {children ?? <p className="text-sm text-gray-600">Configuration panel for this pricing section.</p>}
      </div>
    </PageShell>
  );
}

