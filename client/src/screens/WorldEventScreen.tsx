import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { MonsterIcon } from '../components/ui/MonsterIcon';
import { motion } from 'framer-motion';
import type { WorldEventStatus } from '../types';

const POLL_MS = 3000;
const PHASE_COLOR = ['', '#44cc44', '#ff8800', '#ff3333'];

interface AttackResult {
  damageDealt: number; damageReceived: number; actionCount: number; critCount: number;
  playerDead: boolean; playerHp: number; phase: number;
  combatLog: string[];
  currentHp: number; maxHp: number;
  myDamage: number; myRank: number; myAttackCount: number; defeated: boolean;
}

export function WorldEventScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [status, setStatus] = useState<WorldEventStatus & { phase?: number } | null>(null);
  const [result, setResult] = useState<AttackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const fetchStatus = useCallback(async () => {
    if (!active) return;
    try { setStatus(await api(`/world-event/status?characterId=${active.id}`)); } catch {}
  }, [active]);

  useEffect(() => { fetchStatus(); const id = setInterval(fetchStatus, POLL_MS); return () => clearInterval(id); }, [fetchStatus]);
  useEffect(() => { if (cooldown <= 0) return; const id = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000); return () => clearInterval(id); }, [cooldown]);

  async function handleAttack() {
    if (!active || busy || cooldown > 0) return;
    setBusy(true); setResult(null);
    try {
      const res = await api<AttackResult & { error?: string; cooldownMs?: number }>('/world-event/attack', {
        method: 'POST', body: JSON.stringify({ characterId: active.id }),
      });
      if ((res as any).error) {
        if ((res as any).cooldownMs) setCooldown(Math.ceil((res as any).cooldownMs / 1000));
        return;
      }
      setResult(res);
      setCooldown(res.playerDead ? 60 : 10); // 사망 시 1분, 생존 시 10초
      setStatus(prev => prev ? { ...prev, currentHp: res.currentHp, maxHp: res.maxHp, myDamage: res.myDamage, myRank: res.myRank, myAttackCount: res.myAttackCount } : prev);
      await refreshActive();
    } catch {} finally { setBusy(false); }
  }

  if (!status) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;
  if (!status.active) return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>
      <div style={{ padding: 40, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center', borderRadius: 8 }}>
        <div style={{ fontSize: 18, color: 'var(--text-dim)', marginBottom: 8 }}>현재 진행 중인 레이드가 없습니다</div>
      </div>
    </div>
  );

  const hpPct = Math.max(0, Math.min(100, ((status.currentHp ?? 0) / (status.maxHp ?? 1)) * 100));
  const timeLeft = Math.max(0, new Date(status.endsAt!).getTime() - Date.now());
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const phase = (status as any).phase || (hpPct > 60 ? 1 : hpPct > 30 ? 2 : 3);

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>

      {/* 보스 */}
      <div style={{ padding: 20, background: 'var(--bg-panel)', border: `2px solid ${PHASE_COLOR[phase]}`, marginBottom: 16, borderRadius: 8, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <MonsterIcon name={status.bossName!} size={48} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{status.bossName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Lv.{status.bossLevel} · {minutes}분 {seconds}초</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: PHASE_COLOR[phase] }}>Phase {phase}</div>
        </div>

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

        {result && (
          <motion.div key={Date.now()} initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -50, scale: 1.5 }}
            transition={{ duration: 1.2 }}
            style={{ position: 'absolute', top: 20, right: 20, color: 'var(--accent)', fontSize: 28, fontWeight: 900, pointerEvents: 'none' }}>
            -{result.damageDealt.toLocaleString()}
          </motion.div>
        )}
      </div>

      {/* 공격 + 기여 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center', borderRadius: 8 }}>
          <button className="primary" onClick={handleAttack} disabled={busy || cooldown > 0}
            style={{ fontSize: 18, padding: '14px 40px', width: '100%', fontWeight: 700 }}>
            {busy ? '전투 중...' : cooldown > 0 ? `대기 ${cooldown}초` : '10초 전투 시작!'}
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            10초간 보스와 전투 · 보스도 공격합니다 · 사망 가능
          </div>
          {result && (
            <div style={{ marginTop: 8, padding: 8, background: result.playerDead ? 'rgba(255,50,50,0.1)' : 'rgba(100,200,100,0.1)', borderRadius: 4, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: result.playerDead ? 'var(--danger)' : 'var(--success)' }}>
                {result.playerDead ? '사망!' : '생존!'} · 딜 {result.damageDealt.toLocaleString()} · 피해 {result.damageReceived.toLocaleString()} · HP {result.playerHp}/{(result as any).playerMaxHp || '?'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {result.actionCount}회 행동 · 치명타 {result.critCount}회
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>내 기여</div>
          <Row label="총 데미지" value={(status.myDamage ?? 0).toLocaleString()} />
          <Row label="순위" value={status.myRank ? `${status.myRank}위` : '-'} />
          <Row label="참전" value={`${status.myAttackCount ?? 0}회`} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 전투 로그 */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>전투 로그</div>
          <div style={{ maxHeight: 250, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
            {!result && <div style={{ color: 'var(--text-dim)' }}>전투를 시작하세요</div>}
            {result?.combatLog.map((l, i) => (
              <div key={i} style={{
                color: l.includes('치명타') ? '#ff4444' : l.includes('보스') ? '#ff8800' : l.includes('사망') ? '#ff2222' : 'var(--text-dim)',
                fontWeight: l.includes('치명타') || l.includes('사망') ? 700 : 400, marginBottom: 2,
              }}>{l}</div>
            ))}
          </div>
        </div>

        {/* 리더보드 */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>데미지 순위</div>
          {(!status.leaderboard || status.leaderboard.length === 0) ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>아직 참여자가 없습니다</div>
          ) : status.leaderboard.map(e => (
            <div key={e.rank} style={{
              display: 'flex', justifyContent: 'space-between', padding: '4px 0',
              borderBottom: '1px solid var(--border)',
              color: e.rank <= 3 ? 'var(--accent)' : 'var(--text)', fontWeight: e.rank <= 3 ? 700 : 400,
            }}>
              <span>{e.rank}. {e.characterName}</span>
              <span>{e.damage.toLocaleString()}</span>
            </div>
          ))}
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
