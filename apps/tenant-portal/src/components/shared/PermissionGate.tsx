import type { ReactNode } from "react";

import { usePermission } from "@/hooks/usePermission";
import type { TenantRole } from "@/types/domain";
import { ErrorState } from "@/components/shared/ErrorState";

type PermissionGateProps = {
  allow: TenantRole[];
  children: ReactNode;
};

export function PermissionGate({ allow, children }: PermissionGateProps) {
  const allowed = usePermission(allow);

  if (!allowed) {
    return (
      <ErrorState
        title="Permission denied"
        description="You don't have access to this section. Contact your tenant administrator."
      />
    );
  }

  return <>{children}</>;
}
