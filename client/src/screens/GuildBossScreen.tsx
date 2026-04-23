import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
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
  chestDelivered: boolean;
  guildTiersGranted: ('copper' | 'silver' | 'gold')[];
  reason: string;
}

const WEEKDAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'];
const ELEMENT_LABEL: Record<string, string> = {
  fire: '화염', frost: '빙결', lightning: '번개', earth: '대지', holy: '신성', dark: '암흑',
};

const BOSS_IMAGE_KEY: Record<string, string> = {
  '강철의 거인':   'iron_golem',
  '광속의 환영':   'shadow',
  '화염의 군주':   'fire_giant_new',
  '그림자 황제':   'boss_dark',
  '시계태엽 거인': 'stone_giant',
  '천공의 용':     'golden_dragon',
  '차원의 지배자': 'ancient_lich',
};

const THRESHOLD_COPPER = 100_000_000n;
const THRESHOLD_SILVER = 500_000_000n;
const THRESHOLD_GOLD = 1_000_000_000n;
// 처치 임계값 (50억 = 5_000_000_000n) — 서버에서만 판정, 클라는 현재 사용 안 함

const GUILD_TIER_MILESTONES_BN: {
  label: string; threshold: string; dmg: bigint; bit: number; color: string;
  confirmed: string[]; jackpots: string[];
}[] = [
  {
    label: '구리', threshold: '1억+', dmg: 100_000_000n, bit: 1, color: '#c97e3a',
    confirmed: [
      '골드 1,000,000',
      '길드 보스 메달 5',
      'EXP 두루마리 (현 레벨 1%)',
      '부스터 택1 (EXP/골드/드랍 중 1종, 1시간)',
    ],
    jackpots: ['접두사 수치 재굴림권 (1%)'],
  },
  {
    label: '은빛', threshold: '5억+', dmg: 500_000_000n, bit: 2, color: '#c0c0c0',
    confirmed: [
      '골드 2,500,000',
      '길드 보스 메달 15',
      'EXP 두루마리 (현 레벨 3%)',
      '부스터 5종 패키지 (1시간)',
    ],
    jackpots: [
      '품질 재굴림권 (1%)',
      '접두사 수치 재굴림권 (5%)',
    ],
  },
  {
    label: '황금', threshold: '10억+', dmg: 1_000_000_000n, bit: 4, color: '#ffd700',
    confirmed: [
      '강화 성공률 스크롤 1',
      '골드 5,000,000',
      '길드 보스 메달 50',
      'EXP 두루마리 (현 레벨 5%)',
      '부스터 5종 패키지 (1시간)',
    ],
    jackpots: [
      '아이템 품질 재굴림권 (2%)',
      '접두사 수치 재굴림권 (5%)',
      '창고 슬롯 영구 +1 (1%)',
      '유니크 무작위 추첨권 (1%)',
    ],
  },
];

function fmt(v: string | number): string {
  const n = typeof v === 'string' ? BigInt(v) : BigInt(Math.floor(Number(v)));
  return n.toLocaleString();
}

export function GuildBossScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
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

  async function handlePractice() {
    if (!active || !state || state.activeRun) return;
    setBusy(true);
    try {
      await api(`/guild-boss/practice/${active.id}`, { method: 'POST' });
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
  if (err) return <div style={{ padding: 24, color: '#e55' }}>오류: {err}</div>;
  if (!state) return <div style={{ padding: 24 }}>불러오는 중...</div>;

  const boss = state.boss;
  const activeRun = state.activeRun;
  const dailyDmg = BigInt(state.dailyDamageTotal || '0');

  const bossImageKey = BOSS_IMAGE_KEY[boss.name] ?? 'boss_dark';

  return (
    <div style={{
      padding: 20, maxWidth: 960, margin: '0 auto', color: '#e8e2d0',
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, rgba(218,165,32,0.06), transparent 60%)',
    }}>
      {/* 상단 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontSize: 11, letterSpacing: 2, color: '#daa520',
            textTransform: 'uppercase', fontWeight: 700,
          }}>GUILD BOSS</span>
          <span style={{ fontSize: 10, color: '#6a6258' }}>길드 전용 레이드</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/guild-boss-shop')} style={{ ...navButtonStyle(), borderColor: '#daa520', color: '#daa520' }}>메달 상점</button>
          <button onClick={() => navigate('/guild')} style={navButtonStyle()}>← 길드로</button>
        </div>
      </div>

      {/* 히어로 배너 — 오늘의 보스 */}
      <div style={{
        position: 'relative', overflow: 'hidden', marginBottom: 22,
        padding: '24px 28px',
        background: 'linear-gradient(135deg, #1a1209 0%, #0d0805 50%, #1a0d0a 100%)',
        border: '1px solid #3a2a15',
        boxShadow: '0 8px 30px rgba(0,0,0,0.6), inset 0 0 60px rgba(218,165,32,0.08)',
      }}>
        {/* 배경 글로우 */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 280, height: 280,
          background: 'radial-gradient(circle, rgba(218,165,32,0.15) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative' }}>
          <div style={{
            width: 96, height: 96, flexShrink: 0,
            border: '2px solid #daa520',
            background: 'linear-gradient(180deg, rgba(218,165,32,0.12), rgba(0,0,0,0.4))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(218,165,32,0.4), inset 0 0 20px rgba(0,0,0,0.6)',
          }}>
            <img src={`/images/monsters/${bossImageKey}.png`} alt={boss.name}
              width={72} height={72} style={{ imageRendering: 'pixelated' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, color: '#c97e3a', marginBottom: 4,
              letterSpacing: 3, fontWeight: 700, textTransform: 'uppercase',
            }}>
              {WEEKDAY_LABEL[boss.weekday]}요일의 보스
            </div>
            <div style={{
              fontSize: 32, fontWeight: 900, letterSpacing: 1,
              background: 'linear-gradient(180deg, #ffd66b 0%, #daa520 60%, #8a6510 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              textShadow: '0 0 30px rgba(218,165,32,0.3)',
              marginBottom: 4,
            }}>
              {boss.name}
            </div>
            <div style={{ fontSize: 12, color: '#9a9180', marginBottom: 10, fontStyle: 'italic' }}>
              {boss.appearance}
            </div>
            <div style={{ fontSize: 13, color: '#d8cfb8', lineHeight: 1.5 }}>
              {boss.description}
            </div>
          </div>
        </div>
        {/* 특성 배지 */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          {boss.element_immune && <BossTag color="#6688aa" label={`${ELEMENT_LABEL[boss.element_immune]} 면역`} />}
          {boss.element_weak && <BossTag color="#66ccff" label={`${ELEMENT_LABEL[boss.element_weak]} 약점 +${boss.weak_amp_pct}%`} />}
          {boss.dot_immune && <BossTag color="#aa66cc" label="도트 면역" />}
          {boss.hp_recover_pct > 0 && <BossTag color="#66dd66" label={`60초마다 HP ${boss.hp_recover_pct}% 회복`} />}
          {boss.random_weakness && <BossTag color="#ffaa44" label="약점 원소 랜덤" />}
          {boss.alternating_immune && <BossTag color="#ff6666" label="ATK / MATK 면역 교대" />}
        </div>
      </div>

      {/* 상태 타일 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        <StatTile label="남은 입장키" value={`${state.keysRemaining}`} sub="/ 2" accent="#daa520" />
        <StatTile label="내 일일 누적" value={fmt(dailyDmg.toString())} accent="#66ccff" />
        <StatTile label="보유 메달" value={state.guildMedals.toLocaleString()} accent="#ffd700" />
        <StatTile
          label="활성 입장"
          value={activeRun ? '진행 중' : '대기'}
          accent={activeRun ? '#66dd66' : '#666'}
        />
      </div>

      {/* 길드 공용 상자 — 보상 내역 */}
      <SectionTitle text="길드 공용 상자 — 보상 내역" subtext="한 명이 임계값 달성 시 길드 전원이 동일 상자 수령" />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
        marginBottom: 22,
      }}>
        {GUILD_TIER_MILESTONES_BN.map((m) => {
          const passed = (state.guildDaily.global_chest_milestones & m.bit) !== 0;
          return (
            <div key={m.bit} style={{
              padding: '16px 14px',
              border: `1px solid ${passed ? m.color : '#2a2824'}`,
              background: passed
                ? `linear-gradient(180deg, ${m.color}22 0%, ${m.color}05 100%)`
                : 'linear-gradient(180deg, #141211 0%, #0a0908 100%)',
              position: 'relative', overflow: 'hidden',
              boxShadow: passed ? `0 0 24px ${m.color}33, inset 0 0 20px ${m.color}14` : 'none',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* 헤더 */}
              <div style={{ marginBottom: 12, textAlign: 'center' }}>
                <div style={{
                  fontSize: 10, letterSpacing: 2, color: passed ? m.color : '#5a5852',
                  textTransform: 'uppercase', fontWeight: 700, marginBottom: 4,
                }}>
                  {m.label} 상자
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 900,
                  color: passed ? m.color : '#4a4845',
                  textShadow: passed ? `0 0 12px ${m.color}80` : 'none',
                  letterSpacing: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {m.threshold}
                </div>
                <div style={{
                  fontSize: 9, color: passed ? '#fff' : '#3a3835',
                  letterSpacing: 1.5, fontWeight: 700, marginTop: 2,
                }}>
                  {passed ? '오늘 지급 완료' : '미달성'}
                </div>
              </div>

              {/* 확정 보상 */}
              <div style={{
                fontSize: 9, letterSpacing: 1.5, color: passed ? m.color : '#6a6258',
                textTransform: 'uppercase', fontWeight: 700,
                borderBottom: `1px solid ${passed ? m.color + '40' : '#2a2824'}`,
                paddingBottom: 4, marginBottom: 6,
              }}>
                확정 보상
              </div>
              <ul style={{
                listStyle: 'none', padding: 0, margin: 0, marginBottom: 10,
                fontSize: 11, lineHeight: 1.7, color: '#c8bfa8',
              }}>
                {m.confirmed.map((r, i) => (
                  <li key={i} style={{ paddingLeft: 10, position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 0, top: 7, width: 4, height: 4,
                      background: passed ? m.color : '#4a4845',
                    }} />
                    {r}
                  </li>
                ))}
              </ul>

              {/* 잭팟 보상 */}
              <div style={{
                fontSize: 9, letterSpacing: 1.5, color: passed ? '#ffe066' : '#6a6258',
                textTransform: 'uppercase', fontWeight: 700,
                borderBottom: `1px solid ${passed ? '#ffe06640' : '#2a2824'}`,
                paddingBottom: 4, marginBottom: 6,
              }}>
                잭팟 (확률)
              </div>
              <ul style={{
                listStyle: 'none', padding: 0, margin: 0,
                fontSize: 11, lineHeight: 1.7, color: '#b5a780',
              }}>
                {m.jackpots.map((r, i) => (
                  <li key={i} style={{ paddingLeft: 10, position: 'relative' }}>
                    <span style={{
                      position: 'absolute', left: 0, top: 6, color: passed ? '#ffe066' : '#6a6258',
                      fontWeight: 700,
                    }}>◆</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* 보스 처치 안내 */}
      <div style={{
        padding: '14px 16px', marginBottom: 22,
        border: '1px solid #c92a2a',
        background: 'linear-gradient(180deg, rgba(201,42,42,0.10) 0%, rgba(201,42,42,0.03) 100%)',
        boxShadow: '0 0 24px rgba(201,42,42,0.18), inset 0 0 20px rgba(201,42,42,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: 2, color: '#ff6666', fontWeight: 800,
            textTransform: 'uppercase', marginBottom: 4,
          }}>보스 처치</div>
          <div style={{ fontSize: 13, color: '#f0d0d0', fontWeight: 700 }}>
            길드 누적 딜 50억 달성 시 — 길드원 전원 메달 +1000 지급
          </div>
          <div style={{ fontSize: 11, color: '#a08080', marginTop: 2 }}>
            황금상자(10억)와는 별개로 일일 1회 지급됩니다.
          </div>
        </div>
        <div style={{
          fontSize: 22, fontWeight: 900, color: '#ffd0d0',
          padding: '6px 14px', border: '1px solid #c92a2a22',
          background: 'rgba(201,42,42,0.15)',
        }}>+1000</div>
      </div>

      {/* 길드 랭킹 */}
      {rankings.length > 0 && (
        <>
          <SectionTitle
            text="오늘의 길드 랭킹"
            subtext={`TOP ${Math.min(20, rankings.length)}`}
          />
          <div style={{
            marginBottom: 22, border: '1px solid #2a2824',
            background: 'linear-gradient(180deg, #141211 0%, #0a0908 100%)',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '50px 1fr 160px 200px',
              gap: 8, fontSize: 10, color: '#6a6258', padding: '10px 14px',
              borderBottom: '1px solid #2a2824',
              textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700,
            }}>
              <span>순위</span>
              <span>길드</span>
              <span style={{ textAlign: 'right' }}>누적 데미지</span>
              <span>MVP</span>
            </div>
            {rankings.map((g, idx) => {
              const rankColor = idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#c97e3a' : '#6a6258';
              const rowAccent = idx < 3 ? `${rankColor}0d` : 'transparent';
              return (
                <div key={g.guildId} style={{
                  display: 'grid', gridTemplateColumns: '50px 1fr 160px 200px',
                  gap: 8, fontSize: 13, padding: '12px 14px',
                  borderBottom: '1px solid #1f1d1a',
                  alignItems: 'center',
                  background: rowAccent,
                  transition: 'background 0.2s',
                }}>
                  <span style={{
                    color: rankColor, fontWeight: 900, fontSize: 15,
                    textShadow: idx < 3 ? `0 0 8px ${rankColor}80` : 'none',
                  }}>
                    {idx + 1}
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {g.guildName}
                    <span style={{ fontSize: 10, color: '#6a6258', marginLeft: 6, fontWeight: 400 }}>
                      {g.memberCount}명
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', color: '#e8e2d0', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(g.totalDamage)}
                  </span>
                  <span style={{ fontSize: 12 }}>
                    {g.mvp ? (
                      <>
                        <span style={{ color: '#ffd700', fontWeight: 700 }}>◆ {g.mvp.name}</span>
                        <span style={{ color: '#6a6258', marginLeft: 4 }}>({fmt(g.mvp.damage)})</span>
                      </>
                    ) : <span style={{ color: '#444' }}>—</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 활성 run 또는 입장 */}
      {activeRun ? (
        <div style={{
          padding: 20,
          background: 'linear-gradient(180deg, #0e1a0e 0%, #050a05 100%)',
          border: '1px solid #66dd66',
          boxShadow: '0 0 30px rgba(102,221,102,0.15), inset 0 0 30px rgba(102,221,102,0.05)',
        }}>
          <div style={{
            fontSize: 11, letterSpacing: 2, color: '#66dd66',
            textTransform: 'uppercase', fontWeight: 700, marginBottom: 8,
          }}>
            IN COMBAT · 진행 중
          </div>
          <div style={{
            fontSize: 28, fontWeight: 900, marginBottom: 16,
            color: '#d8f8d8', textShadow: '0 0 20px rgba(102,221,102,0.4)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmt(activeRun.total_damage)}
            <span style={{ fontSize: 12, color: '#6a9a6a', marginLeft: 10, fontWeight: 400 }}>
              누적 데미지
            </span>
          </div>
          <ProgressBars damage={BigInt(activeRun.total_damage)} />
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button onClick={() => handleExit('exit')} disabled={busy} style={{
              ...navButtonStyle(true), padding: '12px 24px', fontSize: 14, flex: 1,
            }}>
              퇴장 · 상자 수령
            </button>
            <button onClick={loadState} disabled={busy} style={navButtonStyle()}>
              새로고침
            </button>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: '#5a7a5a', lineHeight: 1.6 }}>
            자동 전투로 보스를 공격 중입니다. 퇴장 버튼을 누르기 전까지 계속 진행되며, 사망 시 자동 종료됩니다.
          </div>
        </div>
      ) : (
        <div style={{
          padding: '30px 20px', textAlign: 'center',
          background: 'linear-gradient(180deg, #1a1612 0%, #0a0805 100%)',
          border: '1px solid #3a2a15',
          boxShadow: 'inset 0 0 40px rgba(218,165,32,0.06)',
        }}>
          <div style={{
            fontSize: 10, letterSpacing: 3, color: '#6a6258',
            textTransform: 'uppercase', marginBottom: 14,
          }}>
            준비 완료
          </div>
          <button
            onClick={handleEnter}
            disabled={busy || state.keysRemaining <= 0}
            style={{
              padding: '18px 48px', fontSize: 16, fontWeight: 900,
              letterSpacing: 2, textTransform: 'uppercase',
              background: state.keysRemaining > 0
                ? 'linear-gradient(180deg, #ffd66b 0%, #daa520 60%, #a67d1a 100%)'
                : '#3a3835',
              color: state.keysRemaining > 0 ? '#1a0f00' : '#6a6258',
              border: state.keysRemaining > 0 ? '1px solid #ffd66b' : '1px solid #555',
              cursor: state.keysRemaining > 0 ? 'pointer' : 'not-allowed',
              boxShadow: state.keysRemaining > 0
                ? '0 0 30px rgba(218,165,32,0.5), inset 0 0 20px rgba(255,255,255,0.2)'
                : 'none',
              transition: 'transform 0.1s',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {state.keysRemaining > 0 ? '입장하기' : '입장키 없음'}
          </button>
          {state.keysRemaining > 0 && (
            <div style={{ fontSize: 11, color: '#6a6258', marginTop: 12 }}>
              입장 시 입장키 1개 소모 · 사망하면 상자 수령 후 마을로 귀환
            </div>
          )}
          {/* 연습 모드 버튼 — 키 소모 없음, 딜 누적 없음, 순수 테스트 */}
          <div style={{ marginTop: 18 }}>
            <button
              onClick={handlePractice}
              disabled={busy}
              style={{
                padding: '12px 30px', fontSize: 13, fontWeight: 700,
                letterSpacing: 1,
                background: 'linear-gradient(180deg, #4a5a7a 0%, #2a3a5a 100%)',
                color: '#d8e0f0',
                border: '1px solid #5a7aa0',
                cursor: 'pointer',
                borderRadius: 2,
                boxShadow: '0 0 12px rgba(90,122,160,0.25), inset 0 0 10px rgba(255,255,255,0.05)',
              }}
            >연습 모드 (키 소모 없음)</button>
            <div style={{ fontSize: 10, color: '#5a6888', marginTop: 8 }}>
              보상·딜 누적 없이 보스와 전투 테스트만 가능
            </div>
          </div>
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
            {exitResult.chestDelivered && exitResult.rewardTier && (
              <div style={{ marginBottom: 8, padding: 12, background: '#0e0c0a', border: '1px solid #daa520' }}>
                <div style={{ color: '#ffe066', fontWeight: 700, marginBottom: 6 }}>
                  {tierLabel(exitResult.rewardTier)}가 우편함으로 전송되었습니다.
                </div>
                <div style={{ fontSize: 12, color: '#bbb' }}>
                  우편함에서 수령 후 인벤토리에서 상자를 사용하면 보상이 지급됩니다.
                </div>
              </div>
            )}
            {exitResult.guildTiersGranted.length > 0 && (
              <div style={{ color: '#66dd66', marginBottom: 8 }}>
                길드 전원 지급 티어: {exitResult.guildTiersGranted.map(tierLabel).join(', ')} (우편함 확인)
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

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(180deg, #141211 0%, #0a0908 100%)',
      border: '1px solid #2a2824',
      borderLeft: `3px solid ${accent}`,
      position: 'relative',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.5, color: '#6a6258',
        textTransform: 'uppercase', fontWeight: 700, marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: accent, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: 11, color: '#6a6258' }}>{sub}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ text, subtext }: { text: string; subtext?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      marginBottom: 10, paddingBottom: 6,
      borderBottom: '1px solid #2a2824',
    }}>
      <span style={{
        fontSize: 13, fontWeight: 700, color: '#daa520',
        letterSpacing: 1.5, textTransform: 'uppercase',
      }}>
        {text}
      </span>
      {subtext && (
        <span style={{ fontSize: 10, color: '#6a6258', letterSpacing: 1 }}>
          {subtext}
        </span>
      )}
    </div>
  );
}

function BossTag({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      fontSize: 10, letterSpacing: 1, fontWeight: 700,
      padding: '4px 10px',
      border: `1px solid ${color}80`,
      color,
      background: `${color}15`,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
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
    padding: '10px 18px', fontSize: 12, fontWeight: 700,
    letterSpacing: 1.5, textTransform: 'uppercase',
    background: primary ? 'linear-gradient(180deg, #ffd66b, #daa520)' : 'transparent',
    color: primary ? '#1a0f00' : '#daa520',
    border: '1px solid #daa520',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}
