import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, STAT_LABEL } from '../components/ui/ItemStats';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';

interface EnhanceItem {
  kind: 'inventory' | 'equipped';
  slotIndex?: number; equipSlot?: string;
  itemId: number; name: string; grade: ItemGrade; itemSlot: string | null;
  stats: Partial<Stats> | null; // 강화 적용된 현재 스탯
  baseStats: Partial<Stats> | null; // 원본(강화 전) 스탯
  enhanceLevel: number;
  prefixIds?: number[]; prefixStats?: Record<string, number>;
  prefixName?: string;
  quality?: number;
}

const SLOT_LABEL: Record<string, string> = {
  weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화', ring: '반지', amulet: '목걸이',
};

export function EnhanceScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [items, setItems] = useState<EnhanceItem[]>([]);
  const [selected, setSelected] = useState<EnhanceItem | null>(null);
  const [result, setResult] = useState<{ success: boolean; newLevel: number; cost: number; destroyed?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scrollCount, setScrollCount] = useState(0);
  const [useScroll, setUseScroll] = useState(false);

  async function load() {
    if (!active) return;
    const d = await api<{ inventory: EnhanceItem[]; equipped: EnhanceItem[]; scrollCount: number }>(`/enhance/${active.id}/list`);
    setItems([...d.equipped, ...d.inventory]);
    setScrollCount(d.scrollCount || 0);
  }
  useEffect(() => { load(); }, [active?.id]);

  const info = selected ? getInfo(selected.enhanceLevel, active?.level ?? 1) : null;

  async function attempt() {
    if (!active || !selected) return;
    setBusy(true); setResult(null);
    try {
      const r = await api<{ success: boolean; newLevel: number; cost: number; chance: number; destroyed?: boolean }>(
        `/enhance/${active.id}/attempt`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: selected.kind,
            slotKey: selected.kind === 'inventory' ? selected.slotIndex : selected.equipSlot,
            useScroll,
          }),
        }
      );
      setResult({ success: r.success, newLevel: r.newLevel, cost: r.cost, destroyed: r.destroyed });
      await refreshActive();
      await load();
      if (r.destroyed) {
        setSelected(null);
      } else {
        setSelected((s) => s ? { ...s, enhanceLevel: r.newLevel } : null);
      }
      if (useScroll) setUseScroll(false);
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
          {(() => {
            const equipped = items.filter(it => it.kind === 'equipped');
            const inventory = items.filter(it => it.kind !== 'equipped');
            const renderItem = (it: EnhanceItem, idx: number) => {
              const q = it.quality || 0;
              const qColor = q >= 90 ? '#ff8800' : q >= 70 ? '#daa520' : q >= 40 ? '#66ccff' : q >= 20 ? '#8dc38d' : '#888';
              return (
                <div key={`${it.kind}-${idx}`} onClick={() => { setSelected(it); setResult(null); }}
                  style={{
                    padding: 10, background: 'var(--bg-panel)',
                    border: `1px solid ${selected === it ? 'var(--accent)' : GRADE_COLOR[it.grade]}`,
                    borderLeft: `3px solid ${GRADE_COLOR[it.grade]}`,
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {it.prefixName && (
                      <span style={{ color: '#66ccff', fontWeight: 700, fontSize: 13 }}>{it.prefixName}</span>
                    )}
                    <span style={{ color: GRADE_COLOR[it.grade], fontWeight: 700, fontSize: 13 }}>
                      {it.name}
                      {it.enhanceLevel > 0 && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>+{it.enhanceLevel}</span>}
                    </span>
                    {it.itemSlot && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 3,
                        background: qColor + '22', border: `1px solid ${qColor}`,
                        color: qColor, fontWeight: 700,
                      }}>품질 {q}%</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>
                      [{GRADE_LABEL[it.grade]}] {SLOT_LABEL[it.itemSlot || '']}
                    </span>
                  </div>
                  {it.prefixStats && Object.keys(it.prefixStats).length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <PrefixDisplay prefixStats={it.prefixStats} />
                    </div>
                  )}
                </div>
              );
            };
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
                {equipped.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 13, color: 'var(--success)', margin: '4px 0' }}>착용 중</h3>
                    {equipped.map(renderItem)}
                  </>
                )}
                {inventory.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 13, color: 'var(--text-dim)', margin: '8px 0 4px' }}>가방</h3>
                    {inventory.map(renderItem)}
                  </>
                )}
                {items.length === 0 && <div style={{ color: 'var(--text-dim)' }}>장비가 없다.</div>}
              </div>
            );
          })()}
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

              {selected.baseStats && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>강화 후 스탯 (+{selected.enhanceLevel + 1})</div>
                  {Object.entries(selected.baseStats).map(([k, v]) => {
                    // 강화 배율: +7.5%/단계 + 품질 보너스
                    const qBonus = (selected.quality || 0) / 100;
                    const getMult = (el: number) => 1 + el * 0.075 + qBonus;
                    const cur = Math.round((v as number) * getMult(selected.enhanceLevel));
                    const next = Math.round((v as number) * getMult(selected.enhanceLevel + 1));
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

              {selected.enhanceLevel >= 20 ? (
                <div style={{ color: 'var(--accent)', fontWeight: 700 }}>최대 강화 단계 (+20)</div>
              ) : info && (
                <>
                  <div style={{ padding: 10, background: 'var(--bg-elev)', marginBottom: 10, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-dim)' }}>비용</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{info.cost.toLocaleString()}G</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-dim)' }}>성공 확률</span>
                      <span style={{ color: info.chance >= 0.8 ? 'var(--success)' : info.chance >= 0.5 ? 'var(--accent)' : 'var(--danger)', fontWeight: 700 }}>
                        {Math.round((info.chance + (useScroll ? 0.10 : 0)) * 100)}%
                        {useScroll && <span style={{ color: 'var(--success)', marginLeft: 4 }}>(+10%)</span>}
                      </span>
                    </div>
                    {info.destroyRate > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--danger)' }}>파괴 확률</span>
                        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{Math.round(info.destroyRate * 100)}%</span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                      {info.destroyRate > 0
                        ? '실패 시 장비가 파괴될 수 있습니다!'
                        : '실패 시 골드만 소모됩니다.'
                      }
                    </div>
                  </div>

                  {/* 스크롤 사용 옵션 */}
                  {scrollCount > 0 && (
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer',
                    }}>
                      <input type="checkbox" checked={useScroll} onChange={e => setUseScroll(e.target.checked)} />
                      강화 성공률 스크롤 사용 (+10%) · 보유: {scrollCount}개
                    </label>
                  )}

                  <button className="primary" onClick={attempt} disabled={busy} style={{ width: '100%' }}>
                    +{selected.enhanceLevel + 1} 강화 시도
                  </button>
                </>
              )}

              {result && (
                <div style={{
                  marginTop: 10, padding: 10,
                  background: result.destroyed ? 'rgba(192,50,30,0.2)' : result.success ? 'rgba(107,163,104,0.15)' : 'rgba(192,90,74,0.15)',
                  border: `1px solid ${result.destroyed ? 'var(--danger)' : result.success ? 'var(--success)' : 'var(--danger)'}`,
                  fontSize: 13, textAlign: 'center',
                }}>
                  {result.destroyed ? (
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                      강화 실패 — 장비가 파괴되었습니다!
                    </span>
                  ) : result.success ? (
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                      강화 성공! +{result.newLevel}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>강화 실패</span>
                  )}
                </div>
              )}

              {/* 현재 접두사 표시 */}
              {selected.prefixStats && Object.keys(selected.prefixStats).length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700 }}>접두사</div>
                  <PrefixDisplay prefixStats={selected.prefixStats} />
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
  let cost: number; let chance: number; let destroyRate = 0;
  if (next <= 3)       { cost = 50 * lv;    chance = 1.0; }
  else if (next <= 6)  { cost = 200 * lv;   chance = 0.8; }
  else if (next <= 9)  { cost = 500 * lv;   chance = 0.5; }
  else if (next <= 12) { cost = 2000 * lv;  chance = 0.3; destroyRate = 0.10; }
  else if (next <= 15) { cost = 5000 * lv;  chance = 0.2; destroyRate = 0.20; }
  else if (next <= 18) { cost = 10000 * lv; chance = 0.1; destroyRate = 0.30; }
  else                 { cost = 20000 * lv; chance = 0.05; destroyRate = 0.40; }
  return { cost, chance, destroyRate };
}
