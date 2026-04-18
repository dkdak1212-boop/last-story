import { useState } from 'react';
import { TermsModal } from '../components/ui/TermsModal';

export function LoginScreen() {
  const [showTerms, setShowTerms] = useState(false);

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
            textAlign: 'center', color: 'var(--text-dim)', marginBottom: 28,
            fontSize: 11, letterSpacing: 4, textTransform: 'uppercase',
            fontFamily: '"Georgia", serif', fontStyle: 'italic',
          }}>
            · The Last Story ·
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={() => { window.location.href = '/api/auth/google/start'; }}
            style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#fff', color: '#1f1f1f', border: '1px solid #ddd', borderRadius: 4,
              cursor: 'pointer', fontWeight: 600, fontSize: 15,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
            </svg>
            Google 계정으로 시작하기
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5, marginTop: 4 }}>
            최초 로그인 시 자동으로 계정이 생성됩니다.<br />
            기존 계정이 있다면 동일한 이메일의 구글 계정으로 로그인해 주세요.
          </div>
        </div>

        <div style={{
          marginTop: 20, paddingTop: 14,
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
