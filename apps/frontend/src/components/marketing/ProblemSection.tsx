import { MessageSquare, HelpCircle, Clock, AlertOctagon, LayoutDashboard, WifiOff, BarChart2 } from 'lucide-react';

const PAINS = [
  {
    icon: MessageSquare,
    color: 'text-red-600',
    bg:   'bg-red-50 border-red-200',
    title: 'Dispatchers chasing drivers on WhatsApp',
    desc:  'No assignment system means every update is a phone call or message thread.',
  },
  {
    icon: HelpCircle,
    color: 'text-orange-600',
    bg:   'bg-orange-50 border-orange-200',
    title: '"Where is my shipment?" all day',
    desc:  'Customers call in because there is no tracking link. Every call is wasted time.',
  },
  {
    icon: Clock,
    color: 'text-amber-600',
    bg:   'bg-amber-50 border-amber-200',
    title: 'Invoices created days after delivery',
    desc:  'Finance teams wait for drivers to confirm, then build invoices in spreadsheets.',
  },
  {
    icon: AlertOctagon,
    color: 'text-red-600',
    bg:   'bg-red-50 border-red-200',
    title: 'Failed deliveries not escalated',
    desc:  'Drivers mark a job as failed and nothing happens automatically. Issues pile up.',
  },
  {
    icon: LayoutDashboard,
    color: 'text-orange-600',
    bg:   'bg-orange-50 border-orange-200',
    title: 'No single view of shipment status',
    desc:  'Data lives across email, WhatsApp, spreadsheets, and carrier portals simultaneously.',
  },
  {
    icon: WifiOff,
    color: 'text-amber-600',
    bg:   'bg-amber-50 border-amber-200',
    title: 'Drivers losing signal in the field',
    desc:  'Last-mile in warehouses and rural areas means updates stop. Customers go silent.',
  },
  {
    icon: BarChart2,
    color: 'text-red-600',
    bg:   'bg-red-50 border-red-200',
    title: 'Managers guessing instead of seeing live ops',
    desc:  'End-of-day reports are too late to act on. Decisions are made on yesterday\'s numbers.',
  },
];

export default function ProblemSection() {
  return (
    <section className="bg-slate-50 py-20">
      <div className="absolute inset-x-0 h-px bg-gray-200" aria-hidden />
      <div className="marketing-container">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
            The real cost of disconnected tools
          </p>
          <h2 className="text-3xl font-bold text-gray-900 md:text-4xl">
            Most logistics teams are still stuck here
          </h2>
          <p className="mt-4 text-base text-gray-600 leading-relaxed">
            Switching between spreadsheets, WhatsApp, phone calls, emails, payment links, and manual status updates — every day.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PAINS.map(({ icon: Icon, color, bg, title, desc }) => (
            <div
              key={title}
              className={`rounded-xl border p-5 transition-transform hover:-translate-y-0.5 ${bg}`}
            >
              <Icon size={20} className={`mb-3 ${color}`} />
              <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-1.5">{title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
            </div>
          ))}

          {/* Resolution card */}
          <div className="rounded-xl border border-amber-300 bg-amber-100/70 p-5 flex flex-col justify-center items-center text-center">
            <div className="text-2xl font-bold text-amber-700 mb-1">One platform.</div>
            <div className="text-2xl font-bold text-gray-900 mb-3">Every operation.</div>
            <p className="text-xs text-amber-800/80 leading-relaxed">
              Fauward replaces all of it — from booking to proof of delivery to paid invoice.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
