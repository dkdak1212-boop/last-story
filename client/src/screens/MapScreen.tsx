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
}

export function MapScreen() {
  const nav = useNavigate();
  const [fields, setFields] = useState<FieldData[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const active = useCharacterStore((s) => s.activeCharacter);

  useEffect(() => {
    api<FieldData[]>('/fields').then(setFields).catch(() => {});
  }, []);

  async function enter(fieldId: number) {
    if (!active) return;
    await api(`/characters/${active.id}/enter-field`, {
      method: 'POST',
      body: JSON.stringify({ fieldId }),
    });
    nav('/combat');
  }

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>사냥터</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fields.map((f) => {
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
                  <div style={{ fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        <span style={{ fontSize: 11, color: 'var(--success)' }}>+{m.exp}exp</span>
                        <span style={{ fontSize: 11, color: '#e0a040' }}>+{m.gold}G</span>
                      </div>
                    </div>
                  ))}
                  {/* 드랍 아이템 목록 + 확률 */}
                  {(() => {
                    const allDrops = f.monsters.flatMap(m => m.drops || []);
                    if (allDrops.length === 0) return null;
                    // 무기/방어구/악세 분류 (이름 기반: '검/지팡이/홀/단검'=무기, '투구/갑옷/장화'=방어구, '반지/목걸이'=악세)
                    const isWeapon = (n: string) => /검|지팡이|홀|단검/.test(n);
                    const isArmor = (n: string) => /투구|갑옷|장화/.test(n);
                    const isAccessory = (n: string) => /반지|목걸이/.test(n);

                    const weapons = allDrops.filter(d => isWeapon(d.name));
                    const armors = allDrops.filter(d => isArmor(d.name));
                    const accs = allDrops.filter(d => isAccessory(d.name));

                    // 카테고리 종합 확률 = 1 - 각 슬롯 모두 실패 확률
                    function catChance(drops: typeof allDrops): number {
                      if (drops.length === 0) return 0;
                      let failProb = 1;
                      for (const d of drops) failProb *= (1 - d.chance / 100);
                      return Math.round((1 - failProb) * 10000) / 100;
                    }

                    const wChance = catChance(weapons);
                    const aChance = catChance(armors);
                    const cChance = catChance(accs);

                    return (
                      <>
                        <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--bg)', borderRadius: 4 }}>
                          <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 6 }}>드랍 가능 장비</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {[...new Map(allDrops.map(d => [d.name, d])).values()].map((d, i) => (
                              <span key={i} style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 3,
                                border: '1px solid var(--border)',
                                color: 'var(--text-dim)',
                                background: 'var(--bg-panel)',
                              }}>{d.name}</span>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 4, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                          <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>드랍 확률 (1킬당)</div>
                          <div>
                            <span style={{ color: '#ff8866' }}>무기 {wChance.toFixed(2)}%</span>{' · '}
                            <span style={{ color: '#88ccff' }}>방어구 {aChance.toFixed(2)}%</span>{' · '}
                            <span style={{ color: '#e0a040' }}>악세서리 {cChance.toFixed(2)}%</span>
                          </div>
                          <div style={{ marginTop: 6, fontWeight: 700, color: 'var(--accent)' }}>접두사 등급 확률</div>
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
