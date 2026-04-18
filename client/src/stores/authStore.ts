import { create } from 'zustand';
import { api } from '../api/client';

interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string) => Promise<void>;
  logout: () => void;
  loginWithToken: (token: string) => void;
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
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    set({ token, username, isAuthenticated: true });
  },

  register: async (username, password, email) => {
    const { token } = await api<{ token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email }),
    });
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    set({ token, username, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    set({ token: null, username: null, isAuthenticated: false });
  },

  loginWithToken: (token: string) => {
    // OAuth 리다이렉트에서 받은 토큰으로 로그인
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
