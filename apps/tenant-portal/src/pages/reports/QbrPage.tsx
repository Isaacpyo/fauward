import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useParams } from "react-router-dom";

import { api } from "@/lib/api";

// Quarterly business review from Fauward (customer.qbr, WP-4.9): shown once Fauward shares it; workspace admins only.

type Section = { key: string; title: string; empty: boolean; emptyText: string | null; items: Array<{ label: string; value: string }>; notes: string[] };
type SharedDeck = { id: string; period: string | null; periodStart: string; periodEnd: string; notes: string | null; sharedAt: string | null; sections: Section[] };

export function QbrPage() {
  const { id = "" } = useParams();
  const deck = useQuery({ queryKey: ["tenant", "me", "qbr", id], queryFn: async () => (await api.get<SharedDeck>(`/v1/tenants/me/qbr/${encodeURIComponent(id)}`)).data, enabled: Boolean(id) });

  if (deck.isLoading) return <p className="p-6 text-sm text-gray-500">Loading your review…</p>;
  if (deck.isError) {
    const status = isAxiosError(deck.error) ? deck.error.response?.status : undefined;
    return (
      <p role="alert" className="p-6 text-sm text-red-700">
        {status === 403 ? "Only workspace admins can see the quarterly review." : status === 404 ? "This review is not available." : "The review could not be loaded."}
      </p>
    );
  }
  const data = deck.data;
  if (!data) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Quarterly business review {data.period}</h1>
        <p className="text-sm text-gray-600">
          {new Date(data.periodStart).toLocaleDateString()} – {new Date(new Date(data.periodEnd).getTime() - 1).toLocaleDateString()} · prepared by Fauward
        </p>
      </header>
      {data.notes ? <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{data.notes}</p> : null}
      {data.sections.map((section) => (
        <section key={section.key} className="rounded-lg border border-gray-200 bg-white p-4" data-testid="qbr-section">
          <h2 className="mb-2 text-base font-semibold text-gray-900">{section.title}</h2>
          {section.empty ? <p className="text-sm italic text-gray-500">{section.emptyText}</p> : null}
          {section.items.length > 0 ? (
            <dl className="divide-y divide-gray-100 text-sm">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-gray-600">{item.label}</dt>
                  <dd className="text-right font-medium text-gray-900">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {section.notes.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-gray-800">
              {section.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
