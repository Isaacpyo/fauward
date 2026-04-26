type BrandLogoProps = {
  compact?: boolean;
};

export const BrandLogo = ({ compact = false }: BrandLogoProps) => (
  compact ? (
    <div className="flex items-center gap-3">
      <img
        src="/icons/brand-mark.png"
        alt="Fauward Go icon"
        className="h-10 w-10 object-contain"
      />
      <div>
        <p className="font-display text-xl leading-none text-ink">FAUWARD GO</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-signal-info">Mobile execution</p>
      </div>
    </div>
  ) : (
    <div>
      <img
        src="/icons/brand-lockup.png"
        alt="Fauward Go logo"
        className="h-auto w-[220px] max-w-full object-contain"
      />
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-signal-info">Mobile execution</p>
    </div>
  )
);
