import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useCharacterStore } from '../../stores/characterStore';
import type { InventorySlot, ItemGrade } from '../../types';
import { GRADE_COLOR } from '../ui/ItemStats';
import { ItemIcon } from '../ui/ItemIcon';

const STAT_LABEL: Record<string, string> = {
  // 기본 스탯
  str: '힘', dex: '민첩', int: '지능', vit: '체력', spd: '속도', cri: '치명',
  accuracy: '명중', dodge: '회피',
  // % 계열 유니크/접두사
  atk_pct: '공격%', matk_pct: '마공%', hp_pct: 'HP%', max_hp_pct: 'HP%',
  crit_dmg_pct: '치명뎀', def_reduce_pct: '방관', def_pierce_pct: '방무',
  damage_taken_down_pct: '피감', drop_rate_pct: '드랍',
  multi_hit_amp_pct: '다단', miss_combo_pct: '빗맞', evasion_burst_pct: '회피폭',
  shield_amp: '실드',
  // 소환사
  summon_amp: '소환뎀', summon_double_hit: '소환2타', summon_max_extra: '소환+',
  // 기존 접두사
  lifesteal_pct: '흡혈', dot_amp_pct: '도트', exp_bonus_pct: '경험치',
  gold_bonus_pct: '골드', guardian_pct: '방어', spd_pct: '신속',
  first_strike_pct: '선제', berserk_pct: '광전사', ambush_pct: '기습',
  predator_pct: '포식', hp_regen: '재생', slow_pct: '감속', thorns_pct: '반사',
  // 110제 craft 추가 옵션
  execute_pct: '처형', undispellable: '디스펠면역',
  shield_on_low_hp: '저체력실드', reflect_skill: '스킬반사', def_convert_atk: '방어전환',
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

type TabKey = 'all' | 'weapon' | 'helm' | 'chest' | 'boots' | 'ring' | 'amulet' | 'consumable' | 'etc';
const TAB_DEFS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'weapon', label: '무기' },
  { key: 'helm', label: '투구' },
  { key: 'chest', label: '갑옷' },
  { key: 'boots', label: '신발' },
  { key: 'ring', label: '반지' },
  { key: 'amulet', label: '목걸이' },
  { key: 'consumable', label: '소모품' },
  { key: 'etc', label: '기타' },
];
function matchesTab(tab: TabKey, slot: string | null | undefined, type: string | undefined): boolean {
  if (tab === 'all') return true;
  if (tab === 'consumable') return type === 'consumable';
  if (tab === 'etc') return !slot && type !== 'consumable';
  return slot === tab;
}

export function StorageModal({ inventory, onClose, onChange }: Props) {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [data, setData] = useState<StorageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<TabKey>('all');

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

        {/* 카테고리 탭 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
          {TAB_DEFS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 3, cursor: 'pointer',
              background: tab === t.key ? 'var(--accent)' : 'var(--bg)',
              color: tab === t.key ? '#000' : 'var(--text-dim)',
              border: `1px solid ${tab === t.key ? 'var(--accent)' : 'var(--border)'}`,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* 좌: 인벤토리 */}
          <div>
            {(() => {
              const filteredInv = inventory.filter(s => matchesTab(tab, s.item.slot, (s.item as any).type));
              return <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              내 인벤토리 ({filteredInv.length})
            </div>
            <div style={{ maxHeight: '50vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredInv.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: 10 }}>해당 카테고리 아이템 없음</div>
              )}
              {filteredInv.map(s => {
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
                      {s.prefixStats && Object.keys(s.prefixStats).length > 0 && (
                        <div style={{ fontSize: 8, color: '#6a6', marginTop: 1 }}>
                          {Object.entries(s.prefixStats).map(([k, v]) => `${STAT_LABEL[k] || k}+${v}`).join(' ')}
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
              </>;
            })()}
          </div>

          {/* 우: 창고 */}
          <div>
            {(() => {
              const filteredStore = (data?.items ?? []).filter(s => matchesTab(tab, s.item.slot, s.item.type));
              return <>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              창고 ({filteredStore.length}/{data?.maxSlots ?? 60})
            </div>
            <div style={{ maxHeight: '50vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredStore.length === 0 && (
                <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: 10 }}>
                  {data && data.items.length > 0 ? '해당 카테고리 아이템 없음' : '창고 비어있음'}
                </div>
              )}
              {filteredStore.map(s => (
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
              </>;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
