import type { ReactNode } from "react";

import { findServiceForPath } from "@/pillars/_manifests";
import { PreviewBanner } from "./PreviewBanner";

/** Wraps every console route: pages of preview services get the PreviewBanner (D1). ComingSoonPage explains itself. */
export function ServiceChrome({ path, children, comingSoon = false }: { path: string; children: ReactNode; comingSoon?: boolean }) {
  const service = findServiceForPath(path);
  if (!service || service.status !== "preview" || comingSoon) return <>{children}</>;
  return (
    <>
      <PreviewBanner service={service} />
      {children}
    </>
  );
}
