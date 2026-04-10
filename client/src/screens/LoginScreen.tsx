import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { TermsModal } from '../components/ui/TermsModal';
import { api } from '../api/client';

export function LoginScreen() {
  const nav = useNavigate();
  const { login, register } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo('');
    if (mode === 'register' && !agreed) {
      setError('서비스 이용약관에 동의해 주세요');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(username, password);
        nav('/characters');
      } else if (mode === 'register') {
        await register(username, password, email);
        nav('/characters');
      } else if (mode === 'forgot') {
        const r = await api<{ ok: boolean; message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ username, email }),
        });
        setInfo(r.message || '임시 비밀번호가 이메일로 발송되었습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '실패');
    } finally {
      setBusy(false);
    }
  }

  function changeMode(newMode: 'login' | 'register' | 'forgot') {
    setMode(newMode); setError(''); setInfo('');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 배경 장식: 흐릿한 픽셀 몬스터들 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        display: 'flex', flexWrap: 'wrap', gap: 40, padding: 30,
        opacity: 0.04, justifyContent: 'center', alignItems: 'center',
      }}>
        {['dragon', 'phoenix', 'lich', 'titan', 'hydra', 'griffon', 'knight', 'demon', 'wyvern', 'shadow', 'boss_dark', 'frost_giant'].map((m, i) => (
          <img key={i} src={`/images/monsters/${m}.png`} alt="" width={96} height={96}
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ))}
      </div>

      {/* 비네트 그라데이션 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 30%, var(--bg) 90%)',
      }} />

      <div
        className="login-box"
        style={{
          position: 'relative',
          width: '100%', maxWidth: 400,
          padding: '36px 36px 28px',
          background: 'linear-gradient(180deg, rgba(20,20,28,0.95) 0%, rgba(15,15,20,0.98) 100%)',
          border: '1px solid rgba(201,162,77,0.4)',
          borderRadius: 8,
          boxShadow: '0 0 80px rgba(201,162,77,0.15), 0 0 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* 상단 장식 라인 */}
        <div style={{
          position: 'absolute', top: -1, left: 20, right: 20, height: 2,
          background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
          opacity: 0.6,
        }} />
        {/* 코너 장식 */}
        <CornerDeco top={8} left={8} />
        <CornerDeco top={8} right={8} flipH />
        <CornerDeco bottom={8} left={8} flipV />
        <CornerDeco bottom={8} right={8} flipH flipV />

        {/* 타이틀 */}
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            justifyContent: 'center', marginBottom: 6,
          }}>
            <div style={{ height: 1, width: 40, background: 'linear-gradient(90deg, transparent, var(--accent))' }} />
            <img src="/images/items/weapon/double_sword.png" alt="" width={28} height={28}
              style={{ imageRendering: 'pixelated' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div style={{ height: 1, width: 40, background: 'linear-gradient(-90deg, transparent, var(--accent))' }} />
          </div>
          <h1 style={{
            color: 'var(--accent)', marginBottom: 4, marginTop: 0,
            fontSize: 28, fontWeight: 900, letterSpacing: 2,
            textShadow: '0 2px 12px rgba(201,162,77,0.5), 0 0 30px rgba(201,162,77,0.2)',
            fontFamily: '"Nanum Myeongjo", "Georgia", serif',
          }}>
            마지막이야기
          </h1>
          <p style={{
            textAlign: 'center', color: 'var(--text-dim)', marginBottom: 24,
            fontSize: 11, letterSpacing: 4, textTransform: 'uppercase',
            fontFamily: '"Georgia", serif', fontStyle: 'italic',
          }}>
            · The Last Story ·
          </p>
        </div>

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
            {mode !== 'forgot' && (
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={4}
              />
            )}
            {(mode === 'register' || mode === 'forgot') && (
              <input
                type="email"
                placeholder={mode === 'register' ? '이메일 (비밀번호 찾기에 사용)' : '가입 시 등록한 이메일'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={100}
              />
            )}
            {mode === 'register' && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                color: 'var(--text-dim)', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  style={{ flexShrink: 0 }}
                />
                <span>
                  [필수]{' '}
                  <span
                    onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
                    style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    서비스 이용약관
                  </span>
                  에 동의합니다
                </span>
              </label>
            )}
            {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            {info && <div style={{ color: 'var(--success)', fontSize: 13 }}>{info}</div>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? '...' : mode === 'login' ? '로그인' : mode === 'register' ? '회원가입' : '임시 비밀번호 받기'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mode === 'login' && (
            <>
              <button
                onClick={() => changeMode('register')}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}
              >
                계정이 없으신가요? 가입하기
              </button>
              <button
                onClick={() => changeMode('forgot')}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}
              >
                비밀번호를 잊으셨나요?
              </button>
            </>
          )}
          {mode === 'register' && (
            <button
              onClick={() => changeMode('login')}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}
            >
              이미 계정이 있으신가요? 로그인
            </button>
          )}
          {mode === 'forgot' && (
            <button
              onClick={() => changeMode('login')}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}
            >
              ← 로그인으로 돌아가기
            </button>
          )}
        </div>

        <div style={{
          marginTop: 14, paddingTop: 12,
          borderTop: '1px solid rgba(201,162,77,0.15)',
          textAlign: 'center', fontSize: 11,
        }}>
          <button
            onClick={() => setShowTerms(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}
          >
            서비스 이용약관 보기
          </button>
        </div>
      </div>
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  );
}

// 코너 장식 SVG (L자형)
function CornerDeco({ top, left, right, bottom, flipH, flipV }: {
  top?: number; left?: number; right?: number; bottom?: number;
  flipH?: boolean; flipV?: boolean;
}) {
  return (
    <svg
      width={18} height={18}
      style={{
        position: 'absolute',
        top, left, right, bottom,
        transform: `scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
        pointerEvents: 'none',
      }}
    >
      <path
        d="M 0 0 L 18 0 M 0 0 L 0 18"
        stroke="var(--accent)"
        strokeWidth={2}
        fill="none"
        opacity={0.8}
      />
      <circle cx={0} cy={0} r={2} fill="var(--accent)" opacity={0.9} />
    </svg>
  );
}
