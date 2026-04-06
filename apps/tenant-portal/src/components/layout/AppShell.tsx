import { ReactNode } from 'react';
import { ImpersonationBanner } from './ImpersonationBanner';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <ImpersonationBanner />
      <div className="pt-0">{children}</div>
    </div>
  );
}