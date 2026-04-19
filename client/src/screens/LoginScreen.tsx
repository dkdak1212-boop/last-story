import { useState } from 'react';
import { TermsModal } from '../components/ui/TermsModal';

// 인앱 웹뷰 감지 — Google OAuth 차단 대상 (403 disallowed_useragent)
function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // 안드로이드 WebView / 주요 인앱 브라우저
  const patterns = /(; wv\)|KAKAOTALK|NAVER|Line\/|Instagram|FBAN|FBAV|FB_IAB|Twitter|Daum|KAKAOSTORY|everytimeApp|NAVER\(inapp|whale\/|WebView)/i;
  if (patterns.test(ua)) return true;
  // iOS 인앱 (WebKit 있으나 Safari 없음)
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS && /AppleWebKit/.test(ua) && !/Safari/.test(ua)) return true;
  return false;
}

export function LoginScreen() {
  const [showTerms, setShowTerms] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const inAppBrowser = isInAppBrowser();

  function startDeletion() {
    const a = confirm(
      '⚠ 회원 탈퇴 진행\n\n' +
      '계속하시려면 먼저 구글 로그인으로 본인 확인을 진행합니다.\n' +
      '로그인 완료 후 즉시 계정이 삭제되며, 캐릭터·아이템·골드·우편 등 모든 데이터가 영구 삭제됩니다.\n\n' +
      '되돌릴 수 없습니다. 진행하시겠습니까?'
    );
    if (!a) return;
    const b = confirm('정말로 탈퇴하시겠습니까? 복구 불가입니다.');
    if (!b) return;
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      sessionStorage.setItem('deleteAccountOnLogin', '1');
    } catch { /* ignore */ }
    window.location.href = '/api/auth/google/start';
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('주소가 복사되었습니다. 크롬/사파리 등 외부 브라우저에 붙여넣기 하세요.');
    } catch { alert(window.location.href); }
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
            textAlign: 'center', color: 'var(--text-dim)', marginBottom: 28,
            fontSize: 11, letterSpacing: 4, textTransform: 'uppercase',
            fontFamily: '"Georgia", serif', fontStyle: 'italic',
          }}>
            · The Last Story ·
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {inAppBrowser && (
            <div style={{
              padding: '12px 14px', borderRadius: 6,
              background: 'rgba(255,90,90,0.12)', border: '1px solid #ff5a5a',
              color: '#ffbdbd', fontSize: 13, lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 800, color: '#ff5a5a', marginBottom: 6 }}>⚠ 구글 로그인 차단 안내</div>
              카카오톡/네이버/인스타 등 <b>인앱 브라우저에서는 구글 로그인이 불가</b>합니다 (403 disallowed_useragent).
              <div style={{ marginTop: 6 }}>
                아래 주소를 복사해서 <b>크롬 · 사파리 · 삼성인터넷</b> 같은 외부 브라우저에서 열어주세요.
              </div>
              <button
                type="button"
                onClick={copyUrl}
                style={{
                  marginTop: 10, padding: '8px 12px', width: '100%',
                  background: '#ff5a5a', color: '#fff', border: 'none', borderRadius: 4,
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                사이트 주소 복사하기
              </button>
            </div>
          )}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12,
            color: 'var(--text-dim)', cursor: 'pointer',
            padding: '10px 12px',
            border: `1px solid ${agreed ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 4,
            background: agreed ? 'rgba(201,162,77,0.06)' : 'transparent',
          }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <span style={{ lineHeight: 1.5 }}>
              [필수]{' '}
              <span
                onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
                style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}
              >
                서비스 이용약관 및 개인정보처리방침
              </span>
              에 동의합니다
            </span>
          </label>
          <button
            type="button"
            disabled={!agreed}
            onClick={() => {
              if (!agreed) { alert('이용약관에 동의해주세요.'); return; }
              // 이전 세션 JWT 완전 제거 — 공유 브라우저 안전장치
              try {
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                sessionStorage.clear();
              } catch { /* ignore */ }
              window.location.href = '/api/auth/google/start';
            }}
            style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: agreed ? '#fff' : '#555', color: agreed ? '#1f1f1f' : '#aaa',
              border: '1px solid #ddd', borderRadius: 4,
              cursor: agreed ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 15,
              opacity: agreed ? 1 : 0.6,
              transition: 'all 0.2s',
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
          <span style={{ color: 'var(--text-dim)', margin: '0 6px' }}>·</span>
          <button
            onClick={startDeletion}
            style={{ background: 'none', border: 'none', color: '#ff7070', fontSize: 11, textDecoration: 'underline', cursor: 'pointer' }}
          >
            회원 탈퇴
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
