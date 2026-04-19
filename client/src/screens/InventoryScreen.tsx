import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { InventorySlot, Equipped, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, ItemStatsBlock, getEnhanceMult } from '../components/ui/ItemStats';
import { ItemComparison } from '../components/ui/ItemComparison';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';
import { ItemIcon } from '../components/ui/ItemIcon';
import { StorageModal } from '../components/storage/StorageModal';
import { GuildStorageModal } from '../components/storage/GuildStorageModal';

const SLOT_LABEL: Record<string, string> = {
  weapon: '무기', helm: '투구', chest: '갑옷', boots: '장화',
  ring: '반지', amulet: '목걸이',
};
function SlotIcon({ slot, size = 20 }: { slot: string; size?: number }) {
  return <img src={`/images/slots/${slot}.png`} alt={slot} width={size} height={size}
    style={{ imageRendering: 'pixelated', verticalAlign: 'middle' }} />;
}

// 유니크 등급은 무지개 그라데이션 텍스트
const UNIQUE_RAINBOW_STYLE: React.CSSProperties = {
  background: 'linear-gradient(90deg, #ff3b3b, #ff8c2a, #ffe135, #3bd96b, #3bc8ff, #6b5bff, #c452ff)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};
function nameStyle(grade: string, fontSize: number): React.CSSProperties {
  if (grade === 'unique') return { ...UNIQUE_RAINBOW_STYLE, fontWeight: 700, fontSize };
  return { color: (GRADE_COLOR as any)[grade], fontWeight: 700, fontSize };
}

// 강화 비용/확률 (서버 enhance.ts와 동일 공식)
function getEnhanceInfo(currentLevel: number, charLevel: number) {
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

// 주요 스탯 한줄 요약 (강화 배율 + 품질 보너스 덧셈)
function StatSummary({ stats, enhanceLevel, quality = 0 }: { stats: Partial<Stats> | null | undefined; enhanceLevel: number; quality?: number }) {
  if (!stats) return null;
  const mult = getEnhanceMult(enhanceLevel) + quality / 100;
  const parts: string[] = [];
  const map: Record<string, string> = { atk: '공', matk: '마공', def: '방', hp: 'HP', str: '힘', int: '지', vit: '체', spd: '속', cri: '크리' };
  for (const [k, v] of Object.entries(stats)) {
    if (v && map[k]) parts.push(`${map[k]}${Math.round((v as number) * mult)}`);
  }
  if (parts.length === 0) return null;
  return <span style={{ fontSize: 10, color: 'var(--success)', opacity: 0.8 }}>{parts.join(' ')}</span>;
}

export function InventoryScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});
  const [msg, setMsg] = useState('');
  const [_legacyFlag] = useState(false); // 레거시 호환 유지
  const [dismantleTiers, setDismantleTiers] = useState<{ t1: boolean; t2: boolean; t3: boolean; t4: boolean }>({ t1: false, t2: false, t3: false, t4: false });
  const [sellQualityMax, setSellQualityMax] = useState(0);
  const [dropFilter, setDropFilter] = useState<{ t1: boolean; t2: boolean; t3: boolean; t4: boolean; qualityMax: number; common: boolean; protectPrefixes: string[] }>({ t1: false, t2: false, t3: false, t4: false, qualityMax: 0, common: false, protectPrefixes: [] });
  const [sellProtectPrefixes, setSellProtectPrefixes] = useState<string[]>([]);
  const [categoryTab, setCategoryTab] = useState<'recent' | 'weapon' | 'helm' | 'chest' | 'boots' | 'ring' | 'amulet' | 'consumable' | 'etc'>('recent');
  const [enhanceBusy, setEnhanceBusy] = useState(false);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<'equip' | 'bag'>('bag');
  const [storageOpen, setStorageOpen] = useState(false);
  const [guildStorageOpen, setGuildStorageOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'recent' | 'grade' | 'type' | 'level'>('recent');
  const [filterPanel, setFilterPanel] = useState<'sell' | 'drop' | null>(null);

  async function refresh() {
    if (!active) return;
    const data = await api<{ inventory: InventorySlot[]; equipped: Equipped }>(`/characters/${active.id}/inventory?sort=${sortMode}`);
    setInv(data.inventory); setEquipped(data.equipped);
  }

  useEffect(() => {
    if (!active) return;
    api<{ t1: boolean; t2: boolean; t3: boolean; t4: boolean; qualityMax: number; protectPrefixes: string[] }>(`/characters/${active.id}/auto-dismantle`)
      .then(d => {
        setDismantleTiers({ t1: d.t1, t2: d.t2, t3: d.t3, t4: d.t4 });
        setSellQualityMax(d.qualityMax ?? 0);
        setSellProtectPrefixes(d.protectPrefixes ?? []);
      }).catch(() => {});
    api<typeof dropFilter>(`/characters/${active.id}/drop-filter`)
      .then(d => setDropFilter(d)).catch(() => {});
  }, [active?.id]);
  useEffect(() => { refresh(); }, [active, sortMode]);

  async function equip(slotIndex: number) {
    if (!active) return; setMsg('');
    // 최초 장착 시 귀속 경고
    const target = inv.find(s => s.slotIndex === slotIndex);
    if (target && !target.soulbound) {
      const confirmed = confirm(
        '착용하면 이 장비는 계정에 귀속되어 거래소 등록/우편 발송/길드 창고 보관이 불가능해집니다.\n\n' +
        '(계정 창고를 통해 같은 계정 내 다른 캐릭터와는 공유 가능)\n\n' +
        '착용하시겠습니까?'
      );
      if (!confirmed) return;
    }
    try {
      await api(`/characters/${active.id}/equip`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
      await Promise.all([refresh(), refreshActive()]);
      if (target && !target.soulbound) setMsg('장착 완료 — 이 장비는 이제 계정 귀속 상태입니다.');
    }
    catch (e) { setMsg(e instanceof Error ? e.message : '장착 실패'); }
  }
  async function unequip(slot: string) {
    if (!active) return; setMsg('');
    try { await api(`/characters/${active.id}/unequip`, { method: 'POST', body: JSON.stringify({ slot }) }); await Promise.all([refresh(), refreshActive()]); }
    catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }
  async function sell(slotIndex: number, enhanceLevel: number, itemName: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    if (enhanceLevel > 0 && !confirm(`+${enhanceLevel} ${itemName} 판매?`)) return; setMsg('');
    try { const res = await api<{ sold: string; quantity: number; gold: number }>(`/characters/${active.id}/sell`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
      setMsg(`${res.sold} x${res.quantity} 판매 +${res.gold}G`); await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '판매 실패'); }
  }
  async function toggleLock(slotIndex: number, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    await api(`/characters/${active.id}/lock`, { method: 'POST', body: JSON.stringify({ slotIndex }) }); refresh();
  }
  async function useUniqueTicket(e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return; setMsg('');
    if (!confirm('유니크 무작위 추첨권을 사용하시겠습니까?\n캐릭 레벨 ±10 범위의 유니크 1개가 무작위 지급됩니다.')) return;
    try {
      const r = await api<{ ok: boolean; uniqueItemName: string }>(
        `/characters/${active.id}/use-unique-ticket`, { method: 'POST' }
      );
      setMsg(`유니크 추첨 성공: ${r.uniqueItemName}`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '사용 실패');
    }
  }
  async function craftUniquePiece(e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return; setMsg('');
    if (!confirm('유니크 조각 3개를 소모해 유니크 1개로 합성합니다. 진행하시겠습니까?')) return;
    try {
      const r = await api<{ ok: boolean; uniqueItemName: string }>(
        `/characters/${active.id}/craft-unique-piece`, { method: 'POST' }
      );
      setMsg(`유니크 조각 합성 성공: ${r.uniqueItemName}`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '합성 실패');
    }
  }
  async function toggleLockEquipped(slot: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    await api(`/characters/${active.id}/lock-equipped`, { method: 'POST', body: JSON.stringify({ slot }) }); refresh();
  }
  async function enhanceItem(_si: number, kind: 'inventory' | 'equipped', slotKey: number | string, e: React.MouseEvent, currentEnhLevel: number = 0) {
    e.stopPropagation(); if (!active || enhanceBusy) return;
    const info = getEnhanceInfo(currentEnhLevel, active.level);
    const ratePct = Math.round(info.chance * 100);
    const destroyTxt = info.destroyRate > 0 ? `\n파괴 확률: ${Math.round(info.destroyRate * 100)}%` : '';
    if (!confirm(`+${currentEnhLevel + 1} 강화 시도\n비용: ${info.cost.toLocaleString()}G\n성공 확률: ${ratePct}%${destroyTxt}`)) return;
    setEnhanceBusy(true); setMsg('');
    try { const r = await api<{ success: boolean; newLevel: number; cost: number; destroyed?: boolean }>(`/enhance/${active.id}/attempt`, { method: 'POST', body: JSON.stringify({ kind, slotKey, useScroll: false }) });
      if (r.destroyed) setMsg(`강화 실패 — 파괴! (-${r.cost.toLocaleString()}G)`);
      else if (r.success) setMsg(`강화 성공! +${r.newLevel} (-${r.cost.toLocaleString()}G)`);
      else setMsg(`강화 실패 (-${r.cost.toLocaleString()}G)`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '강화 실패'); } finally { setEnhanceBusy(false); }
  }
  async function toggleSellTier(tier: 't1' | 't2' | 't3' | 't4') {
    if (!active) return;
    try {
      const res = await api<{ t1: boolean; t2: boolean; t3: boolean; t4: boolean; qualityMax: number }>(
        `/characters/${active.id}/auto-dismantle`,
        { method: 'POST', body: JSON.stringify({ [tier]: !dismantleTiers[tier] }) }
      );
      setDismantleTiers({ t1: res.t1, t2: res.t2, t3: res.t3, t4: res.t4 });
      setSellQualityMax(res.qualityMax);
    } catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }
  async function updateSellQuality(val: number) {
    if (!active) return;
    setSellQualityMax(val);
    try {
      await api(`/characters/${active.id}/auto-dismantle`, { method: 'POST', body: JSON.stringify({ qualityMax: val }) });
    } catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }
  async function toggleDropFilter(key: string) {
    if (!active) return;
    const val = !(dropFilter as any)[key];
    try {
      const res = await api<typeof dropFilter>(
        `/characters/${active.id}/drop-filter`,
        { method: 'POST', body: JSON.stringify({ [key]: val }) }
      );
      setDropFilter(res);
    } catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }
  async function toggleSellPrefix(key: string) {
    if (!active) return;
    const next = sellProtectPrefixes.includes(key) ? sellProtectPrefixes.filter(k => k !== key) : [...sellProtectPrefixes, key];
    setSellProtectPrefixes(next);
    try { await api(`/characters/${active.id}/auto-dismantle`, { method: 'POST', body: JSON.stringify({ protectPrefixes: next }) }); }
    catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }
  async function toggleDropPrefix(key: string) {
    if (!active) return;
    const cur = dropFilter.protectPrefixes;
    const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
    setDropFilter(prev => ({ ...prev, protectPrefixes: next }));
    try { await api(`/characters/${active.id}/drop-filter`, { method: 'POST', body: JSON.stringify({ protectPrefixes: next }) }); }
    catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }
  async function updateDropFilterQuality(val: number) {
    if (!active) return;
    setDropFilter(prev => ({ ...prev, qualityMax: val }));
    try {
      await api(`/characters/${active.id}/drop-filter`, { method: 'POST', body: JSON.stringify({ qualityMax: val }) });
    } catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }

  // 장비/기타 분리
  const dfTiers = dropFilter.t1 || dropFilter.t2 || dropFilter.t3 || dropFilter.t4;
  const equipmentItems = inv.filter(s => !!s.item.slot);
  const etcItems = inv.filter(s => !s.item.slot);

  // 카테고리 필터링
  function filterByCategory(items: typeof inv) {
    if (categoryTab === 'recent') return [...items].sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'weapon') return items.filter(s => s.item.slot === 'weapon').sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'helm') return items.filter(s => s.item.slot === 'helm').sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'chest') return items.filter(s => s.item.slot === 'chest').sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'boots') return items.filter(s => s.item.slot === 'boots').sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'ring') return items.filter(s => s.item.slot === 'ring').sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'amulet') return items.filter(s => s.item.slot === 'amulet').sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'consumable') return items.filter(s => (s.item as any).type === 'consumable').sort((a, b) => b.slotIndex - a.slotIndex);
    if (categoryTab === 'etc') return items.filter(s => !s.item.slot && (s.item as any).type !== 'consumable').sort((a, b) => b.slotIndex - a.slotIndex);
    return items;
  }

  // 최근/장비 슬롯 → equipmentItems + 악세도 포함
  const allInv = [...equipmentItems, ...etcItems];
  const sortedInv = filterByCategory(allInv);

  const isGood = (m: string) => m.includes('성공') || m.includes('판매') || m.includes('분해') || m.includes('재굴림');

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ color: 'var(--accent)', margin: 0, fontSize: 18 }}>인벤토리</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setStorageOpen(true)} title="계정 창고" style={{
            fontSize: 11, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-panel)', border: '1px solid var(--accent)', color: 'var(--accent)',
            fontWeight: 700, borderRadius: 3, cursor: 'pointer',
          }}>📦 창고</button>
          <button onClick={() => setGuildStorageOpen(true)} title="길드 창고" style={{
            fontSize: 11, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--bg-panel)', border: '1px solid #6a8fff', color: '#6a8fff',
            fontWeight: 700, borderRadius: 3, cursor: 'pointer',
          }}>
            <img src="/images/items/misc/guild_storage.png" alt="" width={14} height={14} style={{ imageRendering: 'pixelated' }} />
            길드창고
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{inv.length}/300</span>
        </div>
      </div>

      {storageOpen && (
        <StorageModal inventory={inv} onClose={() => setStorageOpen(false)} onChange={refresh} />
      )}
      {guildStorageOpen && (
        <GuildStorageModal inventory={inv} onClose={() => setGuildStorageOpen(false)} onChange={refresh} />
      )}

      {/* 메시지 */}
      {msg && (
        <div style={{
          padding: '6px 10px', marginBottom: 8, fontSize: 11, fontWeight: 700, borderRadius: 4,
          background: isGood(msg) ? 'rgba(76,175,80,0.1)' : 'rgba(200,60,60,0.1)',
          color: isGood(msg) ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${isGood(msg) ? 'rgba(76,175,80,0.3)' : 'rgba(200,60,60,0.3)'}`,
        }}>{msg}</div>
      )}

      {/* 메인 탭 */}
      <div style={{ display: 'flex', marginBottom: 10, borderBottom: '2px solid var(--border)' }}>
        {([['equip', '장착'], ['bag', '가방']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '10px 0', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: tab === key ? 'var(--bg-panel)' : 'transparent',
            color: tab === key ? 'var(--accent)' : 'var(--text-dim)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2,
          }}>{label}{key === 'bag' ? ` (${inv.length})` : ''}</button>
        ))}
      </div>

      {/* ═══ 장착 탭 ═══ */}
      {tab === 'equip' && (() => {
        const renderSlot = (slot: string, label: string) => {
          const item = (equipped as any)[slot];
          const locked = item?.locked ?? false;
          return (
            <div style={{
              padding: 8, borderRadius: 6, background: 'var(--bg-panel)',
              border: `1px solid ${item ? (GRADE_COLOR as any)[item.grade] + '60' : 'var(--border)'}`,
              minWidth: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                {item ? <ItemIcon slot={slot} grade={item.grade} size={24} /> : <SlotIcon slot={slot} size={16} />}
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)' }}>{label}</span>
                {item && (
                  <img src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'} alt=""
                    onClick={(e) => { e.stopPropagation(); toggleLockEquipped(slot, e); }}
                    onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                    style={{ width: 20, height: 20, imageRendering: 'pixelated', opacity: locked ? 1 : 0.35, cursor: 'pointer', marginLeft: 'auto' }}
                  />
                )}
              </div>
              {item ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
                    <span style={nameStyle(item.grade, 12)}>{item.name}</span>
                    {item.enhanceLevel > 0 && <span style={{ color: 'var(--accent)' }}> +{item.enhanceLevel}</span>}
                    {(item as any).quality !== undefined && (
                      <span style={{ color: '#66ccff', fontSize: 9, marginLeft: 4 }}>· 품질 {(item as any).quality}%</span>
                    )}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <StatSummary stats={(item as any).baseStats || item.stats} enhanceLevel={item.enhanceLevel || 0} quality={(item as any).quality || 0} />
                  </div>
                  <PrefixDisplay prefixStats={item.prefixStats} prefixTiers={(item as any).prefixTiers} />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button onClick={() => unequip(slot)} style={btnStyle('var(--text-dim)', 'var(--border)')}>해제</button>
                    {!locked && (item.enhanceLevel || 0) < 20 && (() => {
                      const eInfo = getEnhanceInfo(item.enhanceLevel || 0, active?.level || 1);
                      return (
                        <button onClick={(e) => enhanceItem(-1, 'equipped', slot, e, item.enhanceLevel || 0)} style={btnStyle('var(--accent)', 'var(--accent)')}>
                          강화 {Math.round(eInfo.chance * 100)}% · {eInfo.cost.toLocaleString()}G
                        </button>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '8px 0', opacity: 0.12 }}>
                  <SlotIcon slot={slot} size={28} />
                </div>
              )}
            </div>
          );
        };

        const className = active?.className || 'warrior';
        return (
          <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto' }}>
            {/* 중앙 캐릭터 이미지 */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 8px',
            }}>
              <div style={{
                position: 'relative', width: 96, height: 96,
                border: '2px solid var(--accent)', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(218,165,32,0.1) 0%, transparent 70%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 20px rgba(218,165,32,0.15)',
              }}>
                <img src={`/images/classes/${className}.png`} alt={className}
                  width={64} height={64}
                  style={{ imageRendering: 'pixelated' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginTop: 6 }}>
                {active?.name} · Lv.{active?.level}
              </div>
            </div>

            {/* 장비 그리드: 3열 */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              gap: 6, marginTop: 8,
            }}>
              {renderSlot('helm', '투구')}
              {renderSlot('amulet', '목걸이')}
              {renderSlot('weapon', '무기')}
              {renderSlot('chest', '갑옷')}
              {renderSlot('ring', '반지')}
              {renderSlot('boots', '장화')}
            </div>
            <PresetBar type="equip" characterId={active?.id} onLoad={async () => { await Promise.all([refresh(), refreshActive()]); }} setMsg={setMsg} />
          </div>
        );
      })()}

      {/* ═══ 가방 탭 ═══ */}
      {tab === 'bag' && (
        <>
          {/* 카테고리 탭 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {([
              ['recent', '최근'],
              ['weapon', '무기'],
              ['helm', '투구'],
              ['chest', '갑옷'],
              ['boots', '신발'],
              ['ring', '반지'],
              ['amulet', '목걸이'],
              ['consumable', '소모품'],
              ['etc', '기타'],
            ] as const).map(([key, label]) => {
              const count = (() => {
                if (key === 'recent') return inv.length;
                if (key === 'weapon') return inv.filter(s => s.item.slot === 'weapon').length;
                if (key === 'helm') return inv.filter(s => s.item.slot === 'helm').length;
                if (key === 'chest') return inv.filter(s => s.item.slot === 'chest').length;
                if (key === 'boots') return inv.filter(s => s.item.slot === 'boots').length;
                if (key === 'ring') return inv.filter(s => s.item.slot === 'ring').length;
                if (key === 'amulet') return inv.filter(s => s.item.slot === 'amulet').length;
                if (key === 'consumable') return inv.filter(s => (s.item as any).type === 'consumable').length;
                if (key === 'etc') return inv.filter(s => !s.item.slot && (s.item as any).type !== 'consumable').length;
                return 0;
              })();
              return (
                <button key={key} onClick={() => setCategoryTab(key)} style={{
                  fontSize: 11, padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
                  background: categoryTab === key ? 'var(--accent)' : 'var(--bg-panel)',
                  color: categoryTab === key ? '#000' : 'var(--text-dim)',
                  border: `1px solid ${categoryTab === key ? 'var(--accent)' : 'var(--border)'}`,
                  fontWeight: categoryTab === key ? 700 : 400,
                }}>{label} {count > 0 && `(${count})`}</button>
              );
            })}
          </div>
          {/* 정렬 */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
            {([['recent', '최신순'], ['grade', '등급순'], ['type', '종류순'], ['level', '레벨순']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSortMode(key)} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 3,
                background: sortMode === key ? 'var(--accent)' : 'transparent',
                color: sortMode === key ? '#000' : 'var(--text-dim)',
                border: `1px solid ${sortMode === key ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: sortMode === key ? 700 : 400, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
          {/* 전체 판매 + 필터 설정 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={async () => {
              if (!active || !confirm('잠금되지 않은 모든 장비를 판매하시겠습니까?')) return;
              setMsg('');
              try {
                const res = await api<{ count: number; gold: number }>(`/characters/${active.id}/sell-bulk`, { method: 'POST', body: JSON.stringify({}) });
                setMsg(`${res.count}개 장비 판매 +${res.gold.toLocaleString()}G`);
                await Promise.all([refresh(), refreshActive()]);
              } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
            }} style={{
              fontSize: 12, padding: '8px 14px', borderRadius: 4,
              background: 'rgba(218,165,32,0.15)', color: 'var(--accent)',
              border: '1px solid var(--accent)', cursor: 'pointer', fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>전체 판매</button>
            <FilterToggleButton label="자동판매" active={dismantleTiers.t1 || dismantleTiers.t2 || dismantleTiers.t3 || dismantleTiers.t4} color="var(--accent)" onClick={() => setFilterPanel(filterPanel === 'sell' ? null : 'sell')} open={filterPanel === 'sell'} />
            <FilterToggleButton label="드랍필터" active={!!dfTiers || dropFilter.common} color="#ff6666" onClick={() => setFilterPanel(filterPanel === 'drop' ? null : 'drop')} open={filterPanel === 'drop'} />
          </div>

          {/* 자동판매 패널 */}
          {filterPanel === 'sell' && (
            <FilterPanel title="자동판매 설정" subtitle="사냥 시 조건에 맞는 장비를 자동으로 골드 변환" accentColor="var(--accent)" onClose={() => setFilterPanel(null)}>
              <FilterSection label="접두사 등급">
                <TierButtons tiers={dismantleTiers} onToggle={toggleSellTier} />
              </FilterSection>
              {(dismantleTiers.t1 || dismantleTiers.t2 || dismantleTiers.t3 || dismantleTiers.t4) && (<>
                <FilterSection label="품질 상한">
                  <QualitySlider value={sellQualityMax} onChange={updateSellQuality} color="var(--accent)" suffix="이하 판매" />
                </FilterSection>
                <FilterSection label="보호 접두사">
                  <PrefixProtectGrid selected={sellProtectPrefixes} onToggle={toggleSellPrefix} />
                </FilterSection>
              </>)}
              <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>유니크 · 3옵 · 보호접두 아이템은 항상 보호</div>
            </FilterPanel>
          )}

          {/* 드랍필터 패널 */}
          {filterPanel === 'drop' && (
            <FilterPanel title="드랍필터 설정" subtitle="사냥 시 조건에 맞는 장비를 줍지 않음" accentColor="#ff6666" onClose={() => setFilterPanel(null)}>
              <FilterSection label="등급 필터">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => toggleDropFilter('common')} style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 4,
                    background: dropFilter.common ? '#888' : 'transparent',
                    color: dropFilter.common ? '#000' : '#888',
                    border: '1px solid #888', cursor: 'pointer', fontWeight: 700,
                  }}>일반{dropFilter.common ? ' ✕' : ''}</button>
                </div>
              </FilterSection>
              <FilterSection label="접두사 등급">
                <TierButtons tiers={dropFilter} onToggle={(t) => toggleDropFilter(t)} suffix=" ✕" />
              </FilterSection>
              {(dropFilter.t1 || dropFilter.t2 || dropFilter.t3 || dropFilter.t4) && (<>
                <FilterSection label="품질 상한">
                  <QualitySlider value={dropFilter.qualityMax} onChange={updateDropFilterQuality} color="#ff6666" suffix="이하 안줍기" />
                </FilterSection>
                <FilterSection label="보호 접두사">
                  <PrefixProtectGrid selected={dropFilter.protectPrefixes} onToggle={toggleDropPrefix} />
                </FilterSection>
              </>)}
              <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>유니크 · 전설 · 3옵 · 보호접두 아이템은 항상 보호</div>
            </FilterPanel>
          )}

          {/* 아이템 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sortedInv.length === 0 && <div style={{ color: 'var(--text-dim)', padding: 30, textAlign: 'center' }}>가방이 비어있다.</div>}
            {sortedInv.map((s) => {
              const locked = (s as unknown as { locked?: boolean }).locked ?? false;
              const isEquipment = !!s.item.slot;
              const requiredLevel = (s.item as any).requiredLevel || 1;
              const charLevel = active?.level ?? 1;
              const levelTooLow = isEquipment && charLevel < requiredLevel;
              const isExpanded = expandedSlot === s.slotIndex;
              const gradeClr = GRADE_COLOR[s.item.grade];
              const isUnique = s.item.grade === 'unique';

              return (
                <div key={s.slotIndex}
                  onClick={() => setExpandedSlot(isExpanded ? null : s.slotIndex)}
                  style={{
                    padding: isExpanded ? '10px 12px' : '8px 12px',
                    borderRadius: 4, cursor: 'pointer',
                    background: isUnique
                      ? 'linear-gradient(135deg, rgba(255,59,59,0.06), rgba(196,82,255,0.06))'
                      : s.soulbound
                        ? 'linear-gradient(90deg, rgba(201,162,77,0.06), var(--bg-panel))'
                        : 'var(--bg-panel)',
                    borderLeft: `3px solid ${isUnique ? '#ff8c2a' : gradeClr}`,
                    borderTop: '1px solid transparent',
                    borderRight: s.soulbound ? '1px solid rgba(201,162,77,0.35)' : '1px solid transparent',
                    borderBottom: `1px solid ${isExpanded ? 'var(--accent)30' : 'var(--border)'}`,
                    boxShadow: isUnique ? '0 0 8px rgba(255,140,42,0.25)' : 'none',
                  }}
                >
                  {/* 헤더 행 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ItemIcon slot={s.item.slot} grade={s.item.grade} itemName={(s.item as any).baseName || s.item.name} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                        {(s as any).prefixName && (
                          <span style={{ color: '#66ccff', fontWeight: 700, fontSize: 13 }}>{(s as any).prefixName}</span>
                        )}
                        <span style={nameStyle(s.item.grade, 13)}>{(s.item as any).baseName || s.item.name}</span>
                        {(s as any).quality !== undefined && (s.item as any).slot && (() => {
                          const q = (s as any).quality;
                          const color = q >= 90 ? '#ff8800' : q >= 70 ? '#daa520' : q >= 40 ? '#66ccff' : q >= 20 ? '#8dc38d' : '#888';
                          return (
                            <span style={{
                              fontSize: 11, padding: '2px 7px', borderRadius: 3,
                              background: color + '22',
                              border: `1px solid ${color}`, color, fontWeight: 700,
                            }}>품질 {q}%</span>
                          );
                        })()}
                        {(s.item as any).classRestriction && (() => {
                          const cls = (s.item as any).classRestriction;
                          const krMap: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사' };
                          const colorMap: Record<string, string> = { warrior: '#e04040', mage: '#4080e0', cleric: '#daa520', rogue: '#a060c0' };
                          const charClass = active?.className;
                          const wrong = charClass && cls !== charClass;
                          return (
                            <span style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 2,
                              border: `1px solid ${colorMap[cls]}`,
                              color: wrong ? 'var(--danger)' : colorMap[cls],
                              fontWeight: 700,
                            }}>
                              {krMap[cls] || cls} 전용{wrong ? ' ✗' : ''}
                            </span>
                          );
                        })()}
                        {s.enhanceLevel > 0 && (
                          <span style={{
                            color: '#000', background: 'var(--accent)', padding: '0 4px',
                            borderRadius: 2, fontSize: 11, fontWeight: 900, lineHeight: '16px',
                          }}>+{s.enhanceLevel}</span>
                        )}
                        {s.soulbound && (
                          <span style={{
                            color: 'var(--accent)', background: 'rgba(201,162,77,0.15)',
                            border: '1px solid rgba(201,162,77,0.5)',
                            padding: '0 5px', borderRadius: 2, fontSize: 10, fontWeight: 700,
                            lineHeight: '14px', letterSpacing: 0.3,
                          }}>귀속</span>
                        )}
                        {s.quantity > 1 && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>x{s.quantity}</span>}
                      </div>
                      {/* 접힌 상태: 스탯 요약 + 접두사 + 비교 */}
                      {!isExpanded && (
                        <div style={{ marginTop: 1 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <StatSummary stats={(s.item as any).baseStats || s.item.stats} enhanceLevel={s.enhanceLevel || 0} quality={(s as any).quality || 0} />
                            {isEquipment && (
                              <ItemComparison
                                itemStats={s.item.stats} equippedStats={equipped[s.item.slot!]?.stats}
                                itemEnhance={s.enhanceLevel || 0} equippedEnhance={equipped[s.item.slot!]?.enhanceLevel || 0}
                              />
                            )}
                          </div>
                          {s.prefixStats && Object.keys(s.prefixStats).length > 0 && (
                            <PrefixDisplay prefixStats={s.prefixStats} prefixTiers={(s as any).prefixTiers} />
                          )}
                        </div>
                      )}
                    </div>
                    {isEquipment && (
                      <span style={{
                        fontSize: 9, color: levelTooLow ? 'var(--danger)' : 'var(--text-dim)',
                        opacity: 0.85, fontWeight: 700, flexShrink: 0,
                      }}>Lv.{requiredLevel}</span>
                    )}
                    <span style={{ fontSize: 9, color: gradeClr, opacity: 0.6 }}>{GRADE_LABEL[s.item.grade]}</span>
                    {isEquipment && (
                      <img src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'} alt=""
                        onClick={(e) => toggleLock(s.slotIndex, e)}
                        onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                        style={{ width: 22, height: 22, imageRendering: 'pixelated', opacity: locked ? 1 : 0.35, cursor: 'pointer', flexShrink: 0 }}
                      />
                    )}
                  </div>

                  {/* ── 펼침 상세 ── */}
                  {isExpanded && (() => {
                    const eqItem = isEquipment ? (equipped as any)[s.item.slot!] : null;
                    return (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {isEquipment && (
                        <div style={{ fontSize: 10, color: levelTooLow ? 'var(--danger)' : 'var(--text-dim)', marginBottom: 6 }}>
                          {SLOT_LABEL[s.item.slot!]} · Lv.{requiredLevel}{levelTooLow ? ' (레벨 부족)' : ''}
                        </div>
                      )}

                      {/* 장착 아이템과 비교 */}
                      {isEquipment ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {/* 이 아이템 */}
                          <div style={{ padding: 8, background: 'rgba(76,175,80,0.05)', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, marginBottom: 4 }}>이 아이템</div>
                            <ItemStatsBlock stats={(s.item as any).baseStats || s.item.stats} enhanceLevel={s.enhanceLevel || 0} quality={(s as any).quality || 0} />
                            <PrefixDisplay prefixStats={s.prefixStats} prefixTiers={(s as any).prefixTiers} />
                          </div>
                          {/* 현재 장착 */}
                          <div style={{ padding: 8, background: 'rgba(218,165,32,0.05)', border: '1px solid rgba(218,165,32,0.2)', borderRadius: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
                              현재 장착{eqItem ? '' : ' (없음)'}
                            </div>
                            {eqItem ? (
                              <>
                                <div style={{ fontSize: 11, color: (GRADE_COLOR as any)[eqItem.grade], fontWeight: 700, marginBottom: 3 }}>
                                  {eqItem.name}{eqItem.enhanceLevel > 0 && <span style={{ color: 'var(--accent)' }}> +{eqItem.enhanceLevel}</span>}
                                </div>
                                <ItemStatsBlock stats={(eqItem as any).baseStats || eqItem.stats} enhanceLevel={eqItem.enhanceLevel || 0} quality={(eqItem as any).quality || 0} />
                                <PrefixDisplay prefixStats={eqItem.prefixStats} prefixTiers={(eqItem as any).prefixTiers} />
                              </>
                            ) : (
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', opacity: 0.4 }}>장착 없음</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <ItemStatsBlock stats={s.item.stats} enhanceLevel={s.enhanceLevel || 0} />
                          <PrefixDisplay prefixStats={s.prefixStats} prefixTiers={(s as any).prefixTiers} />
                        </>
                      )}

                      {isEquipment && (
                        <div style={{ marginTop: 6 }}>
                          <ItemComparison
                            itemStats={s.item.stats} equippedStats={equipped[s.item.slot!]?.stats}
                            itemEnhance={s.enhanceLevel || 0} equippedEnhance={equipped[s.item.slot!]?.enhanceLevel || 0}
                          />
                        </div>
                      )}
                      <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
                        {s.item.description}
                      </div>

                      {/* 액션 버튼 — 큰 터치 영역 */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {isEquipment && !levelTooLow && (
                          <button onClick={(e) => { e.stopPropagation(); equip(s.slotIndex); }} style={{
                            padding: '8px 20px', fontSize: 13, fontWeight: 700,
                            background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer', borderRadius: 4,
                          }}>장착</button>
                        )}
                        {s.item.id === 477 && (
                          <button onClick={useUniqueTicket} style={{
                            padding: '8px 18px', fontSize: 13, fontWeight: 700,
                            background: 'linear-gradient(180deg, #ffd66b, #daa520)',
                            color: '#1a0f00', border: '1px solid #ffd66b', cursor: 'pointer', borderRadius: 4,
                            boxShadow: '0 0 8px rgba(218,165,32,0.4)',
                          }}>유니크 뽑기</button>
                        )}
                        {s.item.id === 842 && s.quantity >= 3 && (
                          <button onClick={craftUniquePiece} style={{
                            padding: '8px 18px', fontSize: 13, fontWeight: 700,
                            background: 'linear-gradient(180deg, #c8a2ff, #a24bff)',
                            color: '#1a0f2a', border: '1px solid #c8a2ff', cursor: 'pointer', borderRadius: 4,
                            boxShadow: '0 0 8px rgba(162,75,255,0.4)',
                          }}>유니크 합성 (3개 소모)</button>
                        )}
                        {s.item.sellPrice > 0 && !locked && (
                          <button onClick={(e) => sell(s.slotIndex, s.enhanceLevel, s.item.name, e)}
                            style={actionBtn('#e0a040')}>판매 {s.item.sellPrice}G</button>
                        )}
                        {isEquipment && !locked && (() => {
                          const eInfo = getEnhanceInfo(s.enhanceLevel || 0, active?.level || 1);
                          const maxed = (s.enhanceLevel || 0) >= 20;
                          return (
                            <button onClick={(e) => enhanceItem(s.slotIndex, 'inventory', s.slotIndex, e, s.enhanceLevel || 0)}
                              disabled={enhanceBusy || maxed}
                              style={{
                                padding: '8px 14px', fontSize: 12, fontWeight: 700,
                                background: 'rgba(218,165,32,0.15)',
                                color: 'var(--accent)',
                                border: '2px solid var(--accent)',
                                cursor: 'pointer', borderRadius: 4,
                                opacity: maxed ? 0.3 : 1,
                                boxShadow: '0 0 6px rgba(218,165,32,0.3)',
                                lineHeight: 1.3,
                              }}>
                              {maxed ? '최대' : (
                                <span>강화 +{(s.enhanceLevel || 0) + 1}<br/><span style={{ fontSize: 10, fontWeight: 400 }}>{Math.round(eInfo.chance * 100)}% · {eInfo.cost.toLocaleString()}G</span></span>
                              )}
                            </button>
                          );
                        })()}
                      </div>
                      {locked && <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 6 }}>잠김</div>}
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}

// 공통 버튼 스타일
function btnStyle(color: string, border: string): React.CSSProperties {
  return { padding: '4px 10px', fontSize: 10, background: 'transparent', color, border: `1px solid ${border}`, cursor: 'pointer', borderRadius: 3 };
}
function actionBtn(color: string): React.CSSProperties {
  return { padding: '6px 14px', fontSize: 11, background: 'transparent', color, border: `1px solid ${color}50`, cursor: 'pointer', borderRadius: 4 };
}

const PREFIX_OPTIONS: { key: string; label: string; color: string; group: string }[] = [
  { key: 'str', label: 'STR', color: '#ff6644', group: '스탯' },
  { key: 'dex', label: 'DEX', color: '#44cc88', group: '스탯' },
  { key: 'int', label: 'INT', color: '#6688ff', group: '스탯' },
  { key: 'vit', label: 'VIT', color: '#88aa44', group: '스탯' },
  { key: 'spd', label: 'SPD', color: '#44cccc', group: '스탯' },
  { key: 'cri', label: 'CRI', color: '#ff4488', group: '공격' },
  { key: 'crit_dmg_pct', label: '치명뎀', color: '#ff6688', group: '공격' },
  { key: 'accuracy', label: '명중', color: '#ccaa44', group: '공격' },
  { key: 'def_reduce_pct', label: '방관', color: '#cc6644', group: '공격' },
  { key: 'dot_amp_pct', label: '도트', color: '#88ff44', group: '공격' },
  { key: 'lifesteal_pct', label: '흡혈', color: '#cc4444', group: '유틸' },
  { key: 'dodge', label: '회피', color: '#88ccff', group: '유틸' },
  { key: 'guardian_pct', label: '방어', color: '#8888cc', group: '유틸' },
  { key: 'hp_regen', label: '재생', color: '#44cc44', group: '유틸' },
  { key: 'predator_pct', label: '포식', color: '#66aa44', group: '유틸' },
  { key: 'gauge_on_crit_pct', label: '게이지', color: '#ff8844', group: '특수' },
  { key: 'first_strike_pct', label: '선제', color: '#cc88ff', group: '특수' },
  { key: 'berserk_pct', label: '광전사', color: '#ff4444', group: '특수' },
  { key: 'ambush_pct', label: '각성', color: '#aa66ff', group: '특수' },
  { key: 'exp_bonus_pct', label: '경험치', color: '#aaddff', group: '보상' },
  { key: 'gold_bonus_pct', label: '골드', color: '#ffdd44', group: '보상' },
  { key: 'slow_pct', label: '감속', color: '#6688aa', group: '기타' },
  { key: 'thorns_pct', label: '반사', color: '#aa8844', group: '기타' },
  // 신규 8종 (4월 패치)
  { key: 'max_hp_pct', label: '최대HP%', color: '#44dd66', group: '스탯' },
  { key: 'atk_pct', label: '공격%', color: '#ff8844', group: '공격' },
  { key: 'matk_pct', label: '마공%', color: '#aa66ff', group: '공격' },
  { key: 'def_pierce_pct', label: '추가방관', color: '#cc6644', group: '공격' },
  { key: 'multi_hit_amp_pct', label: '다단뎀', color: '#ff6644', group: '공격' },
  { key: 'miss_combo_pct', label: '빗누적', color: '#66ccaa', group: '특수' },
  { key: 'evasion_burst_pct', label: '회피반격', color: '#88ccff', group: '특수' },
  { key: 'drop_rate_pct', label: '드랍률', color: '#ffaadd', group: '보상' },
];

function FilterToggleButton({ label, active, color, onClick, open }: { label: string; active: boolean; color: string; onClick: () => void; open: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 700,
      background: open ? color : active ? `${color}20` : 'transparent',
      color: open ? '#000' : active ? color : 'var(--text-dim)',
      border: `1px solid ${active || open ? color : 'var(--border)'}`,
      whiteSpace: 'nowrap', flex: 1,
    }}>
      {label}{active && !open ? ' ●' : ''}
    </button>
  );
}

function FilterPanel({ title, subtitle, accentColor, onClose, children }: {
  title: string; subtitle: string; accentColor: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      marginBottom: 10, padding: '14px 16px', borderRadius: 8,
      background: 'var(--bg-panel)', border: `1px solid ${accentColor}40`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: accentColor }}>{title}</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{subtitle}</div>
        </div>
        <button onClick={onClose} style={{
          fontSize: 11, padding: '4px 10px', background: 'transparent',
          color: 'var(--text-dim)', border: '1px solid var(--border)',
          borderRadius: 4, cursor: 'pointer',
        }}>닫기</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const TIER_COLORS: Record<string, string> = { t1: '#5b8ecc', t2: '#b060cc', t3: '#ffcc33', t4: '#ff4444' };

function TierButtons({ tiers, onToggle, suffix }: { tiers: { t1: boolean; t2: boolean; t3: boolean; t4: boolean }; onToggle: (t: 't1'|'t2'|'t3'|'t4') => void; suffix?: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {(['t1','t2','t3','t4'] as const).map(t => {
        const on = tiers[t];
        const c = TIER_COLORS[t];
        return (
          <button key={t} onClick={() => onToggle(t)} style={{
            fontSize: 13, padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
            background: on ? c : 'transparent', color: on ? '#000' : c,
            border: `2px solid ${c}`, minWidth: 54, textAlign: 'center',
          }}>{t.toUpperCase()}{on && suffix ? suffix : ''}</button>
        );
      })}
    </div>
  );
}

function QualitySlider({ value, onChange, color, suffix }: { value: number; onChange: (v: number) => void; color: string; suffix: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <input type="range" min={0} max={100} step={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, height: 20, accentColor: color }} />
      <span style={{
        fontWeight: 700, fontSize: 14, minWidth: 80, textAlign: 'right',
        color: value === 0 ? 'var(--text-dim)' : color,
      }}>
        {value === 0 ? 'OFF' : `${value}% ${suffix}`}
      </span>
    </div>
  );
}

function PrefixProtectGrid({ selected, onToggle }: { selected: string[]; onToggle: (key: string) => void }) {
  const set = new Set(selected);
  const groups = [...new Set(PREFIX_OPTIONS.map(p => p.group))];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {groups.map(group => (
        <div key={group}>
          <div style={{ fontSize: 9, color: '#666', marginBottom: 3 }}>{group}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PREFIX_OPTIONS.filter(p => p.group === group).map(p => {
              const on = set.has(p.key);
              return (
                <button key={p.key} onClick={() => onToggle(p.key)} style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 4,
                  background: on ? p.color : 'transparent',
                  color: on ? '#000' : p.color,
                  border: `1px solid ${on ? p.color : p.color + '50'}`,
                  cursor: 'pointer', fontWeight: on ? 700 : 500,
                }}>{p.label}</button>
              );
            })}
          </div>
        </div>
      ))}
      {selected.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--accent)' }}>{selected.length}개 접두사 보호 중</div>
      )}
    </div>
  );
}

function PresetBar({ characterId, onLoad, setMsg }: { type?: string; characterId?: number; onLoad: () => Promise<void>; setMsg: (s: string) => void }) {
  const [presets, setPresets] = useState<{ idx: number; name: string; empty: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!characterId) return;
    api<{ idx: number; name: string; empty: boolean }[]>(`/characters/${characterId}/equip-presets`)
      .then(setPresets).catch(() => {});
  }, [characterId]);

  async function save(idx: number) {
    if (!characterId || busy) return;
    setBusy(true);
    try {
      await api(`/characters/${characterId}/equip-presets/${idx}/save`, { method: 'POST' });
      setMsg(`프리셋 ${idx} 저장 완료`);
      const fresh = await api<{ idx: number; name: string; empty: boolean }[]>(`/characters/${characterId}/equip-presets`);
      setPresets(fresh);
    } catch (e) { setMsg(e instanceof Error ? e.message : '저장 실패'); }
    setBusy(false);
  }

  async function load(idx: number) {
    if (!characterId || busy) return;
    if (!confirm(`프리셋 ${idx}을 불러오시겠습니까?\n현재 장비가 인벤토리로 이동됩니다.`)) return;
    setBusy(true);
    try {
      const r = await api<{ equipped: number }>(`/characters/${characterId}/equip-presets/${idx}/load`, { method: 'POST' });
      setMsg(`프리셋 ${idx} 로드 완료 (${r.equipped}개 장착)`);
      await onLoad();
    } catch (e) { setMsg(e instanceof Error ? e.message : '로드 실패'); }
    setBusy(false);
  }

  async function rename(idx: number) {
    if (!characterId) return;
    const name = prompt('프리셋 이름을 입력하세요 (최대 20자)', presets.find(p => p.idx === idx)?.name || '');
    if (name === null) return;
    try {
      await api(`/characters/${characterId}/equip-presets/${idx}/rename`, { method: 'POST', body: JSON.stringify({ name }) });
      const fresh = await api<{ idx: number; name: string; empty: boolean }[]>(`/characters/${characterId}/equip-presets`);
      setPresets(fresh);
    } catch (e) { setMsg(e instanceof Error ? e.message : '이름 변경 실패'); }
  }

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>장비 프리셋</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {presets.map(p => (
          <div key={p.idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => rename(p.idx)} style={{
              fontSize: 11, fontWeight: 700, padding: '4px 0', background: 'transparent',
              color: p.empty ? 'var(--text-dim)' : 'var(--accent)', border: 'none', cursor: 'pointer',
              textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.name}</button>
            <div style={{ display: 'flex', gap: 3 }}>
              <button onClick={() => save(p.idx)} disabled={busy} style={{
                flex: 1, fontSize: 10, padding: '6px 0', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)',
              }}>저장</button>
              <button onClick={() => load(p.idx)} disabled={busy || p.empty} style={{
                flex: 1, fontSize: 10, padding: '6px 0', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                background: p.empty ? 'transparent' : 'var(--accent)', color: p.empty ? 'var(--text-dim)' : '#000',
                border: `1px solid ${p.empty ? 'var(--border)' : 'var(--accent)'}`,
                opacity: p.empty ? 0.4 : 1,
              }}>로드</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
