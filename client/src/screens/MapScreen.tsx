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
  const [isAdmin, setIsAdmin] = useState(false);
  const active = useCharacterStore((s) => s.activeCharacter);

  useEffect(() => {
    api<FieldData[]>('/fields').then(setFields).catch(() => {});
    api<{ isAdmin: boolean }>('/me').then(d => setIsAdmin(!!d.isAdmin)).catch(() => {});
  }, []);

  async function enter(fieldId: number) {
    if (!active) return;
    if (fieldId === ENDLESS_FIELD_ID) {
      // 종언의 기둥은 별도 API 사용 (어드민 전용)
      try {
        await api(`/endless/${active.id}/enter`, { method: 'POST' });
        nav('/combat');
      } catch (e) {
        alert(e instanceof Error ? e.message : '종언 입장 실패');
      }
      return;
    }
    await api(`/characters/${active.id}/enter-field`, {
      method: 'POST',
      body: JSON.stringify({ fieldId }),
    });
    nav('/combat');
  }

  // 어드민 전용 — 종언의 기둥 entry 가상 추가
  const allFields: FieldData[] = isAdmin
    ? [
        ...fields,
        {
          id: ENDLESS_FIELD_ID,
          name: '종언의 기둥 (어드민 전용)',
          requiredLevel: 1,
          description: '무한 등반 도전. 100층마다 보스, 죽으면 1층. 매일 랭킹 보상.',
          monsters: [],
        } as FieldData,
      ]
    : fields;

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>사냥터</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...allFields].sort((a, b) => {
          const aDummy = a.name.startsWith('허수아비');
          const bDummy = b.name.startsWith('허수아비');
          if (aDummy && !bDummy) return -1;
          if (!aDummy && bDummy) return 1;
          if (aDummy && bDummy) {
            const la = Number(a.name.match(/\d+/)?.[0] ?? 0);
            const lb = Number(b.name.match(/\d+/)?.[0] ?? 0);
            return la - lb;
          }
          return 0;
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
    </div>
  );
}
