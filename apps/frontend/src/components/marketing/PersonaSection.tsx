import { PERSONA_CARDS } from "@/lib/marketing-data";

export default function PersonaSection() {
  return (
    <section className="bg-gray-50 py-16 lg:py-24">
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">Built for operators who are done improvising</h2>
          <p className="mt-4 text-lg text-gray-600">
            If you&apos;re running logistics on spreadsheets, WhatsApp groups, or a patchwork of tools, Fauward is for you.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PERSONA_CARDS.map((persona) => (
            <div
              key={persona.role}
              className="group relative rounded-2xl border border-gray-200 bg-white p-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:border-l-4 hover:border-l-amber-600"
            >
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700">{persona.role}</p>
              <p className="mt-2 text-sm italic text-gray-500">&ldquo;{persona.context}&rdquo;</p>

              <div className="mt-6">
                <div className="mb-4 flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                    <svg className="h-3 w-3 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </span>
                  <p className="text-sm leading-relaxed text-gray-700">
                    <span className="font-semibold text-gray-900">Pain: </span>
                    {persona.pain}
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100">
                    <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </span>
                  <p className="text-sm leading-relaxed text-gray-700">
                    <span className="font-semibold text-gray-900">With Fauward: </span>
                    {persona.gain}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
