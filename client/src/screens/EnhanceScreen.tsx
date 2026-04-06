import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, STAT_LABEL } from '../components/ui/ItemStats';

interface EnhanceItem {
  kind: 'inventory' | 'equipped';
  slotIndex?: number; equipSlot?: string;
  itemId: number; name: string; grade: ItemGrade; itemSlot: string | null;
  stats: Partial<Stats> | null; enhanceLevel: number;
}

const SLOT_LABEL: Record<string, string> = {
  weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화', ring: '반지', amulet: '목걸이',
};

export function EnhanceScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [items, setItems] = useState<EnhanceItem[]>([]);
  const [selected, setSelected] = useState<EnhanceItem | null>(null);
  const [result, setResult] = useState<{ success: boolean; newLevel: number; cost: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!active) return;
    const d = await api<{ inventory: EnhanceItem[]; equipped: EnhanceItem[] }>(`/enhance/${active.id}/list`);
    setItems([...d.equipped, ...d.inventory]);
  }
  useEffect(() => { load(); }, [active?.id]);

  const info = selected ? getInfo(selected.enhanceLevel, active?.level ?? 1) : null;

  async function attempt() {
    if (!active || !selected) return;
    setBusy(true); setResult(null);
    try {
      const r = await api<{ success: boolean; newLevel: number; cost: number; chance: number }>(
        `/enhance/${active.id}/attempt`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: selected.kind,
            slotKey: selected.kind === 'inventory' ? selected.slotIndex : selected.equipSlot,
          }),
        }
      );
      setResult({ success: r.success, newLevel: r.newLevel, cost: r.cost });
      await refreshActive();
      await load();
      // 선택 유지
      setSelected((s) => s ? { ...s, enhanceLevel: r.newLevel } : null);
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>장비 강화</h2>
      <div className="enhance-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 }}>
        {/* 좌: 아이템 목록 */}
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>강화 가능 장비</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
            {items.length === 0 && <div style={{ color: 'var(--text-dim)' }}>장비가 없다.</div>}
            {items.map((it, idx) => (
              <div key={`${it.kind}-${idx}`} onClick={() => { setSelected(it); setResult(null); }}
                style={{
                  padding: 10, background: 'var(--bg-panel)',
                  border: `1px solid ${selected === it ? 'var(--accent)' : GRADE_COLOR[it.grade]}`,
                  cursor: 'pointer',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700 }}>
                      {it.name}
                      {it.enhanceLevel > 0 && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>+{it.enhanceLevel}</span>}
                    </span>
                    <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-dim)' }}>
                      [{GRADE_LABEL[it.grade]}] {SLOT_LABEL[it.itemSlot || '']} · {it.kind === 'equipped' ? '장착 중' : '가방'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 우: 강화 패널 */}
        <div style={{ padding: 16, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
          {!selected ? (
            <div style={{ color: 'var(--text-dim)' }}>강화할 장비를 선택하세요</div>
          ) : (
            <div>
              <div style={{ color: GRADE_COLOR[selected.grade], fontWeight: 700, fontSize: 15 }}>
                {selected.name} {selected.enhanceLevel > 0 && <span style={{ color: 'var(--accent)' }}>+{selected.enhanceLevel}</span>}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12 }}>
                {GRADE_LABEL[selected.grade]} · {SLOT_LABEL[selected.itemSlot || '']}
              </div>

              {selected.stats && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>강화 후 스탯 (+{selected.enhanceLevel + 1})</div>
                  {Object.entries(selected.stats).map(([k, v]) => {
                    const cur = Math.round((v as number) * (1 + selected.enhanceLevel * 0.1));
                    const next = Math.round((v as number) * (1 + (selected.enhanceLevel + 1) * 0.1));
                    return (
                      <div key={k} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{STAT_LABEL[k as keyof Stats]}</span>
                        <span>
                          <span style={{ color: 'var(--text-dim)' }}>{cur}</span>
                          <span style={{ margin: '0 6px', color: 'var(--text-dim)' }}>→</span>
                          <span style={{ color: 'var(--success)', fontWeight: 700 }}>{next}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {selected.enhanceLevel >= 10 ? (
                <div style={{ color: 'var(--accent)', fontWeight: 700 }}>최대 강화 단계</div>
              ) : info && (
                <>
                  <div style={{ padding: 10, background: 'var(--bg-elev)', marginBottom: 10, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-dim)' }}>비용</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{info.cost.toLocaleString()}G</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-dim)' }}>성공 확률</span>
                      <span style={{ color: info.chance >= 0.8 ? 'var(--success)' : info.chance >= 0.5 ? 'var(--accent)' : 'var(--danger)', fontWeight: 700 }}>
                        {Math.round(info.chance * 100)}%
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                      실패 시 골드만 소모됩니다.
                    </div>
                  </div>
                  <button className="primary" onClick={attempt} disabled={busy} style={{ width: '100%' }}>
                    +{selected.enhanceLevel + 1} 강화 시도
                  </button>
                </>
              )}

              {result && (
                <div style={{
                  marginTop: 10, padding: 10,
                  background: result.success ? 'rgba(107,163,104,0.15)' : 'rgba(192,90,74,0.15)',
                  border: `1px solid ${result.success ? 'var(--success)' : 'var(--danger)'}`,
                  fontSize: 13, textAlign: 'center',
                }}>
                  {result.success ? (
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                      강화 성공! +{result.newLevel}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>강화 실패</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getInfo(currentLevel: number, charLevel: number) {
  const next = currentLevel + 1;
  const lv = Math.max(1, charLevel);
  let cost: number; let chance: number;
  if (next <= 3)      { cost = 50 * lv;   chance = 1.0; }
  else if (next <= 6) { cost = 200 * lv;  chance = 0.8; }
  else if (next <= 9) { cost = 500 * lv;  chance = 0.5; }
  else                { cost = 2000 * lv; chance = 0.2; }
  return { cost, chance };
}
