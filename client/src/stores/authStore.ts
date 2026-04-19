import { create } from 'zustand';
import { api } from '../api/client';
import { useCharacterStore } from './characterStore';
import { useMeStore } from './meStore';

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string) => Promise<void>;
  logout: () => void;
  loginWithToken: (token: string) => void;
}

// 계정 전환 시 이전 계정 상태 유출 방지 — 모든 계정-종속 스토어 초기화
function resetAccountScopedStores() {
  try { useCharacterStore.getState().clear(); } catch { /* ignore */ }
  try { useMeStore.getState().clear(); } catch { /* ignore */ }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  username: localStorage.getItem('username'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (username, password) => {
    const { token } = await api<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    resetAccountScopedStores();
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    set({ token, username, isAuthenticated: true });
  },

  register: async (username, password, email) => {
    const { token } = await api<{ token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email }),
    });
    resetAccountScopedStores();
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    set({ token, username, isAuthenticated: true });
  },

  logout: () => {
    resetAccountScopedStores();
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    set({ token: null, username: null, isAuthenticated: false });
  },

  loginWithToken: (token: string) => {
    // OAuth 리다이렉트에서 받은 토큰으로 로그인
    resetAccountScopedStores();
    localStorage.setItem('token', token);
    // username 은 서버에서 JWT 에 포함되지만 클라는 JWT 디코드로 추출
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const username = payload.username || 'user';
      localStorage.setItem('username', username);
      set({ token, username, isAuthenticated: true });
    } catch {
      localStorage.setItem('username', 'user');
      set({ token, username: 'user', isAuthenticated: true });
    }
  },
}));
