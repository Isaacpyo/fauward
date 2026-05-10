import { cn } from './cn.js';

type ImpersonationBannerProps = {
  tenantName: string;
  actorName?: string;
  onExit: () => void;
  className?: string;
};

export function ImpersonationBanner({ tenantName, actorName, onExit, className }: ImpersonationBannerProps) {
  return (
    <div className={cn('fixed inset-x-0 top-0 z-50 flex items-center justify-between bg-[var(--fauward-amber)] px-3 py-2 text-xs font-semibold text-white shadow-sm', className)}>
      <span className="truncate">IMPERSONATION MODE - Viewing as {tenantName}{actorName ? ` - ${actorName}` : ''}</span>
      <button type="button" onClick={onExit} className="ml-3 shrink-0 rounded border border-white/30 px-2 py-1 hover:bg-white/10">
        Exit
      </button>
    </div>
  );
}
