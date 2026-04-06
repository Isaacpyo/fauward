type ImpersonationBannerProps = {
  tenantName: string;
  onExit: () => void;
};

export function ImpersonationBanner({ tenantName, onExit }: ImpersonationBannerProps) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between bg-[var(--fauward-amber)] px-3 py-2 text-xs font-semibold text-white">
      <span>IMPERSONATION MODE - Viewing as {tenantName} - Exit</span>
      <button type="button" onClick={onExit} className="rounded border border-white/30 px-2 py-1">
        Exit
      </button>
    </div>
  );
}

