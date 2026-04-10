// 서버 점검 안내 화면
import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface ServerStatus { maintenance: boolean; until: string | null }

export function MaintenanceScreen({ until, onRetry }: { until: string; onRetry: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(until).getTime();
  const diff = Math.max(0, target - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const ended = diff <= 0;

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, textAlign: 'center',
    }}>
      <div style={{
        maxWidth: 440, padding: 32,
        background: 'linear-gradient(180deg, rgba(20,20,28,0.95), rgba(15,15,20,0.98))',
        border: '1px solid var(--accent)', borderRadius: 8,
        boxShadow: '0 0 40px rgba(201,162,77,0.2)',
      }}>
        <img
          src="/images/monsters/guardian.png"
          width={80} height={80}
          alt=""
          style={{ imageRendering: 'pixelated', marginBottom: 16 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <h1 style={{
          color: 'var(--accent)', marginBottom: 8, fontSize: 22, fontWeight: 900,
          letterSpacing: 2,
        }}>
          서버 점검 중
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
          더 나은 서비스를 위해 잠시 서버 점검을 진행하고 있습니다.<br/>
          잠시 후 다시 접속해 주세요.
        </p>

        <div style={{
          padding: '14px 18px', background: 'rgba(201,162,77,0.08)',
          border: '1px solid rgba(201,162,77,0.3)', borderRadius: 4,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
            {ended ? '재개되었습니다' : '재개까지 남은 시간'}
          </div>
          <div style={{
            fontSize: 26, fontWeight: 900, color: 'var(--accent)',
            fontFamily: '"Courier New", monospace', letterSpacing: 1,
          }}>
            {ended ? '--:--:--' : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            재개 예정: {new Date(until).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
          </div>
        </div>

        <button
          onClick={onRetry}
          className="primary"
          style={{ width: '100%', padding: '10px', fontSize: 14, fontWeight: 700 }}
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

// 서버 상태 폴링 훅
export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus | null>(null);

  const check = async () => {
    try {
      const s = await api<ServerStatus>('/server-status');
      setStatus(s);
    } catch { /* 무시 */ }
  };

  useEffect(() => {
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  return { status, refetch: check };
}
