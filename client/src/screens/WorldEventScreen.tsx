import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { MonsterIcon } from '../components/ui/MonsterIcon';
import { motion } from 'framer-motion';
import type { WorldEventStatus } from '../types';

const POLL_MS = 3000;

interface AttackResult {
  damage: number;
  totalTicks: number;
  skillUseCount: number;
  critCount: number;
  skillLog: { name: string; damage: number; crit: boolean }[];
  currentHp: number;
  maxHp: number;
  myDamage: number;
  myRank: number;
  myAttackCount: number;
  defeated: boolean;
}

export function WorldEventScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [status, setStatus] = useState<WorldEventStatus | null>(null);
  const [result, setResult] = useState<AttackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const fetchStatus = useCallback(async () => {
    if (!active) return;
    try {
      const s = await api<WorldEventStatus>(`/world-event/status?characterId=${active.id}`);
      setStatus(s);
    } catch { /* noop */ }
  }, [active]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // 쿨다운 타이머
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleAttack() {
    if (!active || busy || cooldown > 0) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await api<AttackResult & { error?: string; cooldownMs?: number }>('/world-event/attack', {
        method: 'POST',
        body: JSON.stringify({ characterId: active.id }),
      });
      if (res.error) {
        if (res.cooldownMs) setCooldown(Math.ceil(res.cooldownMs / 1000));
        return;
      }
      setResult(res);
      setCooldown(300); // 5분 쿨다운
      setStatus((prev) => prev ? {
        ...prev,
        currentHp: res.currentHp,
        maxHp: res.maxHp,
        myDamage: res.myDamage,
        myRank: res.myRank,
        myAttackCount: res.myAttackCount,
      } : prev);
    } catch { /* noop */ } finally {
      setBusy(false);
    }
  }

  if (!status) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;

  if (!status.active) {
    return (
      <div>
        <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>월드 이벤트</h2>
        <div style={{ padding: 40, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: 'var(--text-dim)', marginBottom: 8 }}>현재 진행 중인 이벤트가 없습니다</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>월드 보스는 하루 2회 출현합니다 (오전 12시, 오후 8시)</div>
        </div>
      </div>
    );
  }

  const hpPct = Math.max(0, Math.min(100, ((status.currentHp ?? 0) / (status.maxHp ?? 1)) * 100));
  const timeLeft = Math.max(0, new Date(status.endsAt!).getTime() - Date.now());
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const cdMin = Math.floor(cooldown / 60);
  const cdSec = cooldown % 60;

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>월드 이벤트</h2>

      {/* 보스 정보 */}
      <div style={{ padding: 20, background: 'var(--bg-panel)', border: '1px solid var(--danger)', marginBottom: 16, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <MonsterIcon name={status.bossName!} size={48} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{status.bossName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Lv.{status.bossLevel} · 남은 시간: {minutes}분 {seconds}초
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)' }}>
          <span>HP</span>
          <span>{(status.currentHp ?? 0).toLocaleString()} / {(status.maxHp ?? 0).toLocaleString()} ({hpPct.toFixed(1)}%)</span>
        </div>
        <div style={{ height: 16, background: 'var(--bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${hpPct}%` }}
            transition={{ duration: 0.5 }}
            style={{ height: '100%', background: hpPct > 50 ? 'var(--danger)' : hpPct > 20 ? '#e08030' : '#cc3333' }}
          />
        </div>

        {result && (
          <motion.div
            initial={{ opacity: 1, y: 0, scale: 0.8 }}
            animate={{ opacity: 0, y: -50, scale: 1.5 }}
            transition={{ duration: 1.2 }}
            style={{ position: 'absolute', top: 20, right: 20, color: 'var(--accent)', fontSize: 30, fontWeight: 900, pointerEvents: 'none' }}
          >-{result.damage.toLocaleString()}</motion.div>
        )}
      </div>

      {/* 공격 버튼 + 내 정보 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center' }}>
          <button
            className="primary"
            onClick={handleAttack}
            disabled={busy || cooldown > 0}
            style={{ fontSize: 18, padding: '14px 40px', width: '100%' }}
          >
            {busy ? '전투 시뮬레이션 중...' : cooldown > 0 ? `대기 중 ${cdMin}:${cdSec.toString().padStart(2, '0')}` : '5분간 전투 시작'}
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            5분간의 공격+스킬 데미지를 합산하여 적용합니다
          </div>
        </div>

        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>내 기여</div>
          <Row label="총 데미지" value={(status.myDamage ?? 0).toLocaleString()} />
          <Row label="순위" value={status.myRank ? `${status.myRank}위` : '-'} />
          <Row label="참전 횟수" value={`${status.myAttackCount ?? 0}회`} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 전투 결과 */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>전투 결과</div>
          {!result ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>전투를 시작하세요</div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <Row label="총 데미지" value={result.damage.toLocaleString()} />
                <Row label="총 행동 수" value={`${result.totalTicks}회`} />
                <Row label="스킬 사용" value={`${result.skillUseCount}회`} />
                <Row label="치명타" value={`${result.critCount}회`} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6 }}>전투 로그 (발췌)</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                {result.skillLog.map((l, i) => (
                  <div key={i} style={{
                    color: l.crit ? 'var(--danger)' : 'var(--text-dim)',
                    fontWeight: l.crit ? 700 : 400,
                    marginBottom: 1,
                  }}>
                    [{l.name}] {l.damage.toLocaleString()}{l.crit ? ' (치명타!)' : ''}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 리더보드 */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>데미지 순위</div>
          {(!status.leaderboard || status.leaderboard.length === 0) ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>아직 참여자가 없습니다</div>
          ) : (
            <div style={{ fontSize: 13 }}>
              {status.leaderboard.map((e) => (
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
