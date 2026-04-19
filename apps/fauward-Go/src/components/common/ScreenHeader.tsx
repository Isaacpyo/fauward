import type { ReactNode } from "react";

type ScreenHeaderProps = {
  title: string;
  subtitle: string;
  kicker?: string;
  action?: ReactNode;
};

export const ScreenHeader = ({
  title,
  subtitle,
  kicker = "Field operations",
  action,
}: ScreenHeaderProps) => (
  <header className="mb-6 flex items-start justify-between gap-4">
    <div>
      <p className="eyebrow">{kicker}</p>
      <h1 className="screen-title">{title}</h1>
      <p className="subtle-text mt-2 max-w-[30rem]">{subtitle}</p>
    </div>
    {action}
  </header>
);

