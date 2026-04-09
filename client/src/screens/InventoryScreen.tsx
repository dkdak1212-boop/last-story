import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { InventorySlot, Equipped, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, ItemStatsBlock, STAT_LABEL } from '../components/ui/ItemStats';
import { ItemComparison } from '../components/ui/ItemComparison';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';

const SLOT_LABEL: Record<string, string> = {
  weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화',
  ring: '반지', amulet: '목걸이',
};
function SlotIcon({ slot, size = 20 }: { slot: string; size?: number }) {
  return <img src={`/images/slots/${slot}.png`} alt={slot} width={size} height={size}
    style={{ imageRendering: 'pixelated', verticalAlign: 'middle' }} />;
}

export function InventoryScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});
  const [msg, setMsg] = useState('');
  const [autoDismantleCommon, setAutoDismantleCommon] = useState(false);
  const [sortMode, setSortMode] = useState<'latest' | 'level' | 'enhance' | 'slot'>('latest');
  const [enhanceBusy, setEnhanceBusy] = useState(false);
  const [rerollBusy, setRerollBusy] = useState(false);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<'equip' | 'bag'>('bag');

  async function refresh() {
    if (!active) return;
    const data = await api<{ inventory: InventorySlot[]; equipped: Equipped }>(
      `/characters/${active.id}/inventory`
    );
    setInv(data.inventory);
    setEquipped(data.equipped);
  }

  useEffect(() => {
    if (!active) return;
    api<{ autoDismantleCommon: boolean }>(`/characters/${active.id}/auto-dismantle`)
      .then(d => setAutoDismantleCommon(d.autoDismantleCommon))
      .catch(() => {});
  }, [active?.id]);

  useEffect(() => { refresh(); }, [active]);

  async function equip(slotIndex: number) {
    if (!active) return; setMsg('');
    try {
      await api(`/characters/${active.id}/equip`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '장착 실패'); }
  }

  async function unequip(slot: string) {
    if (!active) return; setMsg('');
    try {
      await api(`/characters/${active.id}/unequip`, { method: 'POST', body: JSON.stringify({ slot }) });
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function sell(slotIndex: number, enhanceLevel: number, itemName: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    if (enhanceLevel > 0 && !confirm(`강화된 아이템입니다 (+${enhanceLevel} ${itemName}). 정말 판매하시겠습니까?`)) return;
    setMsg('');
    try {
      const res = await api<{ sold: string; quantity: number; gold: number }>(
        `/characters/${active.id}/sell`, { method: 'POST', body: JSON.stringify({ slotIndex }) }
      );
      setMsg(`${res.sold} x${res.quantity} 판매 +${res.gold}G`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '판매 실패'); }
  }

  async function dismantle(slotIndex: number, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    if (!confirm('분해하시겠습니까?')) return; setMsg('');
    try {
      const res = await api<{ name: string; gold: number }>(
        `/characters/${active.id}/dismantle`, { method: 'POST', body: JSON.stringify({ slotIndex }) }
      );
      setMsg(`${res.name} 분해 +${res.gold}G`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '분해 실패'); }
  }

  async function toggleLock(slotIndex: number, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    await api(`/characters/${active.id}/lock`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
    refresh();
  }

  async function toggleLockEquipped(slot: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    await api(`/characters/${active.id}/lock-equipped`, { method: 'POST', body: JSON.stringify({ slot }) });
    refresh();
  }

  async function enhanceItem(_slotIndex: number, kind: 'inventory' | 'equipped', slotKey: number | string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active || enhanceBusy) return;
    setEnhanceBusy(true); setMsg('');
    try {
      const r = await api<{ success: boolean; newLevel: number; cost: number; destroyed?: boolean }>(
        `/enhance/${active.id}/attempt`, { method: 'POST', body: JSON.stringify({ kind, slotKey, useScroll: false }) }
      );
      if (r.destroyed) setMsg(`강화 실패 — 파괴! (-${r.cost.toLocaleString()}G)`);
      else if (r.success) setMsg(`강화 성공! +${r.newLevel} (-${r.cost.toLocaleString()}G)`);
      else setMsg(`강화 실패 (-${r.cost.toLocaleString()}G)`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '강화 실패'); }
    finally { setEnhanceBusy(false); }
  }

  async function rerollPrefix(_slotIndex: number, kind: 'inventory' | 'equipped', slotKey: number | string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active || rerollBusy) return;
    setRerollBusy(true); setMsg('');
    try {
      const r = await api<{ success: boolean; prefixStats: Record<string, number> }>(
        `/enhance/${active.id}/reroll-prefix`, { method: 'POST', body: JSON.stringify({ kind, slotKey }) }
      );
      const statStr = Object.entries(r.prefixStats).map(([k, v]) => `${STAT_LABEL[k as keyof Stats] || k}+${v}`).join(', ');
      setMsg(`재굴림 완료! ${statStr || '없음'}`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '재굴림 실패'); }
    finally { setRerollBusy(false); }
  }

  async function toggleAutoDismantle() {
    if (!active) return;
    try {
      const res = await api<{ autoDismantleCommon: boolean }>(
        `/characters/${active.id}/auto-dismantle`, { method: 'POST', body: JSON.stringify({ enabled: !autoDismantleCommon }) }
      );
      setAutoDismantleCommon(res.autoDismantleCommon);
    } catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }

  const sortedInv = [...inv].sort((a, b) => {
    if (sortMode === 'enhance') return (b.enhanceLevel || 0) - (a.enhanceLevel || 0);
    if (sortMode === 'level') return ((b.item as any).requiredLevel || 0) - ((a.item as any).requiredLevel || 0);
    if (sortMode === 'slot') {
      const order: Record<string, number> = { weapon: 0, helm: 1, chest: 2, boots: 3, ring: 4, amulet: 5 };
      const sa = a.item.slot ? (order[a.item.slot] ?? 6) : 7;
      const sb = b.item.slot ? (order[b.item.slot] ?? 6) : 7;
      return sa - sb || b.slotIndex - a.slotIndex;
    }
    return b.slotIndex - a.slotIndex;
  });

  const equipSlots: { slot: string; label: string }[] = [
    { slot: 'weapon', label: '무기' }, { slot: 'helm', label: '투구' },
    { slot: 'chest', label: '갑옷' }, { slot: 'boots', label: '장화' },
    { slot: 'ring', label: '반지' }, { slot: 'amulet', label: '목걸이' },
  ];

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>인벤토리</h2>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{inv.length}/300</span>
      </div>

      {/* 메시지 */}
      {msg && (
        <div style={{
          padding: '8px 12px', marginBottom: 10, fontSize: 12, fontWeight: 700, borderRadius: 4,
          background: msg.includes('성공') || msg.includes('판매') || msg.includes('분해') ? 'rgba(76,175,80,0.1)' : 'rgba(200,60,60,0.1)',
          color: msg.includes('성공') || msg.includes('판매') || msg.includes('분해') ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${msg.includes('성공') || msg.includes('판매') || msg.includes('분해') ? 'rgba(76,175,80,0.3)' : 'rgba(200,60,60,0.3)'}`,
        }}>{msg}</div>
      )}

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '2px solid var(--border)' }}>
        {[['equip', '장착'], ['bag', '가방']] .map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as any)} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: tab === key ? 'var(--bg-panel)' : 'transparent',
            color: tab === key ? 'var(--accent)' : 'var(--text-dim)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2,
          }}>{label}{key === 'bag' ? ` (${inv.length})` : ''}</button>
        ))}
      </div>

      {/* 장착 탭 */}
      {tab === 'equip' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {equipSlots.map(({ slot, label }) => {
            const item = (equipped as any)[slot];
            const locked = item?.locked ?? false;
            return (
              <div key={slot} style={{
                padding: 12, borderRadius: 6,
                background: 'var(--bg-panel)',
                border: `1px solid ${item ? (GRADE_COLOR as any)[item.grade] : 'var(--border)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SlotIcon slot={slot} size={20} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>{label}</span>
                  </div>
                  {item && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <img
                        src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'}
                        alt={locked ? '잠금' : '해제'}
                        onClick={(e) => { e.stopPropagation(); toggleLockEquipped(slot, e); }}
                        onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                        style={{ cursor: 'pointer', width: 14, height: 14, imageRendering: 'pixelated', opacity: locked ? 1 : 0.4 }}
                      />
                    </div>
                  )}
                </div>
                {item ? (
                  <>
                    <div style={{ color: (GRADE_COLOR as any)[item.grade], fontSize: 14, fontWeight: 700 }}>
                      {item.name}
                      {item.enhanceLevel > 0 && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>+{item.enhanceLevel}</span>}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      <ItemStatsBlock stats={item.stats} enhanceLevel={item.enhanceLevel || 0} />
                      <PrefixDisplay prefixStats={item.prefixStats} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {!locked && (
                        <button onClick={() => unequip(slot)} style={{
                          padding: '3px 10px', fontSize: 10, background: 'transparent',
                          color: 'var(--text-dim)', border: '1px solid var(--border)', cursor: 'pointer',
                        }}>해제</button>
                      )}
                      {!locked && (item.enhanceLevel || 0) < 20 && (
                        <button onClick={(e) => enhanceItem(-1, 'equipped', slot, e)} style={{
                          padding: '3px 10px', fontSize: 10, background: 'transparent',
                          color: 'var(--accent)', border: '1px solid var(--accent)', cursor: 'pointer',
                        }}>강화</button>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px 0', opacity: 0.15 }}>
                    <SlotIcon slot={slot} size={36} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 가방 탭 */}
      {tab === 'bag' && (
        <>
          {/* 정렬 + 일괄 액션 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {([['latest', '최신'], ['level', '레벨'], ['enhance', '강화'], ['slot', '부위']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setSortMode(key)} style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 3,
                  background: sortMode === key ? 'var(--accent)' : 'transparent',
                  color: sortMode === key ? '#000' : 'var(--text-dim)',
                  border: 'none', cursor: 'pointer', fontWeight: sortMode === key ? 700 : 400,
                }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={toggleAutoDismantle} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 3,
                background: autoDismantleCommon ? 'var(--danger)' : 'transparent',
                color: autoDismantleCommon ? '#fff' : 'var(--text-dim)',
                border: `1px solid ${autoDismantleCommon ? 'var(--danger)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}>자동분해 {autoDismantleCommon ? 'ON' : 'OFF'}</button>
              {(['common', 'rare', 'epic', 'legendary'] as const).map(g => {
                const lbl: Record<string, string> = { common: '일반', rare: '매직', epic: '에픽', legendary: '전설' };
                const clr: Record<string, string> = { common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030' };
                return (
                  <button key={g} onClick={async () => {
                    if (!active || !confirm(`${lbl[g]} 등급 일괄 판매 (잠금 제외)`)) return;
                    setMsg('');
                    try {
                      const res = await api<{ grade: string; count: number; gold: number }>(
                        `/characters/${active.id}/sell-bulk`, { method: 'POST', body: JSON.stringify({ grade: g }) }
                      );
                      setMsg(`${res.grade} ${res.count}개 판매 +${res.gold.toLocaleString()}G`);
                      await Promise.all([refresh(), refreshActive()]);
                    } catch (e) { setMsg(e instanceof Error ? e.message : '판매 실패'); }
                  }} style={{
                    fontSize: 10, padding: '2px 6px', background: 'transparent',
                    color: clr[g], border: `1px solid ${clr[g]}40`, cursor: 'pointer', borderRadius: 3,
                  }}>{lbl[g]}</button>
                );
              })}
            </div>
          </div>

          {/* 아이템 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sortedInv.length === 0 && <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>가방이 비어있다.</div>}
            {sortedInv.map((s) => {
              const locked = (s as unknown as { locked?: boolean }).locked ?? false;
              const isEquipment = !!s.item.slot;
              const requiredLevel = (s.item as any).requiredLevel || 1;
              const charLevel = active?.level ?? 1;
              const levelTooLow = isEquipment && charLevel < requiredLevel;
              const isExpanded = expandedSlot === s.slotIndex;

              return (
                <div key={s.slotIndex}
                  onClick={() => setExpandedSlot(isExpanded ? null : s.slotIndex)}
                  style={{
                    padding: '8px 12px', borderRadius: 4, cursor: 'pointer',
                    background: isExpanded ? 'var(--bg-panel)' : 'var(--bg-panel)',
                    border: `1px solid ${isExpanded ? 'var(--accent)' : locked ? 'var(--danger)' : GRADE_COLOR[s.item.grade] + '40'}`,
                    transition: 'border-color 0.15s',
                  }}
                >
                  {/* 컴팩트 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isEquipment && <SlotIcon slot={s.item.slot!} size={16} />}
                    <span style={{ color: GRADE_COLOR[s.item.grade], fontWeight: 700, fontSize: 13, flex: 1 }}>
                      {s.item.name}
                      {s.enhanceLevel > 0 && <span style={{ color: 'var(--accent)' }}> +{s.enhanceLevel}</span>}
                      {s.quantity > 1 && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> x{s.quantity}</span>}
                    </span>
                    <span style={{ fontSize: 9, color: GRADE_COLOR[s.item.grade], opacity: 0.7 }}>{GRADE_LABEL[s.item.grade]}</span>
                    {isEquipment && (
                      <img
                        src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'}
                        alt="" onClick={(e) => toggleLock(s.slotIndex, e)}
                        onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                        style={{ width: 12, height: 12, imageRendering: 'pixelated', opacity: locked ? 0.8 : 0.25, cursor: 'pointer' }}
                      />
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* 장비 비교 (항상 표시) */}
                  {!isExpanded && isEquipment && (
                    <div style={{ marginTop: 2 }}>
                      <ItemComparison
                        itemStats={s.item.stats} equippedStats={equipped[s.item.slot!]?.stats}
                        itemEnhance={s.enhanceLevel || 0} equippedEnhance={equipped[s.item.slot!]?.enhanceLevel || 0}
                      />
                    </div>
                  )}

                  {/* 펼침 상세 */}
                  {isExpanded && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {isEquipment && (
                        <div style={{ fontSize: 10, color: levelTooLow ? 'var(--danger)' : 'var(--text-dim)', marginBottom: 4 }}>
                          {SLOT_LABEL[s.item.slot!]} · Lv.{requiredLevel}{levelTooLow ? ' (레벨 부족)' : ''}
                        </div>
                      )}
                      <ItemStatsBlock stats={s.item.stats} enhanceLevel={s.enhanceLevel || 0} />
                      <PrefixDisplay prefixStats={s.prefixStats} />
                      {isEquipment && (
                        <div style={{ marginTop: 4 }}>
                          <ItemComparison
                            itemStats={s.item.stats} equippedStats={equipped[s.item.slot!]?.stats}
                            itemEnhance={s.enhanceLevel || 0} equippedEnhance={equipped[s.item.slot!]?.enhanceLevel || 0}
                          />
                        </div>
                      )}
                      <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
                        {s.item.description}
                      </div>

                      {/* 액션 버튼 */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {isEquipment && !locked && !levelTooLow && (
                          <button onClick={(e) => { e.stopPropagation(); equip(s.slotIndex); }} style={{
                            padding: '4px 14px', fontSize: 11, fontWeight: 700,
                            background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer', borderRadius: 3,
                          }}>장착</button>
                        )}
                        {s.item.sellPrice > 0 && !locked && (
                          <button onClick={(e) => sell(s.slotIndex, s.enhanceLevel, s.item.name, e)} style={{
                            padding: '3px 10px', fontSize: 10, background: 'transparent',
                            color: '#e0a040', border: '1px solid #e0a04050', cursor: 'pointer', borderRadius: 3,
                          }}>판매 {s.item.sellPrice}G</button>
                        )}
                        {isEquipment && !locked && (
                          <button onClick={(e) => enhanceItem(s.slotIndex, 'inventory', s.slotIndex, e)}
                            disabled={enhanceBusy || (s.enhanceLevel || 0) >= 20} style={{
                            padding: '3px 10px', fontSize: 10, background: 'transparent',
                            color: 'var(--accent)', border: '1px solid var(--accent)50', cursor: 'pointer', borderRadius: 3,
                            opacity: (s.enhanceLevel || 0) >= 20 ? 0.3 : 1,
                          }}>강화</button>
                        )}
                        {isEquipment && !locked && (
                          <button onClick={(e) => rerollPrefix(s.slotIndex, 'inventory', s.slotIndex, e)}
                            disabled={rerollBusy} style={{
                            padding: '3px 10px', fontSize: 10, background: 'transparent',
                            color: '#64d2ff', border: '1px solid #64d2ff50', cursor: 'pointer', borderRadius: 3,
                          }}>재굴림</button>
                        )}
                        {isEquipment && !locked && (
                          <button onClick={(e) => dismantle(s.slotIndex, e)} style={{
                            padding: '3px 8px', fontSize: 9, background: 'transparent',
                            color: '#886666', border: '1px solid #66444450', cursor: 'pointer', borderRadius: 3,
                          }}>분해</button>
                        )}
                      </div>
                      {locked && <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4 }}>잠김</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
