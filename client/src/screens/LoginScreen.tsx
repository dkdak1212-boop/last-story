import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function LoginScreen() {
  const nav = useNavigate();
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password);
      nav('/characters');
    } catch (err) {
      setError(err instanceof Error ? err.message : '실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          width: 380,
          padding: 32,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
        }}
      >
        <h1 style={{ textAlign: 'center', color: 'var(--accent)', marginBottom: 6 }}>
          마지막이야기
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', marginBottom: 24, fontSize: 13 }}>
          The Last Story
        </p>

        <form onSubmit={submit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              placeholder="아이디"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
            {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '...' : mode === 'login' ? '로그인' : '회원가입'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13 }}
          >
            {mode === 'login' ? '계정이 없으신가요? 가입하기' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
