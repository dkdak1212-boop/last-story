import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { MonsterIcon } from '../components/ui/MonsterIcon';
import { motion } from 'framer-motion';
import type { WorldEventStatus } from '../types';

const POLL_MS = 2000;

const PATTERN_COLOR: Record<string, string> = {
  normal: 'var(--text-dim)', defense: '#4488cc', rage: '#ff4444', aoe: '#ff8800',
};
const PHASE_COLOR = ['', '#44cc44', '#ff8800', '#ff3333'];

interface AttackResult {
  damage: number; skillName: string; crit: boolean;
  counterDmg: number; aoeDmg: number;
  pattern: string; patternLabel: string; phase: number;
  currentHp: number; maxHp: number;
  myDamage: number; myRank: number; myAttackCount: number;
  defeated: boolean; participationReward: string | null;
}

export function WorldEventScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [status, setStatus] = useState<WorldEventStatus | null>(null);
  const [result, setResult] = useState<AttackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const fetchStatus = useCallback(async () => {
    if (!active) return;
    try {
      const s = await api<WorldEventStatus>(`/world-event/status?characterId=${active.id}`);
      setStatus(s);
    } catch {}
  }, [active]);

  useEffect(() => { fetchStatus(); const id = setInterval(fetchStatus, POLL_MS); return () => clearInterval(id); }, [fetchStatus]);
  useEffect(() => { if (cooldown <= 0) return; const id = setInterval(() => setCooldown(c => Math.max(0, c - 0.1)), 100); return () => clearInterval(id); }, [cooldown]);

  async function handleAttack() {
    if (!active || busy || cooldown > 0) return;
    setBusy(true); setResult(null);
    try {
      const res = await api<AttackResult & { error?: string; cooldownMs?: number }>('/world-event/attack', {
        method: 'POST', body: JSON.stringify({ characterId: active.id }),
      });
      if ((res as any).error) {
        if ((res as any).cooldownMs) setCooldown((res as any).cooldownMs / 1000);
        setLog(prev => [`[!] ${(res as any).error}`, ...prev].slice(0, 30));
        return;
      }
      setResult(res);
      setCooldown(3); // 3초 쿨다운

      // 로그 추가
      const lines: string[] = [];
      lines.push(`[${res.skillName}] ${res.damage.toLocaleString()} 데미지${res.crit ? ' (치명타!)' : ''}`);
      if (res.counterDmg > 0) lines.push(`[반격] ${res.counterDmg.toLocaleString()} 데미지를 받았다!`);
      if (res.aoeDmg > 0) lines.push(`[전체공격] ${res.aoeDmg.toLocaleString()} 데미지를 받았다!`);
      if (res.participationReward) lines.push(`[행운!] 참여 보상: ${res.participationReward}`);
      if (res.defeated) lines.push('[!!!] 보스 처치!');
      setLog(prev => [...lines, ...prev].slice(0, 30));

      setStatus(prev => prev ? {
        ...prev, currentHp: res.currentHp, maxHp: res.maxHp,
        myDamage: res.myDamage, myRank: res.myRank, myAttackCount: res.myAttackCount,
      } : prev);
      await refreshActive();
    } catch {} finally { setBusy(false); }
  }

  if (!status) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;

  if (!status.active) {
    return (
      <div>
        <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>
        <div style={{ padding: 40, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center' }}>
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
  const phase = hpPct > 60 ? 1 : hpPct > 30 ? 2 : 3;
  const pattern = result?.pattern || 'normal';
  const patternLabel = result?.patternLabel || '일반';

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>

      {/* 보스 정보 + 페이즈 */}
      <div style={{ padding: 20, background: 'var(--bg-panel)', border: `2px solid ${PHASE_COLOR[phase]}`, marginBottom: 16, position: 'relative', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <MonsterIcon name={status.bossName!} size={48} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{status.bossName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Lv.{status.bossLevel} · 남은 시간: {minutes}분 {seconds}초
            </div>
          </div>
          {/* 페이즈 표시 */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: PHASE_COLOR[phase] }}>Phase {phase}</div>
            <div style={{ fontSize: 12, color: PATTERN_COLOR[pattern], fontWeight: 700, animation: pattern !== 'normal' ? 'pulse 0.8s ease-in-out infinite alternate' : 'none' }}>
              {patternLabel}
            </div>
          </div>
        </div>

        {/* HP 바 (페이즈 구간 표시) */}
        <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
          <span>HP</span>
          <span>{(status.currentHp ?? 0).toLocaleString()} / {(status.maxHp ?? 0).toLocaleString()} ({hpPct.toFixed(1)}%)</span>
        </div>
        <div style={{ height: 20, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative', borderRadius: 4 }}>
          <motion.div animate={{ width: `${hpPct}%` }} transition={{ duration: 0.5 }}
            style={{ height: '100%', background: `linear-gradient(90deg, ${PHASE_COLOR[3]}, ${PHASE_COLOR[phase]})` }} />
          {/* 페이즈 경계선 */}
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)' }} />
          <div style={{ position: 'absolute', left: '60%', top: 0, bottom: 0, width: 2, background: 'rgba(255,255,255,0.3)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
          <span>Phase 3 (0~30%)</span>
          <span>Phase 2 (30~60%)</span>
          <span>Phase 1 (60~100%)</span>
        </div>

        {/* 데미지 플래시 */}
        {result && (
          <motion.div
            key={Date.now()}
            initial={{ opacity: 1, y: 0, scale: 0.8 }}
            animate={{ opacity: 0, y: -50, scale: 1.5 }}
            transition={{ duration: 1.2 }}
            style={{ position: 'absolute', top: 20, right: 20, color: result.crit ? '#ff4444' : 'var(--accent)', fontSize: 28, fontWeight: 900, pointerEvents: 'none' }}
          >-{result.damage.toLocaleString()}{result.crit ? '!' : ''}</motion.div>
        )}
      </div>

      {/* 공격 + 내 정보 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <button className="primary" onClick={handleAttack} disabled={busy || cooldown > 0}
            style={{ fontSize: 18, padding: '14px 40px', width: '100%' }}>
            {busy ? '공격 중...' : cooldown > 0 ? `쿨다운 ${cooldown.toFixed(1)}초` : '공격!'}
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            3초 쿨다운 · 스킬 자동 사용 · 사망 시 즉시 재참여
          </div>
          {result?.participationReward && (
            <div style={{ marginTop: 6, fontSize: 13, color: '#e08030', fontWeight: 700 }}>
              행운 보상! {result.participationReward}
            </div>
          )}
        </div>

        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>내 기여</div>
          <Row label="총 데미지" value={(status.myDamage ?? 0).toLocaleString()} />
          <Row label="순위" value={status.myRank ? `${status.myRank}위` : '-'} />
          <Row label="참전 횟수" value={`${status.myAttackCount ?? 0}회`} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 전투 로그 */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>전투 로그</div>
          <div style={{ maxHeight: 250, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
            {log.length === 0 && <div style={{ color: 'var(--text-dim)' }}>공격을 시작하세요</div>}
            {log.map((l, i) => (
              <div key={i} style={{
                color: l.includes('치명타') ? '#ff4444' : l.includes('반격') || l.includes('전체공격') ? '#ff8800' : l.includes('행운') ? '#e08030' : l.includes('처치') ? '#44dd44' : 'var(--text-dim)',
                fontWeight: l.includes('치명타') || l.includes('처치') || l.includes('행운') ? 700 : 400,
                marginBottom: 2,
              }}>{l}</div>
            ))}
          </div>
        </div>

        {/* 리더보드 */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
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
