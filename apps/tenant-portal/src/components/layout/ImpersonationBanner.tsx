import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../lib/api';

export function ImpersonationBanner() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const logout = useAuthStore((s) => s.logout);

  const isImpersonating = user?.role === 'SUPER_ADMIN';
  if (!isImpersonating) return null;

  const exitImpersonation = async () => {
    await api.post('/superadmin/impersonate/exit');
    logout();
    window.location.href = 'https://admin.fauward.com/tenants';
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[2000] flex items-center justify-between bg-[var(--fauward-amber)] px-4 py-2 text-sm font-medium text-white">
      <div className="flex items-center gap-2">
        <span>Impersonating <strong>{tenant?.name}</strong> ({tenant?.slug})</span>
      </div>
      <button onClick={exitImpersonation}
        className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors">
        Exit impersonation
      </button>
    </div>
  );
}
