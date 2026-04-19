type BrandLogoProps = {
  compact?: boolean;
};

export const BrandLogo = ({ compact = false }: BrandLogoProps) => (
  <div className={`flex items-center ${compact ? "gap-3" : "gap-4"}`}>
    <img
      src="/icons/brand-mark.svg"
      alt="Fauward Go logo"
      className={compact ? "h-10 w-10" : "h-14 w-14"}
    />
    <div>
      <p className={`font-display leading-none text-ink ${compact ? "text-xl" : "text-[2rem]"}`}>FAUWARD GO</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-signal-info">Mobile execution</p>
    </div>
  </div>
);
