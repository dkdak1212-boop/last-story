import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../api/client';
import { useCharacterStore } from '../../stores/characterStore';

interface Status { canCheckIn: boolean; currentStreak: number; nextStreak: number; nextIsWeekly: boolean }
interface CheckResult { isWeekly: boolean; newStreak: number; rewards: { gold: number; items: string[] } }

export function DailyCheckInBanner() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refresh = useCharacterStore((s) => s.refreshActive);
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setStatus(await api<Status>('/daily/status')); } catch {}
  }
  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, []);

  async function checkIn() {
    if (!active) return;
    setBusy(true);
    try {
      const r = await api<CheckResult>('/daily/check-in', {
        method: 'POST', body: JSON.stringify({ characterId: active.id }),
      });
      setResult(r);
      await refresh(); await load();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }

  if (!status || !status.canCheckIn) {
    // 결과 모달만 표시
    return result ? <ResultModal result={result} onClose={() => setResult(null)} /> : null;
  }

  return (
    <>
      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{
          padding: '10px 16px', background: 'var(--bg-panel)',
          border: `1px solid ${status.nextIsWeekly ? 'var(--accent)' : 'var(--border)'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          margin: '0 20px',
        }}>
        <div>
          <span style={{ fontWeight: 700, color: status.nextIsWeekly ? 'var(--accent)' : 'var(--text)' }}>
            출석 체크 {status.nextIsWeekly && '🎁 7일 연속 보상!'}
          </span>
          <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-dim)' }}>
            연속 {status.currentStreak}일 → {status.nextStreak}일
          </span>
        </div>
        <button className="primary" onClick={checkIn} disabled={busy} style={{ fontSize: 12, padding: '4px 14px' }}>
          {busy ? '...' : status.nextIsWeekly ? '주간 보상 받기' : '체크인'}
        </button>
      </motion.div>
    </>
  );
}

function ResultModal({ result, onClose }: { result: CheckResult; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
    }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{
        width: 360, padding: 24, background: 'var(--bg-panel)',
        border: `1px solid ${result.isWeekly ? 'var(--accent)' : 'var(--border)'}`,
      }}>
        <h2 style={{ color: 'var(--accent)', marginBottom: 6 }}>
          {result.isWeekly ? '🎁 7일 연속 보상!' : '출석 완료!'}
        </h2>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
          연속 {result.newStreak}일 달성
        </div>
        <div style={{ padding: 12, background: 'var(--bg-elev)', border: '1px solid var(--border)', marginBottom: 16 }}>
          {result.rewards.gold > 0 && (
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{result.rewards.gold.toLocaleString()}G</span>
            </div>
          )}
          {result.rewards.items.map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{item}</div>
          ))}
        </div>
        <button className="primary" onClick={onClose} style={{ width: '100%' }}>확인</button>
      </motion.div>
    </div>
  );
}
