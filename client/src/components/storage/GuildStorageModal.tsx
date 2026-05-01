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
  atk_pct: '공격%', matk_pct: '마공%', hp_pct: 'HP%', max_hp_pct: 'HP%', all_stats_pct: '전체%',
  crit_dmg_pct: '치명뎀', def_pierce_pct: '방무',
  damage_taken_down_pct: '피감', drop_rate_pct: '드랍',
  multi_hit_amp_pct: '다단', miss_combo_pct: '빗맞', evasion_burst_pct: '회피폭',
  shield_amp: '실드',
  // 소환사
  summon_amp: '소환뎀', summon_double_hit: '소환2타', summon_max_extra: '소환+',
  // 기존 접두사
  lifesteal_pct: '흡혈', dot_amp_pct: '도트', exp_bonus_pct: '경험치',
  gold_bonus_pct: '골드', guardian_pct: '방어', spd_pct: '속도증가', full_hp_amp_pct: '풀피증뎀',
  first_strike_pct: '선제', berserk_pct: '광전사', ambush_pct: '기습',
  predator_pct: '포식', def_reduce_pct: '방관', hp_regen: '재생',
  slow_pct: '감속', thorns_pct: '반사',
  // 110제 craft 추가 옵션
  execute_pct: '처형', undispellable: '디스펠면역',
  shield_on_low_hp: '저체력실드', reflect_skill: '스킬반사', def_convert_atk: '방어전환',
};

interface GuildStorageItem {
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
  depositedByName: string | null;
  depositedAt: string;
  itemName: string;
  grade: ItemGrade;
  slot: string | null;
}

interface GuildStorageLog {
  id: number;
  characterName: string;
  action: string;
  itemId: number | null;
  itemName: string | null;
  quantity: number;
  gold: number;
  createdAt: string;
}

interface GuildStorageData {
  guildId: number;
  guildName: string;
  maxSlots: number;
  treasury: number;
  isLeader: boolean;
  items: GuildStorageItem[];
  logs: GuildStorageLog[];
}

interface Props {
  inventory: InventorySlot[];
  onClose: () => void;
  onChange: () => void;
}

function actionLabel(action: string): string {
  switch (action) {
    case 'deposit_item': return '입고';
    case 'withdraw_item': return '출고';
    case 'deposit_gold': return '골드 입금';
    case 'withdraw_gold': return '골드 출금';
    default: return action;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function GuildStorageModal({ inventory, onClose, onChange }: Props) {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [data, setData] = useState<GuildStorageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [goldAmt, setGoldAmt] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'items' | 'logs'>('items');

  async function load() {
    if (!active) return;
    setErr('');
    try {
      const d = await api<GuildStorageData>(`/guild-storage/${active.id}`);
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
      setData(null);
    }
  }
  useEffect(() => { load(); }, [active?.id]);

  async function deposit(slotIdx: number) {
    if (!active || busy) return;
    setBusy(true); setErr('');
    try {
      await api(`/guild-storage/${active.id}/deposit-item`, { method: 'POST', body: JSON.stringify({ inventorySlotIndex: slotIdx }) });
      await load(); onChange();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }
  async function withdraw(storageItemId: number) {
    if (!active || busy) return;
    setBusy(true); setErr('');
    try {
      await api(`/guild-storage/${active.id}/withdraw-item`, { method: 'POST', body: JSON.stringify({ storageItemId }) });
      await load(); onChange();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }
  async function goldDeposit() {
    if (!active || busy) return;
    const amt = Number(goldAmt);
    if (!amt || amt <= 0) return;
    setBusy(true); setErr('');
    try {
      await api(`/guild-storage/${active.id}/deposit-gold`, { method: 'POST', body: JSON.stringify({ amount: amt }) });
      setGoldAmt(''); await load(); await refreshActive();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }
  async function goldWithdraw() {
    if (!active || busy) return;
    const amt = Number(goldAmt);
    if (!amt || amt <= 0) return;
    setBusy(true); setErr('');
    try {
      await api(`/guild-storage/${active.id}/withdraw-gold`, { method: 'POST', body: JSON.stringify({ amount: amt }) });
      setGoldAmt(''); await load(); await refreshActive();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-panel)', border: '2px solid #6a8fff',
        borderRadius: 6, padding: 16, width: 'min(980px, 95vw)',
        maxHeight: '92vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: '#6a8fff', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/images/items/misc/guild_storage.png" alt="" width={24} height={24} style={{ imageRendering: 'pixelated' }} />
            길드 창고 {data && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>— {data.guildName}</span>}
          </h2>
          <button onClick={onClose} style={{ fontSize: 12 }}>닫기</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10 }}>
          길드원 전원이 공유 · 입출금 자유 · 골드는 길드 금고(treasury)와 통합됨
        </div>

        {/* 골드 (treasury) */}
        <div style={{
          padding: 12, marginBottom: 12, background: 'var(--bg)',
          border: '1px solid #6a8fff', borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>길드 금고</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#6a8fff' }}>
              {(data?.treasury ?? 0).toLocaleString()} G
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
              내 골드: {(active?.gold ?? 0).toLocaleString()} G
            </div>
          </div>
          <input type="number" placeholder="금액" value={goldAmt} onChange={e => setGoldAmt(e.target.value)}
            style={{ width: 110, padding: '6px 8px' }} min={1} />
          <button onClick={goldDeposit} disabled={busy}>입금 →</button>
          <button
            onClick={goldWithdraw}
            disabled={busy || !data?.isLeader}
            title={data?.isLeader ? '' : '길드장만 출금 가능'}
            style={{ opacity: data?.isLeader ? 1 : 0.4, cursor: data?.isLeader ? 'pointer' : 'not-allowed' }}
          >← 출금 {data && !data.isLeader && '🔒'}</button>
        </div>
        {data && !data.isLeader && (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: -6, marginBottom: 10, paddingLeft: 4 }}>
            💡 길드 금고 출금은 길드장만 가능합니다 (입금 · 아이템 입출고는 모든 길드원 가능)
          </div>
        )}

        {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            onClick={() => setTab('items')}
            style={{ padding: '6px 14px', background: tab === 'items' ? '#6a8fff' : 'transparent', color: tab === 'items' ? '#000' : '#aaa', border: '1px solid #6a8fff', cursor: 'pointer', fontWeight: 700 }}
          >아이템</button>
          <button
            onClick={() => setTab('logs')}
            style={{ padding: '6px 14px', background: tab === 'logs' ? '#6a8fff' : 'transparent', color: tab === 'logs' ? '#000' : '#aaa', border: '1px solid #6a8fff', cursor: 'pointer', fontWeight: 700 }}
          >로그 ({data?.logs.length ?? 0})</button>
        </div>

        {tab === 'items' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 좌: 인벤토리 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                내 인벤토리 ({inventory.length})
              </div>
              <div style={{ maxHeight: '45vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
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

            {/* 우: 길드 창고 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                길드 창고 ({data?.items.length ?? 0}/{data?.maxSlots ?? 50})
              </div>
              <div style={{ maxHeight: '45vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(!data || data.items.length === 0) && (
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: 10 }}>길드 창고 비어있음</div>
                )}
                {data?.items.map(s => (
                  <div key={s.id} style={{
                    padding: '6px 8px', background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${GRADE_COLOR[s.grade] || 'var(--border)'}`,
                    borderRadius: 3, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <button onClick={() => withdraw(s.id)} disabled={busy} style={{ fontSize: 10, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                      ← 출고
                    </button>
                    <ItemIcon slot={s.slot ?? null} grade={s.grade} itemName={s.itemName} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: GRADE_COLOR[s.grade] || 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.itemName}
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
                      {s.depositedByName && (
                        <div style={{ fontSize: 8, color: '#555', marginTop: 1 }}>예치: {s.depositedByName}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
            {(!data || data.logs.length === 0) && (
              <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: 10 }}>로그 없음</div>
            )}
            {data?.logs.map(l => (
              <div key={l.id} style={{
                padding: '6px 10px', borderBottom: '1px solid var(--border)',
                display: 'grid', gridTemplateColumns: '80px 1fr 60px 140px', gap: 10, fontSize: 11,
              }}>
                <div style={{ color: '#aaa' }}>{fmtTime(l.createdAt)}</div>
                <div style={{ color: '#fff', fontWeight: 600 }}>{l.characterName}</div>
                <div style={{ color: '#6a8fff', fontWeight: 700 }}>{actionLabel(l.action)}</div>
                <div style={{ color: '#aaa', textAlign: 'right' }}>
                  {l.gold > 0 && <span>{l.gold.toLocaleString()} G</span>}
                  {l.itemName && <span>{l.itemName}{l.quantity > 1 && ` ×${l.quantity}`}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
