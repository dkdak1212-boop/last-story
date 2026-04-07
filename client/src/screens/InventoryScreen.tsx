import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { InventorySlot, Equipped } from '../types';
import { GRADE_COLOR, GRADE_LABEL, ItemStatsBlock } from '../components/ui/ItemStats';
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

  async function refresh() {
    if (!active) return;
    const data = await api<{ inventory: InventorySlot[]; equipped: Equipped }>(
      `/characters/${active.id}/inventory`
    );
    setInv(data.inventory);
    setEquipped(data.equipped);
  }

  useEffect(() => { refresh(); }, [active]);

  async function equip(slotIndex: number) {
    if (!active) return;
    setMsg('');
    try {
      await api(`/characters/${active.id}/equip`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
      refresh();
      refreshActive();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function unequip(slot: string) {
    if (!active) return;
    setMsg('');
    try {
      await api(`/characters/${active.id}/unequip`, { method: 'POST', body: JSON.stringify({ slot }) });
      refresh();
      refreshActive();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  async function sell(slotIndex: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!active) return;
    setMsg('');
    try {
      const res = await api<{ sold: string; quantity: number; gold: number }>(
        `/characters/${active.id}/sell`, { method: 'POST', body: JSON.stringify({ slotIndex }) }
      );
      setMsg(`${res.sold} ×${res.quantity} 판매 → +${res.gold}G`);
      refresh();
      refreshActive();
    } catch (e) { setMsg(e instanceof Error ? e.message : '판매 실패'); }
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
          <EquipSlotCard slot="weapon" item={equipped.weapon} label={SLOT_LABEL.weapon}
            onUnequip={() => unequip('weapon')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('weapon', e); }} />
          <EquipSlotCard slot="chest" item={equipped.chest} label={SLOT_LABEL.chest}
            onUnequip={() => unequip('chest')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('chest', e); }} />
        </div>

        {/* 중앙: 인체 실루엣 */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', minHeight: 260,
        }}>
          {/* 머리 */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '2px solid var(--accent-dim)', background: 'var(--bg)',
            marginBottom: 4,
          }} />
          {/* 목걸이 위치 표시 */}
          <div style={{ width: 20, height: 6, background: 'var(--accent-dim)', borderRadius: 3, marginBottom: 2 }} />
          {/* 몸통 */}
          <div style={{
            width: 50, height: 70, borderRadius: '8px 8px 4px 4px',
            border: '2px solid var(--accent-dim)', background: 'var(--bg)',
          }} />
          {/* 다리 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <div style={{ width: 18, height: 50, borderRadius: '0 0 6px 6px', border: '2px solid var(--accent-dim)', background: 'var(--bg)' }} />
            <div style={{ width: 18, height: 50, borderRadius: '0 0 6px 6px', border: '2px solid var(--accent-dim)', background: 'var(--bg)' }} />
          </div>
          {/* 라벨 */}
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8, textAlign: 'center' }}>
            클릭하여 해제
          </div>
        </div>

        {/* 오른쪽: 투구(상), 목걸이(하) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <EquipSlotCard slot="helm" item={equipped.helm} label={SLOT_LABEL.helm}
            onUnequip={() => unequip('helm')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('helm', e); }} />
          <EquipSlotCard slot="amulet" item={equipped.amulet} label={SLOT_LABEL.amulet}
            onUnequip={() => unequip('amulet')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('amulet', e); }} />
        </div>

        {/* 하단 행: 반지 + 장화 */}
        <div>
          <EquipSlotCard slot="ring" item={equipped.ring} label={SLOT_LABEL.ring}
            onUnequip={() => unequip('ring')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('ring', e); }} />
        </div>
        <div />
        <div>
          <EquipSlotCard slot="boots" item={equipped.boots} label={SLOT_LABEL.boots}
            onUnequip={() => unequip('boots')} onToggleLock={(e) => { e.stopPropagation(); toggleLockEquipped('boots', e); }} />
        </div>
      </div>

      <h3 style={{ marginBottom: 10, fontSize: 16 }}>가방 ({inv.length})</h3>
      <div className="inventory-bag-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {inv.map((s) => {
          const locked = (s as unknown as { locked?: boolean }).locked ?? false;
          return (
            <div
              key={s.slotIndex}
              style={{
                padding: 10, position: 'relative',
                background: 'var(--bg-panel)',
                border: `1px solid ${locked ? 'var(--danger)' : GRADE_COLOR[s.item.grade]}`,
                cursor: s.item.slot && !locked ? 'pointer' : 'default',
              }}
              onClick={() => s.item.slot && !locked && equip(s.slotIndex)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: GRADE_COLOR[s.item.grade], fontSize: 13, fontWeight: 700 }}>
                  {s.item.slot && <span style={{ marginRight: 4 }}><SlotIcon slot={s.item.slot} size={16} /></span>}
                  {s.item.name}
                  {s.enhanceLevel > 0 && (
                    <span style={{ color: 'var(--accent)', marginLeft: 4 }}>+{s.enhanceLevel}</span>
                  )}
                  {s.quantity > 1 && ` ×${s.quantity}`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: GRADE_COLOR[s.item.grade] }}>{GRADE_LABEL[s.item.grade]}</span>
                  {s.item.slot && (
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
              {s.item.slot && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{SLOT_LABEL[s.item.slot]}</div>
              )}
              <div style={{ marginTop: 6 }}>
                <ItemStatsBlock stats={s.item.stats} />
                <PrefixDisplay prefixStats={s.prefixStats} />
                {s.item.slot && (
                  <ItemComparison
                    itemStats={s.item.stats}
                    equippedStats={equipped[s.item.slot]?.stats}
                  />
                )}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
                {s.item.description}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {s.item.sellPrice > 0 && !locked && (
                  <button
                    onClick={(e) => sell(s.slotIndex, e)}
                    style={{
                      padding: '3px 8px', fontSize: 11,
                      background: 'transparent', color: '#e0a040',
                      border: '1px solid #e0a040', cursor: 'pointer',
                    }}
                  >
                    판매 {s.item.sellPrice}G
                  </button>
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

function EquipSlotCard({ slot, item, label, onUnequip, onToggleLock }: {
  slot: string;
  item: any;
  label: string;
  onUnequip: () => void;
  onToggleLock: (e: React.MouseEvent) => void;
}) {
  const locked = item?.locked ?? false;
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
          <ItemStatsBlock stats={item.stats} />
          <PrefixDisplay prefixStats={item.prefixStats} />
        </>
      ) : (
        <div style={{ textAlign: 'center', marginTop: 10, opacity: 0.2 }}>
          <SlotIcon slot={slot} size={36} />
        </div>
      )}
    </div>
  );
}
