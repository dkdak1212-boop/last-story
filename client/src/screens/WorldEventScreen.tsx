import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { MonsterIcon } from '../components/ui/MonsterIcon';
import { motion } from 'framer-motion';
import type { WorldEventStatus } from '../types';

const POLL_MS = 3000;
const PHASE_COLOR = ['', '#44cc44', '#ff8800', '#ff3333'];

export function WorldEventScreen() {
  const nav = useNavigate();
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [status, setStatus] = useState<WorldEventStatus | null>(null);
  const [joinMsg, setJoinMsg] = useState('');

  const fetchStatus = useCallback(async () => {
    if (!active) return;
    try {
      const s = await api<WorldEventStatus & { phase?: number; pattern?: string }>(`/world-event/status?characterId=${active.id}`);
      setStatus(s);
    } catch {}
  }, [active]);

  useEffect(() => { fetchStatus(); const id = setInterval(fetchStatus, POLL_MS); return () => clearInterval(id); }, [fetchStatus]);

  async function handleJoin() {
    if (!active) return;
    setJoinMsg('');
    try {
      const res = await api<{ ok?: boolean; error?: string; message?: string }>('/world-event/join', {
        method: 'POST', body: JSON.stringify({ characterId: active.id }),
      });
      if (res.error) { setJoinMsg(res.error); return; }
      await refreshActive();
      nav('/combat'); // 전투 화면으로 이동 (일반 사냥과 동일 UI)
    } catch (e) { setJoinMsg(e instanceof Error ? e.message : '참여 실패'); }
  }

  async function handleLeave() {
    if (!active) return;
    try {
      await api('/world-event/leave', { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      await refreshActive();
    } catch {}
  }

  if (!status) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;

  if (!status.active) {
    return (
      <div>
        <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>
        <div style={{ padding: 40, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center', borderRadius: 8 }}>
          <div style={{ fontSize: 18, color: 'var(--text-dim)', marginBottom: 8 }}>현재 진행 중인 레이드가 없습니다</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>관리자가 레이드 보스를 소환하면 참여할 수 있습니다</div>
        </div>
      </div>
    );
  }

  const hpPct = Math.max(0, Math.min(100, ((status.currentHp ?? 0) / (status.maxHp ?? 1)) * 100));
  const timeLeft = Math.max(0, new Date(status.endsAt!).getTime() - Date.now());
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const phase = (status as any).phase || (hpPct > 60 ? 1 : hpPct > 30 ? 2 : 3);
  const isInRaid = active?.location?.startsWith('raid:');

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>

      {/* 보스 정보 */}
      <div style={{ padding: 20, background: 'var(--bg-panel)', border: `2px solid ${PHASE_COLOR[phase]}`, marginBottom: 16, borderRadius: 8, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <MonsterIcon name={status.bossName!} size={48} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{status.bossName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Lv.{status.bossLevel} · 남은 시간: {minutes}분 {seconds}초</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: PHASE_COLOR[phase] }}>Phase {phase}</div>
          </div>
        </div>

        {/* HP바 */}
        <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
          <span>HP</span>
          <span>{(status.currentHp ?? 0).toLocaleString()} / {(status.maxHp ?? 0).toLocaleString()} ({hpPct.toFixed(1)}%)</span>
        </div>
        <div style={{ height: 20, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative', borderRadius: 4 }}>
          <motion.div animate={{ width: `${hpPct}%` }} transition={{ duration: 0.5 }}
            style={{ height: '100%', background: `linear-gradient(90deg, ${PHASE_COLOR[3]}, ${PHASE_COLOR[phase]})` }} />
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)' }} />
          <div style={{ position: 'absolute', left: '60%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
          <span>P3 (0~30%)</span><span>P2 (30~60%)</span><span>P1 (60~100%)</span>
        </div>
      </div>

      {/* 참여/퇴장 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center', borderRadius: 8 }}>
          {isInRaid ? (
            <>
              <div style={{ fontSize: 14, color: 'var(--success)', fontWeight: 700, marginBottom: 8 }}>레이드 전투 중!</div>
              <button onClick={() => nav('/combat')} className="primary" style={{ width: '100%', fontSize: 16, padding: 12, marginBottom: 8 }}>
                전투 화면으로
              </button>
              <button onClick={handleLeave} style={{ width: '100%', fontSize: 13, padding: '8px 0' }}>레이드 퇴장</button>
            </>
          ) : (
            <>
              <button onClick={handleJoin} className="primary" style={{ width: '100%', fontSize: 18, padding: '14px 0', fontWeight: 700 }}>
                레이드 참여
              </button>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                참여 시 자동전투 시작 · 사망 시 마을 귀환 (1분 쿨타임)
              </div>
              {joinMsg && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--danger)' }}>{joinMsg}</div>}
            </>
          )}
        </div>

        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>내 기여</div>
          <Row label="총 데미지" value={(status.myDamage ?? 0).toLocaleString()} />
          <Row label="순위" value={status.myRank ? `${status.myRank}위` : '-'} />
          <Row label="참전 횟수" value={`${status.myAttackCount ?? 0}회`} />
        </div>
      </div>

      {/* 리더보드 */}
      <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>데미지 순위</div>
        {(!status.leaderboard || status.leaderboard.length === 0) ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>아직 참여자가 없습니다</div>
        ) : (
          <div style={{ fontSize: 13 }}>
            {status.leaderboard.map(e => (
              <div key={e.rank} style={{
                display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                borderBottom: '1px solid var(--border)',
                color: e.rank <= 3 ? 'var(--accent)' : 'var(--text)',
                fontWeight: e.rank <= 3 ? 700 : 400,
              }}>
                <span>{e.rank}. {e.characterName}</span>
                <span>{e.damage.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 안내 */}
      <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-dim)', borderRadius: 8 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>레이드 안내</div>
        <div>· 참여하면 보스와 <span style={{ color: 'var(--text)' }}>자동전투</span> (일반 사냥과 동일)</div>
        <div>· 보스가 공격합니다 — 사망 시 마을 귀환 후 <span style={{ color: 'var(--text)' }}>1분 쿨타임</span></div>
        <div>· 여러 유저가 동시에 공격, 데미지가 <span style={{ color: 'var(--text)' }}>공유 HP</span>에 누적</div>
        <div>· 보스 처치 시 기여도 순위별 <span style={{ color: 'var(--text)' }}>S/A/B/C</span> 보상</div>
        <div>· Phase 1→2→3 전환 시 보스가 강해집니다</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}
