import { create } from "zustand";

type GlobalLoadingState = {
  loading: boolean;
  show: () => void;
  hide: () => void;
};

export const useGlobalLoading = create<GlobalLoadingState>((set) => ({
  loading: false,
  show: () => set({ loading: true }),
  hide: () => set({ loading: false }),
}));
