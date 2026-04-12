import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface RankRow { rank: number; id: number; name: string; className: string; level: number; wins: number; losses: number; elo: number }
interface Opponent { id: number; name: string; className: string; level: number; elo: number; onCooldown: boolean }
interface MyStats { wins: number; losses: number; elo: number; dailyAttacks: number; dailyLimit: number }
interface BattleResult { winner: 'attacker' | 'defender'; log: string[]; eloChange: number; goldGained: number; turns: number }
interface HistoryRow { id: number; amAttacker: boolean; attackerName: string; defenderName: string; won: boolean; eloChange: number; log: string[]; createdAt: string }
interface InspectData {
  name: string; className: string; level: number; maxHp: number;
  stats: { atk: number; matk: number; def: number; mdef: number; spd: number; cri: number; dodge: number; accuracy: number } | null;
  pvp: { wins: number; losses: number; elo: number };
  equipment: { slot: string; name: string; enhance: number }[];
  guild: string | null;
  skills: string[];
}

const CLASS_LABEL: Record<string, string> = {
  warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사',
};

function getEloGrade(elo: number): { name: string; color: string } {
  if (elo >= 2000) return { name: '챌린저', color: '#ff4444' };
  if (elo >= 1600) return { name: '다이아', color: '#44ddff' };
  if (elo >= 1400) return { name: '플래티넘', color: '#22ccaa' };
  if (elo >= 1200) return { name: '골드', color: '#ffcc00' };
  if (elo >= 1000) return { name: '실버', color: '#aaaaaa' };
  if (elo >= 800) return { name: '브론즈', color: '#cc8844' };
  return { name: '아이언', color: '#666666' };
}

export function PvPScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [tab, setTab] = useState<'opponents' | 'ranking' | 'history'>('opponents');
  const [stats, setStats] = useState<MyStats | null>(null);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [result, setResult] = useState<(BattleResult & { opponent: string }) | null>(null);
  const [inspect, setInspect] = useState<InspectData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  async function loadInspect(targetId: number) {
    setInspectLoading(true);
    try {
      const data = await api<InspectData>(`/pvp/inspect/${targetId}`);
      setInspect(data);
    } catch { alert('정보 조회 실패'); }
    setInspectLoading(false);
  }

  async function loadStats() {
    if (!active) return;
    setStats(await api<MyStats>(`/pvp/stats/${active.id}`));
  }
  async function loadOpponents() {
    if (!active) return;
    setOpponents(await api<Opponent[]>(`/pvp/opponents/${active.id}`));
  }
  async function loadRanking() {
    setRanking(await api<RankRow[]>('/pvp/ranking'));
  }
  async function loadHistory() {
    if (!active) return;
    setHistory(await api<HistoryRow[]>(`/pvp/history/${active.id}`));
  }

  useEffect(() => { loadStats(); }, [active?.id]);
  useEffect(() => {
    if (tab === 'opponents') loadOpponents();
    if (tab === 'ranking') loadRanking();
    if (tab === 'history') loadHistory();
  }, [tab, active?.id]);

  async function attack(defenderId: number, defenderName: string) {
    if (!active) return;
    try {
      const r = await api<BattleResult>('/pvp/attack', {
        method: 'POST',
        body: JSON.stringify({ attackerId: active.id, defenderId }),
      });
      setResult({ ...r, opponent: defenderName });
      await refreshActive();
      loadStats(); loadOpponents();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: 'var(--accent)' }}>PvP 아레나</h2>
        {stats && (() => {
          const grade = getEloGrade(stats.elo);
          return (
            <div style={{ display: 'flex', gap: 16, fontSize: 13, alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: grade.color, fontSize: 15 }}>{grade.name}</div>
              <div><span style={{ color: 'var(--text-dim)' }}>ELO</span> <b style={{ color: 'var(--accent)' }}>{stats.elo}</b></div>
              <div><span style={{ color: 'var(--text-dim)' }}>전적</span> <b>{stats.wins}승 {stats.losses}패</b></div>
              <div><span style={{ color: 'var(--text-dim)' }}>일일</span> <b>{stats.dailyAttacks}/{stats.dailyLimit}</b></div>
            </div>
          );
        })()}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button className={tab === 'opponents' ? 'primary' : ''} onClick={() => setTab('opponents')}>상대 찾기</button>
        <button className={tab === 'ranking' ? 'primary' : ''} onClick={() => setTab('ranking')}>랭킹</button>
        <button className={tab === 'history' ? 'primary' : ''} onClick={() => setTab('history')}>전투 기록</button>
      </div>

      {result && <BattleResultModal result={result} onClose={() => setResult(null)} />}
      {inspect && <InspectModal data={inspect} onClose={() => setInspect(null)} />}

      {tab === 'opponents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {opponents.length === 0 && <div style={{ color: 'var(--text-dim)' }}>ELO 비슷한 상대가 없다.</div>}
          {opponents.map(o => (
            <div key={o.id} style={{
              padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 700 }}>{o.name}</span>
                <span style={{ color: 'var(--text-dim)', marginLeft: 10, fontSize: 13 }}>
                  Lv.{o.level} {CLASS_LABEL[o.className]} · ELO {o.elo}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => loadInspect(o.id)} disabled={inspectLoading} style={{ fontSize: 12 }}>정보</button>
                <button className="primary" onClick={() => attack(o.id, o.name)} disabled={o.onCooldown}>
                  {o.onCooldown ? '쿨다운' : '공격'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ranking' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ranking.map(r => (
            <div key={r.id} style={{
              padding: '10px 14px', background: 'var(--bg-panel)', border: '1px solid var(--border)',
              display: 'flex', gap: 12, alignItems: 'center',
            }}>
              <div style={{ width: 36, color: r.rank <= 3 ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 700 }}>#{r.rank}</div>
              <div style={{ flex: 1, fontWeight: 700 }}>{r.name}</div>
              <div style={{ width: 60, fontSize: 12, color: 'var(--text-dim)' }}>{CLASS_LABEL[r.className]}</div>
              <div style={{ width: 60, textAlign: 'right', fontSize: 13 }}>Lv.{r.level}</div>
              <div style={{ width: 50, textAlign: 'right', color: getEloGrade(r.elo).color, fontWeight: 700, fontSize: 11 }}>{getEloGrade(r.elo).name}</div>
              <div style={{ width: 60, textAlign: 'right', color: 'var(--accent)' }}>{r.elo}</div>
              <div style={{ width: 80, textAlign: 'right', fontSize: 12, color: 'var(--text-dim)' }}>{r.wins}승{r.losses}패</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {history.length === 0 && <div style={{ color: 'var(--text-dim)' }}>기록 없음</div>}
          {history.map(h => (
            <div key={h.id} style={{
              padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ color: h.won ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                  {h.won ? '승' : '패'}
                </span>
                <span style={{ marginLeft: 10 }}>
                  {h.amAttacker ? `→ ${h.defenderName}` : `← ${h.attackerName}`}
                </span>
                <span style={{ marginLeft: 10, color: 'var(--text-dim)', fontSize: 12 }}>
                  ELO {h.won ? '+' : '-'}{Math.abs(h.eloChange)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {new Date(h.createdAt).toLocaleString('ko-KR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BattleResultModal({ result, onClose }: { result: BattleResult & { opponent: string }; onClose: () => void }) {
  const won = result.winner === 'attacker';
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        width: 480, maxHeight: '80vh', padding: 24, background: 'var(--bg-panel)',
        border: `1px solid ${won ? 'var(--success)' : 'var(--danger)'}`, display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{ color: won ? 'var(--success)' : 'var(--danger)', marginBottom: 6 }}>
          {won ? '승리!' : '패배...'}
        </h2>
        <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 14 }}>
          vs {result.opponent} · {result.turns}턴 · ELO {won ? '+' : '-'}{result.eloChange} · +{result.goldGained}G
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', padding: 10, background: 'var(--bg)',
          border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 12,
        }}>
          {result.log.map((line, i) => (
            <div key={i} style={{ color: 'var(--text-dim)', marginBottom: 2 }}>{line}</div>
          ))}
        </div>
        <button className="primary" onClick={onClose} style={{ marginTop: 14 }}>확인</button>
      </div>
    </div>
  );
}

const SLOT_LABEL: Record<string, string> = {
  weapon: '무기', head: '머리', body: '갑옷', legs: '다리', feet: '신발', ring: '반지', necklace: '목걸이',
};

function InspectModal({ data, onClose }: { data: InspectData; onClose: () => void }) {
  const grade = getEloGrade(data.pvp.elo);
  const winRate = data.pvp.wins + data.pvp.losses > 0
    ? Math.round(data.pvp.wins / (data.pvp.wins + data.pvp.losses) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        width: 420, maxHeight: '85vh', overflowY: 'auto', padding: 20, background: 'var(--bg-panel)',
        border: '1px solid var(--accent)',
      }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{data.name}</span>
            <span style={{ color: 'var(--text-dim)', marginLeft: 8, fontSize: 13 }}>
              Lv.{data.level} {CLASS_LABEL[data.className]}
            </span>
          </div>
          {data.guild && <span style={{ fontSize: 12, color: 'var(--accent)' }}>[{data.guild}]</span>}
        </div>

        {/* PVP 전적 */}
        <div style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: grade.color }}>{grade.name} ({data.pvp.elo})</span>
            <span>{data.pvp.wins}승 {data.pvp.losses}패 ({winRate}%)</span>
          </div>
        </div>

        {/* 스탯 */}
        {data.stats && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, fontWeight: 700 }}>전투 스탯</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 12,
              padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div>HP <b style={{ color: '#66cc66' }}>{data.maxHp.toLocaleString()}</b></div>
              <div>SPD <b style={{ color: '#ffcc44' }}>{data.stats.spd}</b></div>
              <div>ATK <b style={{ color: '#ff6644' }}>{data.stats.atk}</b></div>
              <div>MATK <b style={{ color: '#6688ff' }}>{data.stats.matk}</b></div>
              <div>DEF <b>{data.stats.def}</b></div>
              <div>MDEF <b>{data.stats.mdef}</b></div>
              <div>CRI <b style={{ color: '#ff8800' }}>{data.stats.cri}%</b></div>
              <div>회피 <b>{data.stats.dodge}%</b></div>
            </div>
          </div>
        )}

        {/* 장비 */}
        {data.equipment.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, fontWeight: 700 }}>장비</div>
            <div style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12 }}>
              {data.equipment.map((eq, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: 'var(--text-dim)' }}>{SLOT_LABEL[eq.slot] || eq.slot}</span>
                  <span>{eq.name}{eq.enhance > 0 ? ` +${eq.enhance}` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 스킬 */}
        {data.skills.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4, fontWeight: 700 }}>등록 스킬</div>
            <div style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12 }}>
              {data.skills.join(' · ')}
            </div>
          </div>
        )}

        <button className="primary" onClick={onClose} style={{ width: '100%' }}>닫기</button>
      </div>
    </div>
  );
}
