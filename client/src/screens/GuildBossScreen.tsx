import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { useMeStore } from '../stores/meStore';
import { useNavigate } from 'react-router-dom';

interface BossInfo {
  id: number;
  name: string;
  description: string;
  appearance: string;
  weekday: number;
  element_immune: string | null;
  element_weak: string | null;
  weak_amp_pct: number;
  dot_immune: boolean;
  hp_recover_pct: number;
  random_weakness: boolean;
  alternating_immune: boolean;
}

interface BossState {
  boss: BossInfo;
  keysRemaining: number;
  dailyDamageTotal: string;
  guildMedals: number;
  activeRun: { id: string; total_damage: string; started_at: string } | null;
  guildDaily: { total_damage: string; global_chest_milestones: number };
}

interface GuildRanking {
  guildId: number;
  guildName: string;
  totalDamage: string;
  memberCount: number;
  mvp: {
    characterId: number;
    name: string;
    className: string;
    level: number;
    damage: string;
  } | null;
}

interface ExitResult {
  ok: boolean;
  totalDamage: string;
  rewardTier: 'gold' | 'silver' | 'copper' | null;
  thresholdsPassed: number;
  firstPassBonus: number;
  chestReward: {
    gold: number;
    medals: number;
    exp: number;
    items: { itemId: number; qty: number; name: string }[];
    jackpots: string[];
  } | null;
  guildTiersGranted: ('copper' | 'silver' | 'gold')[];
  reason: string;
}

const WEEKDAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'];
const ELEMENT_LABEL: Record<string, string> = {
  fire: '화염', frost: '빙결', lightning: '번개', earth: '대지', holy: '신성', dark: '암흑',
};

const THRESHOLD_COPPER = 100_000_000n;
const THRESHOLD_SILVER = 500_000_000n;
const THRESHOLD_GOLD = 1_000_000_000n;

const GUILD_TIER_MILESTONES_BN = [
  { label: '구리 (1억)',    dmg: 100_000_000n,   bit: 1, color: '#c97e3a' },
  { label: '은빛 (5억)',    dmg: 500_000_000n,   bit: 2, color: '#c0c0c0' },
  { label: '황금 (10억)',   dmg: 1_000_000_000n, bit: 4, color: '#ffd700' },
];

function fmt(v: string | number): string {
  const n = typeof v === 'string' ? BigInt(v) : BigInt(Math.floor(Number(v)));
  return n.toLocaleString();
}

export function GuildBossScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const isAdmin = useMeStore((s) => s.me?.isAdmin ?? false);
  const navigate = useNavigate();
  const [state, setState] = useState<BossState | null>(null);
  const [err, setErr] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [exitResult, setExitResult] = useState<ExitResult | null>(null);
  const [rankings, setRankings] = useState<GuildRanking[]>([]);

  useEffect(() => {
    if (!active) return;
    loadState();
    loadRankings();
  }, [active?.id]);

  async function loadState() {
    if (!active) return;
    try {
      const s = await api<BossState>(`/guild-boss/state/${active.id}`);
      setState(s);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadRankings() {
    try {
      const r = await api<{ guilds: GuildRanking[] }>(`/guild-boss/rankings`);
      setRankings(r.guilds);
    } catch (e) {
      // 랭킹 실패는 전체 화면 막지 않음
      console.error('rankings load fail', e);
    }
  }

  async function handleEnter() {
    if (!active || !state || state.keysRemaining <= 0 || state.activeRun) return;
    setBusy(true);
    try {
      await api(`/guild-boss/enter/${active.id}`, { method: 'POST' });
      // 입장 성공 → 전투 화면으로 이동 (실제 자동 전투 시작됨)
      navigate('/combat');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function handleExit(reason: 'exit' | 'death' = 'exit') {
    if (!state?.activeRun) return;
    setBusy(true);
    try {
      const r = await api<ExitResult>(`/guild-boss/exit/${state.activeRun.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setExitResult(r);
      await loadState();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;
  if (!isAdmin) return (
    <div style={{ padding: 24, color: '#e55', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>접근 제한</div>
      <div style={{ fontSize: 14, marginBottom: 16 }}>길드 보스는 현재 관리자 테스트 단계입니다.</div>
      <button onClick={() => navigate('/guild')} style={navButtonStyle(true)}>길드로 돌아가기</button>
    </div>
  );
  if (err) return <div style={{ padding: 24, color: '#e55' }}>오류: {err}</div>;
  if (!state) return <div style={{ padding: 24 }}>불러오는 중...</div>;

  const boss = state.boss;
  const activeRun = state.activeRun;
  const dailyDmg = BigInt(state.dailyDamageTotal || '0');
  const guildDmg = BigInt(state.guildDaily.total_damage || '0');

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto', color: '#e8e2d0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>길드 보스</h1>
        <button onClick={() => navigate('/guild')} style={navButtonStyle()}>← 길드로</button>
      </div>

      {/* 오늘의 보스 카드 */}
      <div style={{ border: '1px solid #daa520', padding: 16, background: '#1a1612', marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: '#daa520', marginBottom: 6 }}>
          {WEEKDAY_LABEL[boss.weekday]}요일 — 오늘의 보스
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{boss.name}</div>
        <div style={{ fontSize: 12, color: '#a09888', marginBottom: 8 }}>{boss.appearance}</div>
        <div style={{ fontSize: 13 }}>{boss.description}</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#9a9180' }}>
          {boss.element_immune && <span>{ELEMENT_LABEL[boss.element_immune]} 면역</span>}
          {boss.element_weak && <span>{ELEMENT_LABEL[boss.element_weak]} 약점 +{boss.weak_amp_pct}%</span>}
          {boss.dot_immune && <span>도트 면역</span>}
          {boss.hp_recover_pct > 0 && <span>60초마다 HP {boss.hp_recover_pct}% 회복</span>}
          {boss.random_weakness && <span>약점 원소 랜덤 (입장 시 배정)</span>}
          {boss.alternating_immune && <span>ATK / MATK 면역 교대 (30초 주기)</span>}
        </div>
      </div>

      {/* 상태 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard label="남은 입장키" value={`${state.keysRemaining} / 2`} />
        <StatCard label="내 일일 누적" value={fmt(dailyDmg.toString())} />
        <StatCard label="길드 보스 메달" value={state.guildMedals.toLocaleString()} />
        <StatCard label="활성 입장" value={activeRun ? '진행 중' : '없음'} />
      </div>

      {/* 오늘 길드에 지급된 티어 상자 (1인이 임계값 넘으면 전원 지급) */}
      <div style={{ border: '1px solid #444', padding: 12, marginBottom: 20, background: '#0e0c0a' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
          오늘 길드 공용 상자 <span style={{ fontSize: 11, color: '#9a9180', fontWeight: 400 }}>(한 명이 임계값 달성 시 길드 전원 수령)</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {GUILD_TIER_MILESTONES_BN.map((m) => {
            const passed = (state.guildDaily.global_chest_milestones & m.bit) !== 0;
            return (
              <div key={m.bit} style={{
                flex: 1, minWidth: 120,
                padding: 10,
                border: `1px solid ${passed ? m.color : '#333'}`,
                background: passed ? `${m.color}22` : 'transparent',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 12, color: passed ? m.color : '#777', fontWeight: 700 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 11, color: passed ? '#fff' : '#555', marginTop: 2 }}>
                  {passed ? '지급 완료' : '미달성'}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: '#9a9180', marginTop: 8 }}>
          길드 일일 누적 데미지 (랭킹용): {fmt(guildDmg.toString())}
        </div>
      </div>

      {/* 길드 랭킹 + MVP */}
      {rankings.length > 0 && (
        <div style={{ border: '1px solid #444', padding: 12, marginBottom: 20, background: '#0e0c0a' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#daa520' }}>
            오늘의 길드 랭킹 (TOP {Math.min(20, rankings.length)})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 140px 180px', gap: 8, fontSize: 11, color: '#9a9180', padding: '4px 0', borderBottom: '1px solid #333' }}>
            <span>순위</span>
            <span>길드</span>
            <span style={{ textAlign: 'right' }}>누적 데미지</span>
            <span>MVP</span>
          </div>
          {rankings.map((g, idx) => (
            <div key={g.guildId} style={{
              display: 'grid', gridTemplateColumns: '30px 1fr 140px 180px', gap: 8,
              fontSize: 12, padding: '6px 0', borderBottom: '1px solid #222',
              alignItems: 'center',
            }}>
              <span style={{ color: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#c97e3a' : '#9a9180', fontWeight: 700 }}>
                #{idx + 1}
              </span>
              <span style={{ fontWeight: 600 }}>
                {g.guildName} <span style={{ fontSize: 10, color: '#777' }}>({g.memberCount}명)</span>
              </span>
              <span style={{ textAlign: 'right', color: '#e8e2d0', fontWeight: 700 }}>
                {fmt(g.totalDamage)}
              </span>
              <span style={{ fontSize: 11 }}>
                {g.mvp ? (
                  <>
                    <span style={{ color: '#ffd700' }}>★ {g.mvp.name}</span>
                    <span style={{ color: '#9a9180' }}> ({fmt(g.mvp.damage)})</span>
                  </>
                ) : <span style={{ color: '#555' }}>-</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 활성 run 또는 입장 버튼 */}
      {activeRun ? (
        <div style={{ border: '1px solid #66dd66', padding: 16, background: '#0e1a0e' }}>
          <div style={{ fontSize: 14, color: '#66dd66', marginBottom: 6 }}>입장 진행 중</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>누적 데미지: {fmt(activeRun.total_damage)}</div>
          <ProgressBars damage={BigInt(activeRun.total_damage)} />
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button onClick={() => handleExit('exit')} disabled={busy} style={navButtonStyle(true)}>
              퇴장 (상자 수령)
            </button>
            <button onClick={loadState} disabled={busy} style={navButtonStyle()}>
              상태 새로고침
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#9a9180' }}>
            ※ 자동 전투로 보스를 공격 중입니다. 퇴장 버튼을 누르기 전까지 계속 진행되며, 사망 시 자동 종료됩니다.
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid #daa520', padding: 16, background: '#1a1612', textAlign: 'center' }}>
          <button
            onClick={handleEnter}
            disabled={busy || state.keysRemaining <= 0}
            style={{
              padding: '14px 40px', fontSize: 16, fontWeight: 700,
              background: state.keysRemaining > 0 ? '#daa520' : '#555',
              color: '#000', border: 'none',
              cursor: state.keysRemaining > 0 ? 'pointer' : 'not-allowed',
            }}>
            {state.keysRemaining > 0 ? '입장하기 (-1 키)' : '오늘 입장키 없음'}
          </button>
        </div>
      )}

      {/* 퇴장 결과 팝업 */}
      {exitResult && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{ background: '#1a1612', border: '1px solid #daa520', padding: 24, maxWidth: 500, width: '90%' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#daa520' }}>
              입장 종료 — {exitResult.rewardTier ? tierLabel(exitResult.rewardTier) : '보상 없음'}
            </div>
            <div style={{ marginBottom: 8 }}>입힌 총 데미지: {fmt(exitResult.totalDamage)}</div>
            <div style={{ marginBottom: 8 }}>첫 통과 보너스 메달: +{exitResult.firstPassBonus}</div>
            {exitResult.chestReward && (
              <div style={{ marginBottom: 8, padding: 12, background: '#0e0c0a', border: '1px solid #333' }}>
                <div>골드 +{exitResult.chestReward.gold.toLocaleString()}</div>
                <div>메달 +{exitResult.chestReward.medals}</div>
                <div>EXP +{exitResult.chestReward.exp.toLocaleString()}</div>
                {exitResult.chestReward.items.map((i, idx) => (
                  <div key={idx}>{i.name} ×{i.qty}</div>
                ))}
                {exitResult.chestReward.jackpots.length > 0 && (
                  <div style={{ marginTop: 8, color: '#ffe066', fontWeight: 700 }}>
                    잭팟! {exitResult.chestReward.jackpots.join(', ')}
                  </div>
                )}
              </div>
            )}
            {exitResult.guildTiersGranted.length > 0 && (
              <div style={{ color: '#66dd66', marginBottom: 8 }}>
                길드 전원 지급 티어: {exitResult.guildTiersGranted.map(tierLabel).join(', ')}
              </div>
            )}
            <button onClick={() => setExitResult(null)} style={{ ...navButtonStyle(true), marginTop: 12, width: '100%' }}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #333', background: '#0e0c0a', padding: 10 }}>
      <div style={{ fontSize: 11, color: '#9a9180', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ProgressBars({ damage }: { damage: bigint }) {
  const tiers = [
    { label: '구리', target: THRESHOLD_COPPER, color: '#c97e3a' },
    { label: '은', target: THRESHOLD_SILVER, color: '#c0c0c0' },
    { label: '황금', target: THRESHOLD_GOLD, color: '#ffd700' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tiers.map((t) => {
        const passed = damage >= t.target;
        const progress = Number(damage * 100n / t.target);
        const clamped = Math.min(100, Math.max(0, progress));
        return (
          <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, width: 40, color: passed ? t.color : '#9a9180' }}>
              {t.label} {passed && '✓'}
            </span>
            <div style={{ flex: 1, height: 6, background: '#222', border: '1px solid #333' }}>
              <div style={{ width: `${clamped}%`, height: '100%', background: t.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function tierLabel(t: 'gold' | 'silver' | 'copper'): string {
  return t === 'gold' ? '황금빛 상자' : t === 'silver' ? '은빛 상자' : '구리 상자';
}

function navButtonStyle(primary = false): React.CSSProperties {
  return {
    padding: '8px 16px', fontSize: 13, fontWeight: 700,
    background: primary ? '#daa520' : 'transparent',
    color: primary ? '#000' : '#daa520',
    border: '1px solid #daa520',
    cursor: 'pointer',
  };
}
