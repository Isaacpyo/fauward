import { Camera, FileText, Bell, Link2, CheckCircle2, BookOpen, ChevronRight } from 'lucide-react';

const STEPS = [
  { icon: Camera,      label: 'POD Confirmed',       actor: 'Driver',    color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-100'  },
  { icon: FileText,    label: 'Invoice Generated',   actor: 'System',    color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
  { icon: Bell,        label: 'Customer Notified',   actor: 'System',    color: 'text-purple-600',bg: 'bg-purple-50 border-purple-100' },
  { icon: Link2,       label: 'Payment Link Sent',   actor: 'System',    color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-100'  },
  { icon: CheckCircle2,label: 'Payment Received',    actor: 'Customer',  color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
  { icon: BookOpen,    label: 'Ledger Updated',      actor: 'System',    color: 'text-gray-600',  bg: 'bg-gray-50 border-gray-100'  },
];

export default function FinanceWorkflowPanel() {
  return (
    <section className="bg-white py-20 border-t border-gray-100">
      <div className="marketing-container">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">

          {/* Copy */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-amber">
              Finance & Invoicing
            </p>
            <h2 className="text-3xl font-bold text-gray-900 md:text-4xl leading-tight">
              Turn every delivery into
              <br />a paid invoice automatically.
            </h2>
            <p className="mt-5 text-base text-gray-500 leading-relaxed">
              When a driver captures proof of delivery, Fauward generates the invoice, notifies the customer, and sends a payment link — without anyone on your finance team lifting a finger.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-4">
              {[
                { label: 'COD support', desc: 'Cash on delivery workflows built in' },
                { label: 'Multi-currency', desc: 'GBP, USD, NGN, AED and more' },
                { label: 'Overdue reminders', desc: 'Automated follow-up on unpaid invoices' },
                { label: 'VAT-ready', desc: 'Line-item detail and tax configuration' },
              ].map(({ label, desc }) => (
                <div key={label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs font-semibold text-gray-800 mb-0.5">{label}</div>
                  <div className="text-xs text-gray-400 leading-snug">{desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow visual */}
          <div className="space-y-3">
            {STEPS.map(({ icon: Icon, label, actor, color, bg }, i) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${bg}`}>
                  <Icon size={15} className={color} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-800">{label}</div>
                  <div className="text-xs text-gray-400">{actor}</div>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                )}
              </div>
            ))}

            {/* Invoice card */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Invoice</div>
                  <div className="font-mono text-sm font-semibold text-gray-800">INV-2024-0847</div>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs font-bold text-green-700">
                  PAID
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div className="text-xs text-gray-500">Auto-generated · 3 Nov 2024</div>
                <div className="text-lg font-bold text-gray-900">£340.00</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
