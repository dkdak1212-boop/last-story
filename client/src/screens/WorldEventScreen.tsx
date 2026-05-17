import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { motion } from 'framer-motion';
import type { WorldEventStatus } from '../types';

const POLL_MS = 3000;

// 전투 로그 영역 제거 (2026-05-17 사용자 결정).
// 옛 픽셀 아이콘 인라인 토큰 (PATTERN_ICON / renderLogLine) 도 함께 제거.

interface AttackResult {
  damageDealt: number; damageReceived: number; actionCount: number; critCount: number;
  playerDead: boolean; playerHp: number; phase: number;
  combatLog: string[];
  currentHp: number; maxHp: number;
  myDamage: number; myRank: number; myAttackCount: number; defeated: boolean;
}

export function WorldEventScreen() {
  const navigate = useNavigate();
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

  // 옛 10초 시뮬 — Step 3.5 에서 실시간 전투(handleEnter)로 대체. 향후 정리 예정.
  // @ts-expect-error — 사용 안 함, 호환성 보존
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

  // raid-bosses-v2 Step 3.5 — 실시간 전투 세션 입장
  // 성공 시 활성 combat_sessions 생성 → 클라가 전투 화면으로 자동 전환
  async function handleEnter() {
    if (!active || busy || cooldown > 0) return;
    setBusy(true); setResult(null);
    try {
      const res = await api<{ ok?: boolean; error?: string; cooldownMs?: number; eventId?: number; bossName?: string }>(`/world-event/enter/${active.id}`, {
        method: 'POST',
      });
      if ((res as any).error) {
        if ((res as any).cooldownMs) setCooldown(Math.ceil((res as any).cooldownMs / 1000));
        alert((res as any).error);
        return;
      }
      if (!res.ok) {
        alert(`입장 실패 (서버 응답 ok=false): ${JSON.stringify(res)}`);
        return;
      }
      // 세션 시작됨 — 캐릭 새로고침 + navigate
      await refreshActive();
      // 약간의 딜레이 후 navigate — CombatScreen 이 active 캐릭 변경 인식할 시간 확보
      setTimeout(() => navigate('/combat'), 200);
    } catch (e: any) {
      alert(`입장 실패: ${e?.message ?? '오류'}`);
    } finally { setBusy(false); }
  }

  if (!status) return <div style={{ color: 'var(--text-dim)' }}>로딩...</div>;
  if (!status.active) return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>
      <div style={{ padding: 30, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center', borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 18, color: 'var(--text-dim)' }}>현재 진행 중인 레이드가 없습니다</div>
      </div>

      <div style={{
        padding: 24, background: 'var(--bg-panel)',
        border: '1px solid var(--accent)', borderRadius: 8, textAlign: 'center',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
          레이드 일시 중단
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          레이드 보스 등장이 일시적으로 중단되었습니다.<br/>
          재개 일정은 공지를 통해 안내드리겠습니다.
        </div>
      </div>
    </div>
  );

  const timeLeft = Math.max(0, new Date(status.endsAt!).getTime() - Date.now());
  const hours = Math.floor(timeLeft / 3600000);
  const minutes = Math.floor((timeLeft % 3600000) / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);

  // 발라카스 픽셀 sprite (DCSS 마지막이야기 monsters 폴더). 다른 보스도 같은 폴더에서 가져옴.
  const bossSprite = '/images/monsters/fire_dragon.png';

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>레이드</h2>

      {/* 보스 영웅 무대 — 큰 픽셀 + 분위기 */}
      <div style={{
        position: 'relative',
        padding: '36px 20px 24px',
        marginBottom: 16,
        borderRadius: 12,
        border: '2px solid #ff4422',
        background: 'radial-gradient(ellipse at center, #2a0808 0%, #0a0303 70%, #000 100%)',
        boxShadow: '0 0 32px rgba(255,70,30,0.45), inset 0 0 60px rgba(255,80,20,0.15)',
        overflow: 'hidden',
        textAlign: 'center',
      }}>
        {/* 배경 펄스 후광 */}
        <motion.div
          animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at center, rgba(255,80,20,0.35) 0%, transparent 60%)',
            pointerEvents: 'none',
          }}
        />
        {/* 회전 후광 ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 360, height: 360,
            marginTop: -180, marginLeft: -180,
            border: '1px dashed rgba(255,140,30,0.25)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 460, height: 460,
            marginTop: -230, marginLeft: -230,
            border: '1px dotted rgba(255,80,20,0.18)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
        {/* 큰 픽셀 보스 + 떨림/광폭 ring */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'relative', display: 'inline-block', zIndex: 2 }}
        >
          <motion.img
            src={bossSprite}
            alt={status.bossName ?? '발라카스'}
            width={256}
            height={256}
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              imageRendering: 'pixelated',
              filter: 'drop-shadow(0 0 24px rgba(255,90,20,0.85)) drop-shadow(0 0 8px rgba(255,180,40,0.6))',
            }}
            onError={(e) => { (e.target as HTMLImageElement).src = '/images/monsters/dragon.png'; }}
          />
        </motion.div>

        {/* 보스 이름 — 거대 글씨 */}
        <div style={{ position: 'relative', zIndex: 2, marginTop: 16 }}>
          <motion.div
            animate={{ textShadow: [
              '0 0 8px rgba(255,80,20,0.7)',
              '0 0 24px rgba(255,140,40,1)',
              '0 0 8px rgba(255,80,20,0.7)',
            ] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              fontSize: 36, fontWeight: 900, letterSpacing: 4,
              color: '#ffd28a',
              fontFamily: 'serif',
            }}
          >
            {status.bossName}
          </motion.div>
          <div style={{
            marginTop: 6, fontSize: 13, color: '#c08060',
            letterSpacing: 6, textTransform: 'uppercase',
          }}>
            ★ ★ ★ Lv.{status.bossLevel} ★ ★ ★
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#8a5040', letterSpacing: 2 }}>
            잔여 시간 · {hours > 0 ? `${hours}시간 ` : ''}{minutes}분 {seconds}초
          </div>
        </div>

        {/* 데미지 토스트 */}
        {result && (
          <motion.div key={Date.now()} initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -80, scale: 1.8 }}
            transition={{ duration: 1.4 }}
            style={{ position: 'absolute', top: 24, right: 28, color: '#ffe135', fontSize: 32, fontWeight: 900, pointerEvents: 'none', zIndex: 3, textShadow: '0 0 8px rgba(255,80,20,1)' }}>
            -{result.damageDealt.toLocaleString()}
          </motion.div>
        )}
      </div>

      {/* 입장 + 기여 — raid-bosses-v2 Step 3.5 실시간 전투 세션 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', textAlign: 'center', borderRadius: 8 }}>
          <button className="primary" onClick={handleEnter} disabled={busy || cooldown > 0}
            style={{ fontSize: 18, padding: '14px 40px', width: '100%', fontWeight: 700 }}>
            {busy ? '입장 중...' : cooldown > 0 ? `대기 ${cooldown}초` : '레이드 입장 (실시간)'}
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-dim)' }}>
            실시간 전투 진입 · 5종 시그니처 패턴 · 30초마다 광폭 ×2 · 사망 시 5분 쿨다운 · 일일 10회 제한
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

      <div>
        {/* 리더보드 — 전투 로그 영역은 사용자 결정으로 제거 (2026-05-17) */}
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
