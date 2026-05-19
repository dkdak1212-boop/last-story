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
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>매일 17:00 레이드 보스 출현</div>
      </div>

      <RewardTable />
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
            실시간 전투 진입 · 5종 시그니처 패턴 · 30초마다 광폭 2배 · 사망 시 60분 쿨다운 · 1일 1회 입장
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
          <Row
            label="순위 (직업 내)"
            value={status.myRank
              ? `${(status as any).myClassName ? (CLASS_KO[(status as any).myClassName] || (status as any).myClassName) + ' ' : ''}${status.myRank}위`
              : '-'}
          />
          <Row label="참전" value={`${status.myAttackCount ?? 0}회`} />
        </div>
      </div>

      <div>
        {/* 리더보드 — 직업별 순위 (2026-05-18 개편) */}
        <ClassLeaderboard
          leaderboard={status.leaderboard ?? []}
          myClassName={(status as any).myClassName}
        />
      </div>

      <RewardTable />
    </div>
  );
}

// 직업별 순위 표시 — 클래스 탭 + 클래스 내 순위 리스트
const CLASS_KO: Record<string, string> = {
  warrior: '전사',
  mage: '마법사',
  rogue: '도적',
  cleric: '성직자',
  summoner: '소환사',
  archer: '궁수',
};
const CLASS_ORDER = ['warrior', 'mage', 'rogue', 'cleric', 'summoner', 'archer'];

function ClassLeaderboard({
  leaderboard,
  myClassName,
}: {
  leaderboard: { rank: number; characterName: string; className: string; damage: number }[];
  myClassName?: string;
}) {
  // 클래스별 그룹화
  const grouped = new Map<string, typeof leaderboard>();
  for (const cls of CLASS_ORDER) grouped.set(cls, []);
  for (const e of leaderboard) {
    if (!grouped.has(e.className)) grouped.set(e.className, []);
    grouped.get(e.className)!.push(e);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.rank - b.rank);
  }

  return (
    <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
        데미지 순위 (직업별)
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        같은 클래스 안에서 비교됩니다. 각 박스를 위아래로 스크롤해 확인.
      </div>
      {/* 클래스별 박스를 세로로 스택 — 모바일에서 풀폭 사용해 유저명 가독성 확보 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CLASS_ORDER.map(cls => {
          const list = grouped.get(cls) ?? [];
          const isMine = myClassName === cls;
          return (
            <div
              key={cls}
              style={{
                background: isMine ? 'rgba(218,165,32,0.08)' : 'var(--bg)',
                border: `1px solid ${isMine ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6,
                padding: '10px 12px',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 14, fontWeight: 700,
                color: isMine ? 'var(--accent)' : 'var(--text)',
                marginBottom: 8, paddingBottom: 6,
                borderBottom: `1px solid ${isMine ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                <span>{CLASS_KO[cls] || cls}{isMine ? ' (나)' : ''}</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-dim)' }}>
                  {list.length}명
                </span>
              </div>
              {list.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: '8px 0' }}>
                  참여자 없음
                </div>
              ) : (
                list.map(e => (
                  <div key={`${e.className}-${e.rank}`} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    padding: '5px 0', fontSize: 13,
                    borderBottom: '1px solid var(--border)',
                    color: e.rank <= 3 ? 'var(--accent)' : 'var(--text)',
                    fontWeight: e.rank <= 3 ? 700 : 400,
                    gap: 8,
                  }}>
                    <span style={{
                      flex: '1 1 auto', minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      <span style={{
                        display: 'inline-block', minWidth: 26,
                        color: 'var(--text-dim)', marginRight: 6,
                      }}>{e.rank}.</span>
                      {e.characterName}
                    </span>
                    <span style={{ flex: '0 0 auto', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                      {e.damage.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 순위별 레이드 보상 — 2026-05-18 직업별 순위 개편.
// 서버 game/worldEvent.ts distributeEssence + distributeRaidPoints 정책 반영.
// 정수: 라인 A 모든 참여자 25%(고정) + 라인 B 클래스 내 순위 기반 10단계 선형 감소.
// 레이드 포인트: 클래스 내 순위 기반 10단계 선형 감소 (1000→100).
function RewardTable() {
  const rows: { rank: string; lineB: string; points: string }[] = [
    { rank: '1~10위',   lineB: '100%', points: '1,000 pt' },
    { rank: '11~20위',  lineB: '90%',  points: '900 pt' },
    { rank: '21~30위',  lineB: '80%',  points: '800 pt' },
    { rank: '31~40위',  lineB: '70%',  points: '700 pt' },
    { rank: '41~50위',  lineB: '60%',  points: '600 pt' },
    { rank: '51~60위',  lineB: '50%',  points: '500 pt' },
    { rank: '61~70위',  lineB: '40%',  points: '400 pt' },
    { rank: '71~80위',  lineB: '30%',  points: '300 pt' },
    { rank: '81~90위',  lineB: '20%',  points: '200 pt' },
    { rank: '91~100위', lineB: '10%',  points: '100 pt' },
    { rank: '101위~',   lineB: '0%',   points: '0' },
  ];
  return (
    <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
        순위별 보상 (직업 내 순위 기준)
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 10 }}>
        순위는 같은 클래스 안에서 비교됩니다. 보스 보상으로 보스 정수와 레이드 포인트가 지급됩니다.
        정수는 두 라인(A: 모든 참여자 / B: 클래스 내 순위) 독립 굴림으로 0~2개 누적, 포인트는 확정 지급.
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '110px 1fr 110px',
        fontSize: 12, fontWeight: 700, color: 'var(--text-dim)',
        padding: '6px 0', borderBottom: '1px solid var(--border)',
      }}>
        <span>클래스 내 순위</span>
        <span>라인 B 확률 (정수)</span>
        <span style={{ textAlign: 'right' }}>레이드 포인트</span>
      </div>
      {rows.map((r) => (
        <div key={r.rank} style={{
          display: 'grid', gridTemplateColumns: '110px 1fr 110px',
          fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)',
          alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700 }}>{r.rank}</span>
          <span style={{ color: 'var(--text-dim)' }}>{r.lineB}</span>
          <span style={{ textAlign: 'right', fontWeight: 700 }}>{r.points}</span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.5 }}>
        라인 A: 참여자 전원 25% 확률로 정수 1개 (변경 없음).{' '}
        라인 B: 클래스 내 순위에 따라 위 확률로 정수 1개 추가 굴림.{' '}
        두 라인은 독립이며, 한 회 결산에서 최대 2개까지 누적됩니다.
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
