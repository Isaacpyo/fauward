import { useMemo } from "react";

import { useAppStore } from "@/stores/useAppStore";
import type { TenantRole } from "@/types/domain";

export function usePermission(allowedRoles: TenantRole[]) {
  const user = useAppStore((state) => state.user);

  return useMemo(() => {
    if (!user) {
      return false;
    }
    return allowedRoles.includes(user.role);
  }, [allowedRoles, user]);
}
