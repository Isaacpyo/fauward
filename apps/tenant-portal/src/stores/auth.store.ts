import { create } from 'zustand';

type User = { id: string; email: string; role: string } | null;
type Tenant = { id: string; name: string; slug: string; plan: string; defaultCurrency?: string } | null;

type AuthState = {
  user: User;
  tenant: Tenant;
  setUser: (user: User) => void;
  setTenant: (tenant: Tenant) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  setUser: (user) => set({ user }),
  setTenant: (tenant) => set({ tenant }),
  logout: () => set({ user: null, tenant: null })
}));