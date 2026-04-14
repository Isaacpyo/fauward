import { Package } from 'lucide-react';

export function DashboardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center space-y-6 p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-navy/5">
          <Package className="w-8 h-8 text-brand-navy" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-brand-navy tracking-tight">
            Fauward Admin
          </h1>
          <p className="text-slate-500 max-w-sm">
            Administration panel is being set up. Check back soon.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          System online
        </div>
      </div>
    </div>
  );
}
