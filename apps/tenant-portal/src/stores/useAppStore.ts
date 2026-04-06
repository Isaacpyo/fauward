import { create } from "zustand";

import type { NotificationItem, TenantConfig, ToastItem, User } from "@/types/domain";

type AppStoreState = {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  tenant: TenantConfig | null;
  user: User | null;
  notifications: NotificationItem[];
  commandPaletteOpen: boolean;
  toasts: ToastItem[];
  dashboardChecklistDismissed: boolean;
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void;
  setMobileSidebarOpen: (mobileSidebarOpen: boolean) => void;
  setTenant: (tenant: TenantConfig | null) => void;
  setUser: (user: User | null) => void;
  setNotifications: (notifications: NotificationItem[]) => void;
  markNotificationRead: (id: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
  setDashboardChecklistDismissed: (dismissed: boolean) => void;
};

export const useAppStore = create<AppStoreState>((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  tenant: null,
  user: null,
  notifications: [],
  commandPaletteOpen: false,
  toasts: [],
  dashboardChecklistDismissed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
  setTenant: (tenant) => set({ tenant }),
  setUser: (user) => set({ user }),
  setNotifications: (notifications) => set({ notifications }),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.id === id ? { ...item, read: true } : item
      )
    })),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  addToast: (toast) =>
    set((state) => ({
      toasts: [{ id: crypto.randomUUID(), ...toast }, ...state.toasts].slice(0, 4)
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setDashboardChecklistDismissed: (dashboardChecklistDismissed) =>
    set({ dashboardChecklistDismissed })
}));
