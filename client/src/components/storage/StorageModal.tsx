import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useCharacterStore } from '../../stores/characterStore';
import type { InventorySlot, ItemGrade } from '../../types';
import { GRADE_COLOR } from '../ui/ItemStats';
import { ItemIcon } from '../ui/ItemIcon';

const STAT_LABEL: Record<string, string> = {
  str: 'STR', dex: 'DEX', int: 'INT', vit: 'VIT', spd: 'SPD', cri: 'CRI',
  crit_dmg_pct: '치명뎀', dodge: '회피', accuracy: '명중',
  lifesteal_pct: '흡혈', dot_amp_pct: '도트', exp_bonus_pct: '경험치',
  gold_bonus_pct: '골드', guardian_pct: '방어', gauge_on_crit_pct: '게이지',
  first_strike_pct: '선제', berserk_pct: '광전사', ambush_pct: '각성',
  predator_pct: '포식', def_reduce_pct: '방관', hp_regen: '재생',
  slow_pct: '감속', thorns_pct: '반사',
};

interface StorageItem {
  id: number;
  slotIndex: number;
  itemId: number;
  quantity: number;
  enhanceLevel: number;
  prefixIds: number[];
  prefixStats: Record<string, number>;
  prefixName?: string;
  prefixTiers?: Record<string, number>;
  quality: number;
  item: {
    id: number; name: string; baseName?: string; grade: ItemGrade;
    slot: string | null; type: string; description: string;
    stats: Record<string, number> | null;
    classRestriction: string | null; requiredLevel: number;
  };
}

interface StorageData {
  maxSlots: number;
  gold: number;
  items: StorageItem[];
}

interface Props {
  inventory: InventorySlot[];
  onClose: () => void;
  onChange: () => void; // 인벤토리 새로고침 콜백
}

export function StorageModal({ inventory, onClose, onChange }: Props) {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [data, setData] = useState<StorageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    try {
      const d = await api<StorageData>('/storage');
      setData(d);
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
  }
  useEffect(() => { load(); }, []);

  async function deposit(slotIdx: number) {
    if (!active || busy) return;
    setBusy(true); setErr('');
    try {
      await api('/storage/deposit', { method: 'POST', body: JSON.stringify({
        characterId: active.id, inventorySlotIndex: slotIdx,
      })});
      await load(); onChange();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }
  async function withdraw(itemId: number) {
    if (!active || busy) return;
    setBusy(true); setErr('');
    try {
      await api('/storage/withdraw', { method: 'POST', body: JSON.stringify({
        characterId: active.id, storageItemId: itemId,
      })});
      await load(); onChange();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-panel)', border: '2px solid var(--accent)',
        borderRadius: 6, padding: 16, width: 'min(900px, 95vw)',
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: 18 }}>📦 계정 창고</h2>
          <button onClick={onClose} style={{ fontSize: 12 }}>닫기</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
          계정 내 모든 캐릭터가 공유합니다 · 무료
        </div>

        {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* 좌: 인벤토리 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              내 인벤토리 ({inventory.length})
            </div>
            <div style={{ maxHeight: '50vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {inventory.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: 10 }}>인벤토리 비어있음</div>
              )}
              {inventory.map(s => {
                const q = (s as any).quality || 0;
                const pName = (s as any).prefixName || '';
                return (
                  <div key={s.slotIndex} style={{
                    padding: '6px 8px', background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${GRADE_COLOR[s.item.grade] || 'var(--border)'}`,
                    borderRadius: 3, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <ItemIcon slot={s.item.slot ?? null} grade={s.item.grade} itemName={s.item.name} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: GRADE_COLOR[s.item.grade] || 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.item.name}
                        {s.enhanceLevel > 0 && <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--accent)' }}>+{s.enhanceLevel}</span>}
                        {s.quantity > 1 && <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--text-dim)' }}>×{s.quantity}</span>}
                      </div>
                      {(q > 0 || pName) && (
                        <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>
                          {q > 0 && <span style={{ color: q >= 80 ? '#ffcc44' : '#888' }}>품질 {q}%</span>}
                          {q > 0 && pName && ' · '}
                          {pName && <span style={{ color: '#aaa' }}>{pName}</span>}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deposit(s.slotIndex)} disabled={busy} style={{ fontSize: 10, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      입고 →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 우: 창고 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              창고 ({data?.items.length ?? 0}/{data?.maxSlots ?? 60})
            </div>
            <div style={{ maxHeight: '50vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(!data || data.items.length === 0) && (
                <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: 10 }}>창고 비어있음</div>
              )}
              {data?.items.map(s => (
                <div key={s.id} style={{
                  padding: '6px 8px', background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${GRADE_COLOR[s.item.grade] || 'var(--border)'}`,
                  borderRadius: 3, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <button onClick={() => withdraw(s.id)} disabled={busy} style={{ fontSize: 10, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                    ← 출고
                  </button>
                  <ItemIcon slot={s.item.slot ?? null} grade={s.item.grade} itemName={s.item.name} size={24} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: GRADE_COLOR[s.item.grade] || 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.item.name}
                      {s.enhanceLevel > 0 && <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--accent)' }}>+{s.enhanceLevel}</span>}
                      {s.quantity > 1 && <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--text-dim)' }}>×{s.quantity}</span>}
                    </div>
                    {(s.quality > 0 || s.prefixName) && (
                      <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>
                        {s.quality > 0 && <span style={{ color: s.quality >= 80 ? '#ffcc44' : '#888' }}>품질 {s.quality}%</span>}
                        {s.quality > 0 && s.prefixName && ' · '}
                        {s.prefixName && <span style={{ color: '#aaa' }}>{s.prefixName}</span>}
                      </div>
                    )}
                    {s.prefixStats && Object.keys(s.prefixStats).length > 0 && (
                      <div style={{ fontSize: 8, color: '#6a6', marginTop: 1 }}>
                        {Object.entries(s.prefixStats).map(([k, v]) => `${STAT_LABEL[k] || k}+${v}`).join(' ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
