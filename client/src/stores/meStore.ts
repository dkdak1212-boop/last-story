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
    } catch (e) {
      // JWT 가 만료/무효 (삭제된 유저 등) → localStorage 정리 후 로그인 화면으로 복귀
      const msg = e instanceof Error ? e.message : '';
      const isAuthError = msg.includes('401') || msg.includes('not found') || msg.includes('404');
      if (isAuthError) {
        try {
          localStorage.removeItem('token');
          localStorage.removeItem('username');
        } catch { /* ignore */ }
        // 전체 새로고침으로 인증 상태 초기화
        if (typeof window !== 'undefined') window.location.reload();
      }
      set({ me: null, loaded: true });
    }
  },
  clear: () => set({ me: null, loaded: false }),
}));
