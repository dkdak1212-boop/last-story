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

  async function refresh() {
    if (!active) return;
    const data = await api<{ inventory: InventorySlot[]; equipped: Equipped }>(
      `/characters/${active.id}/inventory`
    );
    setInv(data.inventory);
    setEquipped(data.equipped);
  }

  // 자동분해 설정 로드
  useEffect(() => {
    if (!active) return;
    api<{ autoDismantleCommon: boolean }>(`/characters/${active.id}/auto-dismantle`)
      .then(d => setAutoDismantleCommon(d.autoDismantleCommon))
      .catch(() => {});
  }, [active?.id]);

  useEffect(() => { refresh(); }, [active]);

  async function equip(slotIndex: number) {
    if (!active) return;
    setMsg('');
    try {
      await api(`/characters/${active.id}/equip`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '장착 실패'); }
  }

  async function unequip(slot: string) {
    if (!active) return;
    setMsg('');
    try {
      await api(`/characters/${active.id}/unequip`, { method: 'POST', body: JSON.stringify({ slot }) });
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function sell(slotIndex: number, enhanceLevel: number, itemName: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!active) return;
    // 강화 아이템 판매 확인
    if (enhanceLevel > 0) {
      if (!confirm(`강화된 아이템입니다 (+${enhanceLevel} ${itemName}). 정말 판매하시겠습니까?`)) return;
    }
    setMsg('');
    try {
      const res = await api<{ sold: string; quantity: number; gold: number }>(
        `/characters/${active.id}/sell`, { method: 'POST', body: JSON.stringify({ slotIndex }) }
      );
      setMsg(`${res.sold} ×${res.quantity} 판매 → +${res.gold}G`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '판매 실패'); }
  }

  async function dismantle(slotIndex: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!active) return;
    setMsg('');
    try {
      const res = await api<{ name: string; gold: number }>(
        `/characters/${active.id}/dismantle`, { method: 'POST', body: JSON.stringify({ slotIndex }) }
      );
      setMsg(`${res.name} 분해 → +${res.gold}G`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '분해 실패'); }
  }

  async function toggleLock(slotIndex: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!active) return;
    await api(`/characters/${active.id}/lock`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
    refresh();
  }

  async function toggleLockEquipped(slot: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!active) return;
    await api(`/characters/${active.id}/lock-equipped`, { method: 'POST', body: JSON.stringify({ slot }) });
    refresh();
  }

  async function enhanceItem(_slotIndex: number, kind: 'inventory' | 'equipped', slotKey: number | string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!active || enhanceBusy) return;
    setEnhanceBusy(true); setMsg('');
    try {
      const r = await api<{ success: boolean; newLevel: number; cost: number; destroyed?: boolean }>(
        `/enhance/${active.id}/attempt`,
        { method: 'POST', body: JSON.stringify({ kind, slotKey, useScroll: false }) }
      );
      if (r.destroyed) {
        setMsg(`강화 실패 — 장비가 파괴되었습니다! (-${r.cost.toLocaleString()}G)`);
      } else if (r.success) {
        setMsg(`강화 성공! +${r.newLevel} (-${r.cost.toLocaleString()}G)`);
      } else {
        setMsg(`강화 실패 (-${r.cost.toLocaleString()}G)`);
      }
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '강화 실패'); }
    finally { setEnhanceBusy(false); }
  }

  async function rerollPrefix(_slotIndex: number, kind: 'inventory' | 'equipped', slotKey: number | string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!active || rerollBusy) return;
    setRerollBusy(true); setMsg('');
    try {
      const r = await api<{ success: boolean; prefixStats: Record<string, number> }>(
        `/enhance/${active.id}/reroll-prefix`,
        { method: 'POST', body: JSON.stringify({ kind, slotKey }) }
      );
      const statStr = Object.entries(r.prefixStats).map(([k, v]) => `${STAT_LABEL[k as keyof Stats] || k}+${v}`).join(', ');
      setMsg(`접두사 재굴림 완료! → ${statStr || '없음'}`);
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

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>인벤토리</h2>
      {msg && <div style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>{msg}</div>}

      <h3 style={{ marginBottom: 10, fontSize: 16 }}>장착</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 1fr',
        gridTemplateRows: 'auto auto auto',
        gap: 8, marginBottom: 24, maxWidth: 700, margin: '0 auto 24px',
      }}>
        {/* 왼쪽: 무기(상), 갑옷(하) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <EquipSlotCard slot="weapon" item={equipped.weapon} label={SLOT_LABEL.weapon} charLevel={active?.level ?? 1}
            onUnequip={() => unequip('weapon')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('weapon', e); }} />
          <EquipSlotCard slot="chest" item={equipped.chest} label={SLOT_LABEL.chest} charLevel={active?.level ?? 1}
            onUnequip={() => unequip('chest')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('chest', e); }} />
        </div>

        {/* 중앙: 인체 실루엣 */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', minHeight: 260,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--accent-dim)', background: 'var(--bg)', marginBottom: 4 }} />
          <div style={{ width: 20, height: 6, background: 'var(--accent-dim)', borderRadius: 3, marginBottom: 2 }} />
          <div style={{ width: 50, height: 70, borderRadius: '8px 8px 4px 4px', border: '2px solid var(--accent-dim)', background: 'var(--bg)' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <div style={{ width: 18, height: 50, borderRadius: '0 0 6px 6px', border: '2px solid var(--accent-dim)', background: 'var(--bg)' }} />
            <div style={{ width: 18, height: 50, borderRadius: '0 0 6px 6px', border: '2px solid var(--accent-dim)', background: 'var(--bg)' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8, textAlign: 'center' }}>
            클릭하여 해제
          </div>
        </div>

        {/* 오른쪽: 투구(상), 목걸이(하) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <EquipSlotCard slot="helm" item={equipped.helm} label={SLOT_LABEL.helm} charLevel={active?.level ?? 1}
            onUnequip={() => unequip('helm')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('helm', e); }} />
          <EquipSlotCard slot="amulet" item={equipped.amulet} label={SLOT_LABEL.amulet} charLevel={active?.level ?? 1}
            onUnequip={() => unequip('amulet')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('amulet', e); }} />
        </div>

        {/* 하단 행: 반지 + 장화 */}
        <div>
          <EquipSlotCard slot="ring" item={equipped.ring} label={SLOT_LABEL.ring} charLevel={active?.level ?? 1}
            onUnequip={() => unequip('ring')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('ring', e); }} />
        </div>
        <div />
        <div>
          <EquipSlotCard slot="boots" item={equipped.boots} label={SLOT_LABEL.boots} charLevel={active?.level ?? 1}
            onUnequip={() => unequip('boots')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('boots', e); }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 16 }}>가방 ({inv.length}/300)</h3>
          <div style={{ display: 'flex', gap: 3 }}>
            {([['latest', '최신순'], ['level', '레벨순'], ['enhance', '강화순'], ['slot', '부위순']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSortMode(key)}
                style={{
                  fontSize: 10, padding: '2px 8px',
                  background: sortMode === key ? 'var(--accent)' : 'transparent',
                  color: sortMode === key ? '#000' : 'var(--text-dim)',
                  border: `1px solid ${sortMode === key ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer', fontWeight: sortMode === key ? 700 : 400,
                }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 자동분해 토글 */}
          <button
            onClick={toggleAutoDismantle}
            style={{
              fontSize: 11, padding: '3px 10px',
              background: autoDismantleCommon ? 'var(--danger)' : 'transparent',
              color: autoDismantleCommon ? '#fff' : 'var(--text-dim)',
              border: `1px solid ${autoDismantleCommon ? 'var(--danger)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            일반 자동분해 {autoDismantleCommon ? 'ON' : 'OFF'}
          </button>
          {(['common', 'rare', 'epic', 'legendary'] as const).map(g => {
            const label: Record<string, string> = { common: '일반', rare: '매직', epic: '에픽', legendary: '전설' };
            const color: Record<string, string> = { common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030' };
            return (
              <button key={g} onClick={async () => {
                if (!active) return;
                if (!confirm(`${label[g]} 등급 아이템을 일괄 판매합니다. (잠금 제외)`)) return;
                setMsg('');
                try {
                  const res = await api<{ grade: string; count: number; gold: number }>(
                    `/characters/${active.id}/sell-bulk`, { method: 'POST', body: JSON.stringify({ grade: g }) }
                  );
                  setMsg(`${res.grade} ${res.count}개 판매 → +${res.gold.toLocaleString()}G`);
                  await Promise.all([refresh(), refreshActive()]);
                } catch (e) { setMsg(e instanceof Error ? e.message : '판매 실패'); }
              }} style={{
                fontSize: 11, padding: '3px 8px', background: 'transparent',
                color: color[g], border: `1px solid ${color[g]}`, cursor: 'pointer',
              }}>
                {label[g]} 일괄판매
              </button>
            );
          })}
        </div>
      </div>
      <div className="inventory-bag-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {[...inv].sort((a, b) => {
          if (sortMode === 'enhance') return (b.enhanceLevel || 0) - (a.enhanceLevel || 0);
          if (sortMode === 'level') return ((b.item as any).requiredLevel || 0) - ((a.item as any).requiredLevel || 0);
          if (sortMode === 'slot') {
            const order: Record<string, number> = { weapon: 0, helm: 1, chest: 2, boots: 3, ring: 4, amulet: 5 };
            const sa = a.item.slot ? (order[a.item.slot] ?? 6) : 7;
            const sb = b.item.slot ? (order[b.item.slot] ?? 6) : 7;
            return sa - sb || b.slotIndex - a.slotIndex;
          }
          return b.slotIndex - a.slotIndex;
        }).map((s) => {
          const locked = (s as unknown as { locked?: boolean }).locked ?? false;
          const isEquipment = !!s.item.slot;
          const isConsumable = (s.item as any).type === 'consumable';
          const requiredLevel = (s.item as any).requiredLevel || 1;
          const charLevel = active?.level ?? 1;
          const levelTooLow = isEquipment && charLevel < requiredLevel;
          return (
            <div
              key={s.slotIndex}
              style={{
                padding: 10, position: 'relative',
                background: 'var(--bg-panel)',
                border: `1px solid ${locked ? 'var(--danger)' : GRADE_COLOR[s.item.grade]}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: GRADE_COLOR[s.item.grade], fontSize: 13, fontWeight: 700 }}>
                  {isEquipment && <span style={{ marginRight: 4 }}><SlotIcon slot={s.item.slot!} size={16} /></span>}
                  {s.item.name}
                  {s.enhanceLevel > 0 && (
                    <span style={{ color: 'var(--accent)', marginLeft: 4 }}>+{s.enhanceLevel}</span>
                  )}
                  {s.quantity > 1 && ` ×${s.quantity}`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: GRADE_COLOR[s.item.grade] }}>{GRADE_LABEL[s.item.grade]}</span>
                  {isEquipment && (
                    <img
                      src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'}
                      alt={locked ? '잠금' : '해제'}
                      onClick={(e) => toggleLock(s.slotIndex, e)}
                      onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                      style={{ cursor: 'pointer', width: 16, height: 16, imageRendering: 'pixelated', opacity: locked ? 1 : 0.5 }}
                      title={locked ? '잠금 해제' : '잠금'}
                    />
                  )}
                </div>
              </div>
              {isEquipment && (
                <div style={{ fontSize: 10, color: levelTooLow ? 'var(--danger)' : 'var(--text-dim)', marginTop: 2, fontWeight: levelTooLow ? 700 : 400 }}>
                  {SLOT_LABEL[s.item.slot!]} · Lv.{requiredLevel} 이상
                  {levelTooLow && ' (레벨 부족)'}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <ItemStatsBlock stats={s.item.stats} enhanceLevel={s.enhanceLevel || 0} />
                <PrefixDisplay prefixStats={s.prefixStats} />
                {isEquipment && (
                  <ItemComparison
                    itemStats={s.item.stats}
                    equippedStats={equipped[s.item.slot!]?.stats}
                    itemEnhance={s.enhanceLevel || 0}
                    equippedEnhance={equipped[s.item.slot!]?.enhanceLevel || 0}
                  />
                )}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
                {s.item.description}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {/* 장착 버튼 - 장비만, 잠금/레벨부족 아닐 때 */}
                {isEquipment && !locked && !levelTooLow && (
                  <button
                    onClick={(e) => { e.stopPropagation(); equip(s.slotIndex); }}
                    style={{
                      padding: '5px 16px', fontSize: 12, fontWeight: 700,
                      background: 'var(--accent)', color: '#000',
                      border: '1px solid var(--accent)', cursor: 'pointer',
                    }}
                  >
                    장착
                  </button>
                )}
                {/* 판매 버튼 */}
                {s.item.sellPrice > 0 && !locked && (
                  <button
                    onClick={(e) => sell(s.slotIndex, s.enhanceLevel, s.item.name, e)}
                    style={{
                      padding: '3px 8px', fontSize: 11,
                      background: 'transparent', color: '#e0a040',
                      border: '1px solid #e0a040', cursor: 'pointer',
                    }}
                  >
                    판매 {s.item.sellPrice}G
                  </button>
                )}
                {/* 분해 버튼 - 장비만, 물약/소비 제외, 잠금 제외 */}
                {isEquipment && !locked && (
                  <button
                    onClick={(e) => dismantle(s.slotIndex, e)}
                    style={{
                      padding: '3px 8px', fontSize: 11,
                      background: 'transparent', color: '#cc6666',
                      border: '1px solid #cc6666', cursor: 'pointer',
                    }}
                  >
                    분해
                  </button>
                )}
                {/* 강화 버튼 - 장비만 */}
                {isEquipment && !locked && (
                  <button
                    onClick={(e) => enhanceItem(s.slotIndex, 'inventory', s.slotIndex, e)}
                    disabled={enhanceBusy || (s.enhanceLevel || 0) >= 20}
                    style={{
                      padding: '3px 8px', fontSize: 11,
                      background: 'transparent', color: 'var(--accent)',
                      border: '1px solid var(--accent)', cursor: (s.enhanceLevel || 0) >= 20 ? 'not-allowed' : 'pointer',
                      opacity: (s.enhanceLevel || 0) >= 20 ? 0.4 : 1,
                    }}
                  >
                    강화
                  </button>
                )}
                {/* 접두사 재굴림 버튼 - 장비만 */}
                {isEquipment && !locked && (
                  <button
                    onClick={(e) => rerollPrefix(s.slotIndex, 'inventory', s.slotIndex, e)}
                    disabled={rerollBusy}
                    style={{
                      padding: '3px 8px', fontSize: 11,
                      background: 'transparent', color: '#64d2ff',
                      border: '1px solid #64d2ff', cursor: 'pointer',
                    }}
                  >
                    재굴림
                  </button>
                )}
                {/* 소비 아이템 분해 불가 표시 */}
                {isConsumable && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', alignSelf: 'center' }}>분해 불가</span>
                )}
              </div>
              {locked && (
                <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4 }}>잠김 — 장착/해제/판매 불가</div>
              )}
            </div>
          );
        })}
        {inv.length === 0 && <div style={{ color: 'var(--text-dim)' }}>가방이 비어있다.</div>}
      </div>
    </div>
  );
}

function EquipSlotCard({ slot, item, label, charLevel, onUnequip, onToggleLock }: {
  slot: string;
  item: any;
  label: string;
  charLevel: number;
  onUnequip: () => void;
  onToggleLock: (e: React.MouseEvent) => void;
}) {
  const locked = item?.locked ?? false;
  const requiredLevel = item?.requiredLevel || 1;
  const levelTooLow = item && charLevel < requiredLevel;
  return (
    <div
      style={{
        padding: 10, position: 'relative',
        background: 'var(--bg-panel)',
        border: `2px solid ${item ? (GRADE_COLOR as any)[item.grade] : 'var(--border)'}`,
        borderRadius: 8, minHeight: 100,
        cursor: item && !locked ? 'pointer' : 'default',
        transition: 'border-color 0.2s',
      }}
      onClick={() => item && !locked && onUnequip()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          <SlotIcon slot={slot} size={18} />
          {label}
        </div>
        {item && (
          <img
            src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'}
            alt={locked ? '잠금' : '해제'}
            onClick={onToggleLock}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            style={{ cursor: 'pointer', width: 16, height: 16, imageRendering: 'pixelated', opacity: locked ? 1 : 0.5 }}
            title={locked ? '잠금 해제' : '잠금'}
          />
        )}
      </div>
      {item ? (
        <>
          <div style={{ color: (GRADE_COLOR as any)[item.grade], fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            {item.name}
            {item.enhanceLevel && item.enhanceLevel > 0 && (
              <span style={{ color: 'var(--accent)', marginLeft: 4 }}>+{item.enhanceLevel}</span>
            )}
          </div>
          <ItemStatsBlock stats={item.stats} enhanceLevel={item.enhanceLevel || 0} />
          <PrefixDisplay prefixStats={item.prefixStats} />
          {levelTooLow && (
            <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, marginTop: 4 }}>
              Lv.{requiredLevel} 이상 필요 (레벨 부족)
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', marginTop: 10, opacity: 0.2 }}>
          <SlotIcon slot={slot} size={36} />
        </div>
      )}
    </div>
  );
}
