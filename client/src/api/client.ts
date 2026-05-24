const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 401(토큰 만료·무효) — 세션 정리 후 로그인 화면으로 안내.
    // 영어 'invalid token'/'unauthorized' 원문이 그대로 노출되며 멈추던 문제 대응.
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      if (!window.location.pathname.startsWith('/login')) {
        sessionStorage.setItem('session_expired', '1');
        window.location.href = '/login';
      }
      throw new Error('로그인이 만료되었어요. 다시 로그인해 주세요.');
    }
    throw new Error(text || `요청에 실패했어요 (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
