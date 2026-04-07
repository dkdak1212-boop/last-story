import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { MonsterIcon } from '../components/ui/MonsterIcon';

const GRADE_COLOR: Record<string, string> = { common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030' };
interface DropInfo { name: string; grade: string; chance: number; }
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
                  {/* 드랍 아이템 목록 */}
                  {(() => {
                    const allDrops = f.monsters.flatMap(m => m.drops || []);
                    const uniqueDrops = new Map<string, DropInfo>();
                    for (const d of allDrops) { if (!uniqueDrops.has(d.name)) uniqueDrops.set(d.name, d); }
                    const sorted = [...uniqueDrops.values()].sort((a, b) => {
                      const go: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
                      return (go[a.grade] ?? 9) - (go[b.grade] ?? 9);
                    });
                    return sorted.length > 0 ? (
                      <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--bg)', borderRadius: 4 }}>
                        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11, marginBottom: 6 }}>획득 가능 장비</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {sorted.map((d, i) => (
                            <span key={i} style={{
                              fontSize: 10, padding: '2px 6px', borderRadius: 3,
                              border: `1px solid ${GRADE_COLOR[d.grade] || 'var(--border)'}`,
                              color: GRADE_COLOR[d.grade] || 'var(--text-dim)',
                              background: 'var(--bg-panel)',
                            }}>{d.name}</span>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 4, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>
                    <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>드랍 확률</div>
                    <div>
                      <span style={{ color: '#9a8b75' }}>일반 50%</span>{' · '}
                      <span style={{ color: '#5b8ecc' }}>매직 30%</span>{' · '}
                      <span style={{ color: '#b060cc' }}>에픽 19%</span>{' · '}
                      <span style={{ color: '#e08030' }}>전설 1%</span>
                    </div>
                    <div style={{ marginTop: 2 }}>
                      무기 3% · 방어구 2% · 악세서리 1.5%
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--accent)' }}>접두사</div>
                    <div>1옵 90% · 2옵 9% · 3옵 1%</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
