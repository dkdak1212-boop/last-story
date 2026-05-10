import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { MonsterIcon } from '../components/ui/MonsterIcon';

interface DropInfo { name: string; grade: string; chance: number; minQty?: number; maxQty?: number; }
interface MonsterInfo {
  name: string; level: number; exp: number; gold: number; drops?: DropInfo[];
}
interface FieldData {
  id: number; name: string; requiredLevel: number; description: string;
  monsters: MonsterInfo[];
  ownerGuildName?: string | null;
}

const ENDLESS_FIELD_ID = 1000;

export function MapScreen() {
  const nav = useNavigate();
  const [fields, setFields] = useState<FieldData[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [riftExpiresAt, setRiftExpiresAt] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const active = useCharacterStore((s) => s.activeCharacter);
  // 시공의 균열 입장권 N장 일괄 소모 모달
  // riftModal — 시공균열 입장 모달. activeRemainSec: 활성 잔여(0=비활성), 활성 시 추가 연장 모드로 동작.
  const [riftModal, setRiftModal] = useState<{ owned: number; tickets: number; activeRemainSec: number } | null>(null);

  useEffect(() => {
    const url = active ? `/fields?characterId=${active.id}` : '/fields';
    api<FieldData[] | { fields: FieldData[]; riftRemainMs: number | null }>(url).then((res) => {
      if (Array.isArray(res)) {
        setFields(res);
        setRiftExpiresAt(0);
      } else {
        setFields(res.fields);
        setRiftExpiresAt(res.riftRemainMs && res.riftRemainMs > 0 ? Date.now() + res.riftRemainMs : 0);
      }
    }).catch(() => {});
  }, [active]);

  // 시공의 균열 카운트다운 — 1초 갱신 (만료시각 기준)
  useEffect(() => {
    if (riftExpiresAt <= 0) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [riftExpiresAt]);
  const riftLiveRemain = riftExpiresAt > 0 ? Math.max(0, riftExpiresAt - nowTick) : 0;

  async function enter(fieldId: number) {
    if (!active) return;
    if (fieldId === ENDLESS_FIELD_ID) {
      // 종언의 기둥은 별도 API 사용 (전용 진행/사망 로직)
      try {
        await api(`/endless/${active.id}/enter`, { method: 'POST' });
        nav('/combat');
      } catch (e) {
        alert(e instanceof Error ? e.message : '종언 입장 실패');
      }
      return;
    }
    // 시공의 균열(23) — 항상 모달 띄움 (비활성=새 진입, 활성=시간 연장).
    // 입장 1회당 N장 일괄 소모 → N×30분 추가 (활성 시엔 잔여시간 + N×30분).
    if (fieldId === 23) {
      const activeRemainSec = Math.floor(riftLiveRemain / 1000);
      try {
        const inv = await api<Array<{ item: { id: number }; quantity: number }>>(
          `/characters/${active.id}/inventory`
        );
        const owned = inv
          .filter(s => s.item.id === 855)
          .reduce((sum, s) => sum + (s.quantity || 0), 0);
        if (owned <= 0 && activeRemainSec === 0) {
          alert('차원의 통행증이 없습니다. 상점에서 구매 후 입장하세요.');
          return;
        }
        // 활성 + 통행증 0 = 그냥 무료 재입장 (모달 안 띄우고 plain 진입)
        if (owned <= 0 && activeRemainSec > 0) {
          await api(`/characters/${active.id}/enter-field`, {
            method: 'POST', body: JSON.stringify({ fieldId: 23 }),
          });
          nav('/combat');
          return;
        }
        setRiftModal({ owned, tickets: activeRemainSec > 0 ? 0 : 1, activeRemainSec });
      } catch {
        setRiftModal({ owned: 1, tickets: 1, activeRemainSec });
      }
      return;
    }
    try {
      await api(`/characters/${active.id}/enter-field`, {
        method: 'POST',
        body: JSON.stringify({ fieldId }),
      });
      nav('/combat');
    } catch (e) {
      alert(e instanceof Error ? e.message : '입장 실패');
    }
  }

  async function confirmRiftEnter() {
    if (!active || !riftModal) return;
    const N = Math.max(0, Math.min(riftModal.owned, riftModal.tickets));
    setRiftModal(null);
    try {
      await api(`/characters/${active.id}/enter-field`, {
        method: 'POST',
        // N=0 (활성 + 추가 사용 안 함) → riftTickets 생략 → 무료 재입장
        body: JSON.stringify(N > 0 ? { fieldId: 23, riftTickets: N } : { fieldId: 23 }),
      });
      nav('/combat');
    } catch (e) {
      alert(e instanceof Error ? e.message : '입장 실패');
    }
  }

  // 종언의 기둥은 fields API 가 반환하지만 monster_pool 비어있어 별도 표시 보강
  const allFields: FieldData[] = fields.map(f =>
    f.id === ENDLESS_FIELD_ID
      ? { ...f, name: '종언의 기둥', description: '무한 등반 도전. 100층마다 보스, 주간보상' }
      : f
  );

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>사냥터</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...allFields].sort((a, b) => {
          // 일반 사냥터(레벨 ASC) → 허수아비(레벨 ASC) → 종언의 기둥
          const rank = (f: FieldData) => {
            if (f.id === ENDLESS_FIELD_ID) return 2;
            if (f.name.startsWith('허수아비')) return 1;
            return 0;
          };
          const ra = rank(a), rb = rank(b);
          if (ra !== rb) return ra - rb;
          // 같은 그룹 내: 허수아비는 이름에 박힌 레벨, 그 외는 requiredLevel
          if (ra === 1) {
            const la = Number(a.name.match(/\d+/)?.[0] ?? 0);
            const lb = Number(b.name.match(/\d+/)?.[0] ?? 0);
            return la - lb;
          }
          return a.requiredLevel - b.requiredLevel;
        }).map((f) => {
          const locked = (active?.level ?? 1) < f.requiredLevel;
          const isOpen = expanded === f.id;
          return (
            <div key={f.id} style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              opacity: locked ? 0.5 : 1,
            }}>
              <div style={{
                padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer',
              }} onClick={() => setExpanded(isOpen ? null : f.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {f.name}
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 400 }}>
                      Lv.{f.requiredLevel}+
                    </span>
                    {f.id === 23 && riftLiveRemain > 0 && (() => {
                      const totalSec = Math.floor(riftLiveRemain / 1000);
                      const m = Math.floor(totalSec / 60);
                      const sec = totalSec % 60;
                      const lowTime = riftLiveRemain < 5 * 60_000;
                      return (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 3,
                          background: lowTime ? 'rgba(255,80,80,0.15)' : 'rgba(170,120,255,0.15)',
                          border: `1px solid ${lowTime ? '#ff5050' : '#a24bff'}`,
                          color: lowTime ? '#ff8888' : '#c97bff',
                          fontFamily: 'monospace',
                        }}>
                          ⌛ 잔여 {m.toString().padStart(2, '0')}:{sec.toString().padStart(2, '0')} (재입장 무료)
                        </span>
                      );
                    })()}
                    {f.id === 23 && riftLiveRemain === 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 3,
                        background: 'rgba(120,120,120,0.15)',
                        border: '1px solid #888',
                        color: '#bbb',
                      }}>
                        통행증 1장 필요
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>
                    {f.description}
                    {f.monsters.length > 0 && (
                      <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>
                        — {f.monsters.map(m => m.name).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{isOpen ? '▲' : '▼'}</span>
                  {f.id === ENDLESS_FIELD_ID && (
                    <button onClick={(e) => { e.stopPropagation(); nav('/endless-ranking'); }} style={{
                      background: 'transparent', color: '#c97bff',
                      border: '1px solid #c97bff', padding: '6px 12px',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 3,
                    }}>
                      랭킹
                    </button>
                  )}
                  <button className="primary" onClick={(e) => { e.stopPropagation(); enter(f.id); }} disabled={locked}>
                    {locked ? '잠김' : '입장'}
                  </button>
                </div>
              </div>

              {isOpen && f.monsters.length > 0 && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                  {f.monsters.map((m, mi) => (
                    <div key={mi} style={{
                      padding: '10px 0',
                      borderBottom: mi < f.monsters.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MonsterIcon name={m.name} size={24} />
                        <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{m.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Lv.{m.level}</span>
                        <span style={{ fontSize: 11, color: 'var(--success)' }}>+{m.exp.toLocaleString()}exp</span>
                        <span style={{ fontSize: 11, color: '#e0a040' }}>+{m.gold.toLocaleString()}G</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                    ※ 기본값 기준. 부스트·길드·이벤트·레벨차 페널티에 따라 실제 획득량은 달라집니다.
                  </div>
                  {/* 드랍 아이템 + 슬롯별 실제 확률 */}
                  {(() => {
                    // 같은 이름은 1개로 (몬스터 두 마리가 같은 드랍 테이블 가질 수 있음)
                    const dropMap = new Map<string, DropInfo>();
                    for (const m of f.monsters) for (const d of m.drops || []) {
                      if (!dropMap.has(d.name)) dropMap.set(d.name, d);
                    }
                    const drops = [...dropMap.values()];
                    if (drops.length === 0) return null;

                    return (
                      <>
                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 4 }}>
                          <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 6 }}>드랍 아이템 (1킬당 확률, 실제 적용)</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 10 }}>
                            {drops.map((d, i) => {
                              const isUnique = d.grade === 'unique';
                              return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  {isUnique ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <img src="/images/skills/spells/starburst.png" alt="" width={11} height={11} style={{ imageRendering: 'pixelated' }} />
                                      <span style={{
                                        fontWeight: 700,
                                        background: 'linear-gradient(90deg, #ff3b3b, #ff8c2a, #ffe135, #3bd96b, #3bc8ff, #6b5bff, #c452ff)',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        backgroundClip: 'text',
                                        filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.3))',
                                      }}>
                                        {d.name} [유니크]
                                      </span>
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-dim)' }}>{d.name}</span>
                                  )}
                                  <span style={{ color: isUnique ? '#ffb060' : '#88ccff', fontWeight: 700 }}>{isUnique ? (d.chance < 0.001 ? d.chance.toFixed(6) : d.chance.toFixed(4)) : d.chance.toFixed(2)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 4, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                          <div style={{ fontWeight: 700, color: 'var(--accent)' }}>접두사 등급 확률</div>
                          <div>
                            <span style={{ color: '#daa520' }}>T1 90%</span>{' · '}
                            <span style={{ color: '#5b8ecc' }}>T2 9%</span>{' · '}
                            <span style={{ color: '#b060cc' }}>T3 0.9%</span>{' · '}
                            <span style={{ color: '#ff4444' }}>T4 0.1%</span>
                          </div>
                          <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--accent)' }}>접두사 옵션 수</div>
                          <div>1옵 90% · 2옵 9% · 3옵 1%</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {riftModal && (
        <div onClick={() => setRiftModal(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-panel)', border: '2px solid #a24bff',
            borderRadius: 6, padding: 22, width: 'min(420px, 92vw)',
            boxShadow: '0 0 30px rgba(162,75,255,0.4)',
          }}>
            <h3 style={{ margin: '0 0 12px', color: '#c97bff', fontSize: 16 }}>⌛ 시공의 균열 {riftModal.activeRemainSec > 0 ? '시간 연장 / 재입장' : '입장'}</h3>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 14 }}>
              {riftModal.activeRemainSec > 0 ? (
                <>
                  현재 잔여: <b style={{ color: '#88c8ff' }}>{Math.floor(riftModal.activeRemainSec / 60)}분 {riftModal.activeRemainSec % 60}초</b><br/>
                  통행증 N장 추가 사용 시 <b style={{ color: '#c97bff' }}>잔여 + N×30분</b> 으로 연장. 0장 = 무료 재입장.
                </>
              ) : (
                <>
                  사용할 통행증 수만큼 영속 타이머가 한 번에 시작됩니다.<br/>
                  <span style={{ color: '#ff8888', fontWeight: 700 }}>· 환불 불가</span> · 사망/탭이동/재접속 무관 만료까지 동일 입장 무료 재진입 가능
                </>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>사용 통행증</span>
                <span style={{ color: '#c97bff', fontWeight: 700 }}>
                  {riftModal.tickets}장 / {riftModal.owned}장 보유
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setRiftModal(m => m && { ...m, tickets: Math.max(m.activeRemainSec > 0 ? 0 : 1, m.tickets - 1) })}
                  style={{ width: 30, padding: '4px 0', fontSize: 14, fontWeight: 700 }}>−</button>
                <input
                  type="range" min={riftModal.activeRemainSec > 0 ? 0 : 1} max={Math.max(1, riftModal.owned)} value={riftModal.tickets}
                  onChange={e => {
                    const minV = riftModal.activeRemainSec > 0 ? 0 : 1;
                    const v = Math.max(minV, Math.min(riftModal.owned, Number(e.target.value) || minV));
                    setRiftModal(m => m && { ...m, tickets: v });
                  }}
                  style={{ flex: 1, accentColor: '#a24bff' }}
                />
                <button onClick={() => setRiftModal(m => m && { ...m, tickets: Math.min(m.owned, m.tickets + 1) })}
                  style={{ width: 30, padding: '4px 0', fontSize: 14, fontWeight: 700 }}>+</button>
                <button onClick={() => setRiftModal(m => m && { ...m, tickets: m.owned })}
                  style={{ padding: '4px 8px', fontSize: 11 }}>최대</button>
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(162,75,255,0.1)', borderRadius: 4, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                {riftModal.activeRemainSec > 0 ? '연장 후 총 잔여' : '총 영속 시간'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#c97bff', fontFamily: 'monospace' }}>
                {(() => {
                  const totalMin = (riftModal.activeRemainSec > 0 ? Math.floor(riftModal.activeRemainSec / 60) : 0) + riftModal.tickets * 30;
                  const h = Math.floor(totalMin / 60);
                  const m = totalMin % 60;
                  return h > 0 ? `${h}시간 ${m > 0 ? `${m}분` : ''}` : `${m}분`;
                })()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRiftModal(null)} style={{ padding: '8px 16px', fontSize: 12 }}>취소</button>
              <button className="primary" onClick={confirmRiftEnter} style={{
                padding: '8px 18px', fontSize: 12, fontWeight: 700,
                background: '#a24bff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>
                {riftModal.tickets > 0 ? `${riftModal.tickets}장 사용 · ${riftModal.activeRemainSec > 0 ? '연장' : '입장'}` : '무료 재입장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
