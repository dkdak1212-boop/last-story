import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface RankRow { rank: number; id: number; name: string; className: string; level: number; wins: number; losses: number; elo: number }
interface Opponent { id: number; name: string; className: string; level: number; elo: number; onCooldown: boolean; hasDefense: boolean }
interface MyStats { wins: number; losses: number; elo: number; dailyAttacks: number; dailyLimit: number }
interface DefenseLoadout {
  exists: boolean;
  stats?: { atk: number; matk: number; def: number; mdef: number; maxHp: number; spd: number; cri: number; dodge: number; accuracy: number };
  skillCount?: number;
  equipment?: { slot: string; name: string; grade: string; enhanceLevel: number }[];
  updatedAt?: string;
}
interface BattleResult { winner: 'attacker' | 'defender'; log: string[]; eloChange: number; goldGained: number; turns: number }
interface HistoryRow { id: number; amAttacker: boolean; attackerName: string; defenderName: string; won: boolean; eloChange: number; log: string[]; createdAt: string }
interface InspectData {
  name: string; className: string; level: number; maxHp: number;
  stats: { atk: number; matk: number; def: number; mdef: number; spd: number; cri: number; dodge: number; accuracy: number } | null;
  pvp: { wins: number; losses: number; elo: number };
  equipment: { slot: string; name: string; enhance: number }[];
  guild: string | null;
  skills: string[];
  defenseMode?: 'snapshot' | 'live';
  snapshotUpdatedAt?: string | null;
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
  const navigate = useNavigate();
  const [tab, setTab] = useState<'opponents' | 'ranking' | 'history' | 'defense'>('opponents');
  const [defense, setDefense] = useState<DefenseLoadout | null>(null);
  const [defenseBusy, setDefenseBusy] = useState(false);
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
  async function loadDefense() {
    if (!active) return;
    setDefense(await api<DefenseLoadout>(`/pvp/defense/${active.id}`));
  }

  useEffect(() => { loadStats(); loadDefense(); }, [active?.id]);
  useEffect(() => {
    if (tab === 'opponents') loadOpponents();
    if (tab === 'ranking') loadRanking();
    if (tab === 'history') loadHistory();
    if (tab === 'defense') loadDefense();
  }, [tab, active?.id]);

  async function attack(defenderId: number, _defenderName: string) {
    if (!active) return;
    try {
      const r = await api<{ battleId: string }>('/pvp/attack', {
        method: 'POST',
        body: JSON.stringify({ attackerId: active.id, defenderId }),
      });
      navigate(`/pvp-combat/${r.battleId}`);
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  async function attackSkip(defenderId: number, defenderName: string) {
    if (!active) return;
    if (!confirm(`${defenderName} 와 즉시 스킵 전투하시겠습니까?\n전투화면 없이 결과만 표시됩니다.`)) return;
    try {
      const r = await api<BattleResult>('/pvp/attack-skip', {
        method: 'POST',
        body: JSON.stringify({ attackerId: active.id, defenderId }),
      });
      setResult({ ...r, opponent: defenderName });
      loadStats(); loadOpponents();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  async function saveDefense() {
    if (!active || defenseBusy) return;
    if (!confirm('현재 장비·스킬 상태로 방어 세팅을 저장합니다. 이후 PvE 에서 장비 바꿔도 저장된 세팅은 그대로 유지됩니다.')) return;
    setDefenseBusy(true);
    try {
      await api(`/pvp/defense/${active.id}/save`, { method: 'POST' });
      await loadDefense();
      alert('방어 세팅 저장 완료');
    } catch (e) { alert(e instanceof Error ? e.message : '저장 실패'); }
    finally { setDefenseBusy(false); }
  }
  async function clearDefense() {
    if (!active || defenseBusy) return;
    if (!confirm('방어 세팅을 삭제하면 공격 받지 않게 됩니다 (PvP 목록에서 제외). 진행하시겠습니까?')) return;
    setDefenseBusy(true);
    try {
      await api(`/pvp/defense/${active.id}/clear`, { method: 'POST' });
      await loadDefense();
    } catch (e) { alert(e instanceof Error ? e.message : '삭제 실패'); }
    finally { setDefenseBusy(false); }
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={tab === 'opponents' ? 'primary' : ''} onClick={() => setTab('opponents')}>상대 찾기</button>
        <button className={tab === 'ranking' ? 'primary' : ''} onClick={() => setTab('ranking')}>랭킹</button>
        <button className={tab === 'history' ? 'primary' : ''} onClick={() => setTab('history')}>전투 기록</button>
        <button className={tab === 'defense' ? 'primary' : ''} onClick={() => setTab('defense')}>
          방어 설정 {!defense?.exists && <span style={{ color: '#ff8844' }}>⚠️</span>}
        </button>
      </div>

      {result && <BattleResultModal result={result} onClose={() => setResult(null)} />}
      {inspect && <InspectModal data={inspect} onClose={() => setInspect(null)} />}

      {tab === 'opponents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              ELO ±{400} 범위 · 최대 30명
            </span>
            <button onClick={loadOpponents} style={{
              fontSize: 12, padding: '4px 12px',
              background: 'var(--bg-panel)', color: 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: 3, cursor: 'pointer',
            }}>🔄 새로고침</button>
          </div>
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
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {!o.hasDefense && <span style={{ fontSize: 10, color: '#ff8844' }} title="방어자가 세팅 저장 안함 — 현재 PvE 상태로 방어">⚠️ 방어 미설정 (라이브)</span>}
                <button onClick={() => loadInspect(o.id)} disabled={inspectLoading} style={{ fontSize: 12 }}>정보</button>
                <button onClick={() => attackSkip(o.id, o.name)} disabled={o.onCooldown}
                  title="전투화면 생략 · 즉시 시뮬 결과"
                  style={{ fontSize: 12, background: 'var(--bg-panel)', color: '#aaa', border: '1px solid #666' }}>
                  ⏩ 스킵
                </button>
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
          {history.map(h => {
            const gold = h.won ? 500 : 50;
            return (
              <div key={h.id} style={{
                padding: 10, background: 'var(--bg-panel)',
                borderLeft: `3px solid ${h.won ? 'var(--success)' : 'var(--danger)'}`,
                border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{
                      display: 'inline-block', width: 40, textAlign: 'center', padding: '2px 0',
                      background: h.amAttacker ? 'rgba(100,180,255,0.15)' : 'rgba(255,180,100,0.15)',
                      color: h.amAttacker ? '#6bb4ff' : '#ffb060',
                      fontSize: 10, fontWeight: 700, borderRadius: 3, marginRight: 6,
                    }}>{h.amAttacker ? '공격' : '방어'}</span>
                    <span style={{ color: h.won ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                      {h.won ? '승리' : '패배'}
                    </span>
                    <span style={{ marginLeft: 8 }}>
                      vs {h.amAttacker ? h.defenderName : h.attackerName}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11 }}>
                    <div>
                      <span style={{ color: h.won ? 'var(--success)' : 'var(--danger)' }}>
                        ELO {h.won ? '+' : '-'}{Math.abs(h.eloChange)}
                      </span>
                      <span style={{ marginLeft: 8, color: 'var(--accent)' }}>+{gold}G</span>
                    </div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>
                      {new Date(h.createdAt).toLocaleString('ko-KR')}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'defense' && (
        <div>
          <div style={{ marginBottom: 10, padding: 10, background: 'var(--bg-panel)', border: '1px solid #daa520', fontSize: 12, color: '#ccc' }}>
            💡 <b style={{ color: '#daa520' }}>방어 세팅</b>은 현재 장비/스킬/스탯 상태의 <b>스냅샷</b>이에요.
            저장 후에는 PvE에서 자유롭게 장비 바꿔도 PvP 방어는 스냅샷 그대로 사용됩니다.
            <br />
            세팅을 저장하지 않으면 공격받을 때 마다 <b>현재 PvE 상태(라이브)</b>로 방어합니다 —
            장비/스킬 바꾸면 즉시 반영되므로 의도치 않은 약점이 노출될 수 있어요.
          </div>

          {defense?.exists ? (
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid #4ca74c' }}>
              <div style={{ fontWeight: 700, color: '#4ca74c', marginBottom: 8 }}>✅ 방어 세팅 저장됨</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
                저장 시각: {defense.updatedAt && new Date(defense.updatedAt).toLocaleString('ko-KR')}
              </div>
              {defense.stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, fontSize: 12, marginBottom: 10 }}>
                  <div>HP: <b>{defense.stats.maxHp}</b></div>
                  <div>ATK: <b>{defense.stats.atk}</b></div>
                  <div>MATK: <b>{defense.stats.matk}</b></div>
                  <div>DEF: <b>{defense.stats.def}</b></div>
                  <div>MDEF: <b>{defense.stats.mdef}</b></div>
                  <div>SPD: <b>{defense.stats.spd}</b></div>
                  <div>CRI: <b>{defense.stats.cri}</b></div>
                  <div>회피: <b>{defense.stats.dodge}</b></div>
                  <div>명중: <b>{defense.stats.accuracy}</b></div>
                </div>
              )}
              {defense.equipment && (
                <div style={{ marginBottom: 10, fontSize: 11 }}>
                  <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>장비 {defense.equipment.length}개 · 스킬 {defense.skillCount}개</div>
                  {defense.equipment.map((e, i) => (
                    <span key={i} style={{ marginRight: 8, color: e.grade === 'unique' ? '#ff8800' : e.grade === 'legendary' ? '#ff4488' : '#aaa' }}>
                      {e.name}{e.enhanceLevel > 0 && `+${e.enhanceLevel}`}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveDefense} disabled={defenseBusy} className="primary">다시 저장 (현재 상태로)</button>
                <button onClick={clearDefense} disabled={defenseBusy}>삭제</button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 14, background: 'var(--bg-panel)', border: '1px solid #ff8844' }}>
              <div style={{ fontWeight: 700, color: '#ff8844', marginBottom: 8 }}>⚠️ 방어 세팅 미설정 — 라이브 방어 중</div>
              <div style={{ fontSize: 12, color: '#ccc', marginBottom: 10 }}>
                현재는 공격받을 때마다 <b>현재 PvE 상태 그대로</b> 방어합니다.
                장비/스킬을 바꾸면 즉시 반영되기 때문에 원치 않는 약점이 노출될 수 있어요.
                <br />
                고정 세팅으로 방어하려면 아래 버튼으로 스냅샷 저장하세요.
              </div>
              <button onClick={saveDefense} disabled={defenseBusy} className="primary">현재 상태로 방어 세팅 저장</button>
            </div>
          )}
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

        {/* 방어 모드 라벨 — 스냅샷 / 라이브 */}
        <div style={{
          padding: '6px 10px', marginBottom: 10, fontSize: 11, lineHeight: 1.5,
          background: data.defenseMode === 'snapshot' ? 'rgba(102,204,102,0.10)' : 'rgba(255,136,68,0.10)',
          border: `1px solid ${data.defenseMode === 'snapshot' ? '#66cc66' : '#ff8844'}`,
          borderRadius: 4,
        }}>
          {data.defenseMode === 'snapshot' ? (
            <>
              <span style={{ color: '#66cc66', fontWeight: 700 }}>📸 방어 스냅샷 적용</span>
              <span style={{ color: 'var(--text-dim)' }}> — 아래 정보는 저장된 세팅 기준 (실제 전투도 동일).
                {data.snapshotUpdatedAt && ` 저장: ${new Date(data.snapshotUpdatedAt).toLocaleString('ko-KR')}`}
              </span>
            </>
          ) : (
            <>
              <span style={{ color: '#ff8844', fontWeight: 700 }}>⚡ 라이브 방어</span>
              <span style={{ color: 'var(--text-dim)' }}> — 방어자가 세팅 미저장. 공격 시점 PvE 상태로 방어합니다.</span>
            </>
          )}
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
