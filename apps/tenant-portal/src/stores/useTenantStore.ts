import { create } from "zustand";

import type { TenantConfig } from "@/types/domain";

type TenantStoreState = {
  tenant: TenantConfig | null;
  setTenant: (tenant: TenantConfig | null) => void;
};

export const useTenantStore = create<TenantStoreState>((set) => ({
  tenant: null,
  setTenant: (tenant) => set({ tenant })
}));
