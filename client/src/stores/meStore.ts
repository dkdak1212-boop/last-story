import { create } from 'zustand';
import { api } from '../api/client';

interface Me {
  id: number;
  username: string;
  isAdmin: boolean;
  premiumUntil: string | null;
  maxCharacterSlots: number;
}

interface MeState {
  me: Me | null;
  loaded: boolean;
  fetch: () => Promise<void>;
  clear: () => void;
}

export const useMeStore = create<MeState>((set) => ({
  me: null,
  loaded: false,
  fetch: async () => {
    try {
      const m = await api<Me>('/me');
      set({ me: m, loaded: true });
    } catch {
      set({ me: null, loaded: true });
    }
  },
  clear: () => set({ me: null, loaded: false }),
}));
