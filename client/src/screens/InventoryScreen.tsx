import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { InventorySlot, Equipped, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, ItemStatsBlock, getEnhanceMult } from '../components/ui/ItemStats';
import { ItemComparison } from '../components/ui/ItemComparison';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';
import { ItemIcon } from '../components/ui/ItemIcon';
import { StorageModal } from '../components/storage/StorageModal';

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
  const [dropFilter, setDropFilter] = useState<{ t1: boolean; t2: boolean; t3: boolean; t4: boolean; common: boolean; protectPrefixes: string[]; protect3opt: boolean }>({ t1: false, t2: false, t3: false, t4: false, common: false, protectPrefixes: [], protect3opt: true });
  const [categoryTab, setCategoryTab] = useState<'recent' | 'weapon' | 'helm' | 'chest' | 'boots' | 'ring' | 'amulet' | 'consumable' | 'etc'>('recent');
  const [enhanceBusy, setEnhanceBusy] = useState(false);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<'equip' | 'bag'>('bag');
  const [storageOpen, setStorageOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'recent' | 'grade' | 'type' | 'level'>('recent');
  const [filterPanel, setFilterPanel] = useState<'sell' | 'drop' | null>(null);
  // 거래소 등록 모달
  const [listModal, setListModal] = useState<InventorySlot | null>(null);
  const [listPrice, setListPrice] = useState('');
  const [listBusy, setListBusy] = useState(false);
  const [listQuota, setListQuota] = useState<{ active: number; max: number } | null>(null);

  async function refresh() {
    if (!active) return;
    const data = await api<{ inventory: InventorySlot[]; equipped: Equipped }>(`/characters/${active.id}/inventory?sort=${sortMode}`);
    setInv(data.inventory); setEquipped(data.equipped);
  }

  useEffect(() => {
    if (!active) return;
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
  async function sell(slotIndex: number, enhanceLevel: number, itemName: string, grade: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    // 강화한 템 / 유니크는 추가 경고창 (2단계 확인)
    const isUnique = grade === 'unique';
    const isEnhanced = enhanceLevel > 0;
    if (isUnique || isEnhanced) {
      const tag = isUnique ? '⚠ 유니크' : `⚠ +${enhanceLevel} 강화`;
      const confirmed = confirm(
        `${tag} 아이템을 폐기합니다.\n\n` +
        `[${itemName}]\n` +
        `골드는 지급되지 않고 아이템은 영구 삭제됩니다.\n\n` +
        `정말 폐기하시겠습니까?`
      );
      if (!confirmed) return;
    } else {
      if (!confirm(`${itemName}을(를) 폐기하시겠습니까? (골드 지급 없음)`)) return;
    }
    setMsg('');
    try { const res = await api<{ sold: string; quantity: number }>(`/characters/${active.id}/sell`, { method: 'POST', body: JSON.stringify({ slotIndex }) });
      setMsg(`${res.sold} x${res.quantity} 폐기 완료`); await Promise.all([refresh(), refreshActive()]);
    } catch (e) { setMsg(e instanceof Error ? e.message : '폐기 실패'); }
  }
  async function toggleLock(slotIndex: number, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    await api(`/characters/${active.id}/lock`, { method: 'POST', body: JSON.stringify({ slotIndex }) }); refresh();
  }

  // T4 접두사 장비 → 신비한 가루 1 추출
  async function extractItem(invId: number, itemName: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    if (!confirm(`[${itemName}] 추출\n\n장비를 영구 삭제하고 신비한 가루 1개로 변환합니다.\n계속하시겠습니까?`)) return;
    setMsg('');
    try {
      const r = await api<{ extracted: string; rewardName: string; rewardQty: number; message: string }>(
        `/craft/extract`, { method: 'POST', body: JSON.stringify({ characterId: active.id, invId }) }
      );
      setMsg(r.message);
      await refresh();
    } catch (err) { setMsg(err instanceof Error ? err.message : '추출 실패'); }
  }

  // 접두사 추첨권 — 슬롯+티어 선택 모달 (T1/T2/T3 통합)
  const VOUCHER_IDS_BY_TIER: Record<number, number[]> = { 1: [857], 2: [856], 3: [840, 911] };
  const [voucherTarget, setVoucherTarget] = useState<{
    invId: number; name: string; prefixIds: number[]; prefixNames: string[];
    counts: Record<number, number>;     // tier → 보유 추첨권 수
  } | null>(null);
  function getVoucherCounts(): Record<number, number> {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (const it of inv as any[]) {
      for (const [tier, ids] of Object.entries(VOUCHER_IDS_BY_TIER)) {
        if (ids.includes(it.item.id)) counts[Number(tier)] += it.quantity || 0;
      }
    }
    return counts;
  }
  function openVoucherModal(targetInvId: number, targetName: string, prefixIds: number[], prefixName: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    if (prefixIds.length === 0) { setMsg('이 장비는 접두사가 없습니다.'); return; }
    const names = prefixName ? prefixName.trim().split(/\s+/) : [];
    setVoucherTarget({
      invId: targetInvId,
      name: targetName,
      prefixIds,
      prefixNames: names.length === prefixIds.length ? names : prefixIds.map((_, i) => `${i + 1}번 옵션`),
      counts: getVoucherCounts(),
    });
  }
  async function applyVoucherReroll(prefixIndex: number, forceTier: number) {
    if (!active || !voucherTarget) return;
    const curName = voucherTarget.prefixNames[prefixIndex] || '???';
    if (!confirm(`${voucherTarget.name} 의 ${prefixIndex + 1}번 옵션 "${curName}" 를 T${forceTier} 로 재굴림합니다.\n추첨권 1개가 소모됩니다. 진행하시겠습니까?`)) return;
    setMsg('');
    try {
      const r = await api<{ targetName: string; oldName: string; newName: string; tier: number; message: string }>(
        `/craft/use-voucher`,
        { method: 'POST', body: JSON.stringify({ characterId: active.id, targetInvId: voucherTarget.invId, prefixIndex, forceTier }) }
      );
      setMsg(r.message);
      setVoucherTarget(null);
      await refresh();
    } catch (err) { setMsg(err instanceof Error ? err.message : '추첨권 사용 실패'); }
  }
  async function depositToStorage(slotIndex: number, itemName: string, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return;
    setMsg('');
    try {
      await api('/storage/deposit', { method: 'POST', body: JSON.stringify({ characterId: active.id, inventorySlotIndex: slotIndex }) });
      setMsg(`${itemName} 창고 보관 완료`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '창고 보관 실패');
    }
  }
  async function openListModal(slot: InventorySlot, e: React.MouseEvent) {
    e.stopPropagation();
    setListModal(slot);
    setListPrice('');
    // 한도 현황 조회
    try {
      const q = await api<{ active: number; max: number }>('/marketplace/listings-quota');
      setListQuota(q);
    } catch { setListQuota(null); }
  }
  async function submitList() {
    if (!active || !listModal) return;
    const priceNum = Number(listPrice.replace(/,/g, ''));
    if (!priceNum || priceNum <= 0 || !Number.isInteger(priceNum)) { setMsg('올바른 가격을 입력하세요'); return; }
    // 고가치 템(유니크 / +5 이상 강화 / 3옵) 확인 다이얼로그
    const grade = listModal.item.grade;
    const el = listModal.enhanceLevel || 0;
    const optCount = listModal.prefixIds ? listModal.prefixIds.length : 0;
    const warnings: string[] = [];
    if (grade === 'unique') warnings.push('유니크 장비');
    if (el >= 5) warnings.push(`+${el} 강화`);
    if (optCount >= 3) warnings.push('3옵 장비');
    if (warnings.length > 0) {
      const ok = confirm(
        `⚠ ${warnings.join(' · ')}\n\n` +
        `[${listModal.item.name}]\n` +
        `등록가: ${priceNum.toLocaleString()} G\n` +
        `수수료 10% 제외 후 실수령: ${Math.floor(priceNum * 0.9).toLocaleString()} G\n\n` +
        `거래소에 등록하시겠습니까?`
      );
      if (!ok) return;
    }
    setListBusy(true); setMsg('');
    try {
      await api('/marketplace/list', {
        method: 'POST',
        body: JSON.stringify({ characterId: active.id, slotIndex: listModal.slotIndex, price: priceNum, quantity: 1 }),
      });
      setMsg(`${listModal.item.name} 거래소 등록 완료 (${priceNum.toLocaleString()} G)`);
      setListModal(null); setListPrice('');
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setListBusy(false);
    }
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
  async function openGuildBossChest(tier: 'gold' | 'silver' | 'copper', e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return; setMsg('');
    const label = tier === 'gold' ? '황금빛 상자' : tier === 'silver' ? '은빛 상자' : '구리 상자';
    if (!confirm(`${label}를 개봉하시겠습니까?\n개봉 시 골드/EXP/메달/부스터/잭팟이 지급됩니다.`)) return;
    try {
      const r = await api<{
        ok: boolean; tier: string;
        chestReward: { gold: number; medals: number; exp: number; items: { itemId: number; qty: number; name: string }[]; jackpots: string[] };
      }>(`/guild-boss/open-chest/${active.id}`, { method: 'POST', body: JSON.stringify({ tier }) });
      const parts = [
        `골드 +${r.chestReward.gold.toLocaleString()}`,
        `EXP +${r.chestReward.exp.toLocaleString()}`,
        `메달 +${r.chestReward.medals}`,
      ];
      if (r.chestReward.items.length > 0) parts.push(r.chestReward.items.map(i => `${i.name}×${i.qty}`).join(', '));
      if (r.chestReward.jackpots.length > 0) parts.push(`잭팟: ${r.chestReward.jackpots.join(', ')}`);
      setMsg(`${label} 개봉! ${parts.join(' / ')}`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '개봉 실패');
    }
  }
  async function openSproutBox(boxLevel: number, e: React.MouseEvent) {
    e.stopPropagation(); if (!active) return; setMsg('');
    if (!confirm(`차원새싹상자 (Lv.${boxLevel})를 개봉하시겠습니까?\n장비 + 골드가 지급됩니다. (계정 귀속)`)) return;
    try {
      const r = await api<{
        ok: boolean;
        reward: { gold: number; items: { itemId: number }[]; invCount: number; mailCount: number };
      }>(`/sprout-box/open/${active.id}`, { method: 'POST', body: JSON.stringify({ boxLevel }) });
      const parts = [`골드 +${r.reward.gold.toLocaleString()}`, `장비 ${r.reward.items.length}종`];
      if (r.reward.mailCount > 0) parts.push(`우편 ${r.reward.mailCount}건`);
      setMsg(`차원새싹상자 (Lv.${boxLevel}) 개봉! ${parts.join(' / ')}`);
      await Promise.all([refresh(), refreshActive()]);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '개봉 실패');
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
  async function toggleDropPrefix(key: string) {
    if (!active) return;
    const cur = dropFilter.protectPrefixes;
    const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
    setDropFilter(prev => ({ ...prev, protectPrefixes: next }));
    try { await api(`/characters/${active.id}/drop-filter`, { method: 'POST', body: JSON.stringify({ protectPrefixes: next }) }); }
    catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }
  async function toggleDropProtect3opt() {
    if (!active) return;
    const next = !dropFilter.protect3opt;
    setDropFilter(prev => ({ ...prev, protect3opt: next }));
    try { await api(`/characters/${active.id}/drop-filter`, { method: 'POST', body: JSON.stringify({ protect3opt: next }) }); }
    catch (e) { setMsg(e instanceof Error ? e.message : '설정 실패'); }
  }
  // 장비/기타 분리
  const dfTiers = dropFilter.t1 || dropFilter.t2 || dropFilter.t3 || dropFilter.t4;
  const equipmentItems = inv.filter(s => !!s.item.slot);
  const etcItems = inv.filter(s => !s.item.slot);

  // 카테고리 필터링 — 서버 sortMode 순서 그대로 유지
  // (잠금 토글 시 아이템이 위로 튀는 것을 막기 위해 locked-first 재정렬 제거)
  //   (Array.prototype.sort 는 stable sort 이므로 0 반환 시 원래 순서 보존)
  function orderBy(a: InventorySlot, b: InventorySlot) {
    void a; void b;
    return 0; // 서버가 준 순서 그대로 (최신/등급/종류/레벨순 적용) — lock 상태 무관
  }
  function filterByCategory(items: typeof inv) {
    if (categoryTab === 'recent') return [...items].sort(orderBy);
    if (categoryTab === 'weapon') return items.filter(s => s.item.slot === 'weapon').sort(orderBy);
    if (categoryTab === 'helm') return items.filter(s => s.item.slot === 'helm').sort(orderBy);
    if (categoryTab === 'chest') return items.filter(s => s.item.slot === 'chest').sort(orderBy);
    if (categoryTab === 'boots') return items.filter(s => s.item.slot === 'boots').sort(orderBy);
    if (categoryTab === 'ring') return items.filter(s => s.item.slot === 'ring').sort(orderBy);
    if (categoryTab === 'amulet') return items.filter(s => s.item.slot === 'amulet').sort(orderBy);
    if (categoryTab === 'consumable') return items.filter(s => (s.item as any).type === 'consumable').sort(orderBy);
    if (categoryTab === 'etc') return items.filter(s => !s.item.slot && (s.item as any).type !== 'consumable').sort(orderBy);
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
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{inv.length}/300</span>
        </div>
      </div>

      {storageOpen && (
        <StorageModal inventory={inv} onClose={() => setStorageOpen(false)} onChange={refresh} />
      )}

      {/* 거래소 등록 모달 */}
      {listModal && (
        <div onClick={() => !listBusy && setListModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--accent)' }}>💰 거래소 등록</div>
            <div style={{ fontSize: 12, marginBottom: 12, padding: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
              <div style={nameStyle(listModal.item.grade, 13)}>
                {listModal.item.name}
                {listModal.enhanceLevel > 0 && (
                  <span style={{ color: 'var(--accent)', WebkitTextFillColor: 'var(--accent)' }}> +{listModal.enhanceLevel}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                {GRADE_LABEL[listModal.item.grade as keyof typeof GRADE_LABEL]} · {SLOT_LABEL[listModal.item.slot || ''] || listModal.item.slot}
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
              등록 한도: {listQuota ? `${listQuota.active} / ${listQuota.max}` : '조회 중…'}
            </div>

            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, marginTop: 8 }}>
              가격 (Gold)
            </label>
            <input type="text" inputMode="numeric" value={listPrice}
              onChange={(e) => setListPrice(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="예: 10000"
              autoFocus
              style={{ width: '100%', padding: 10, fontSize: 14, background: 'rgba(0,0,0,0.4)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, boxSizing: 'border-box' }} />
            {listPrice && Number(listPrice) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                수수료 10% 제외 실수령: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{Math.floor(Number(listPrice) * 0.9).toLocaleString()} G</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => !listBusy && setListModal(null)} disabled={listBusy}
                style={{ flex: 1, padding: 10, background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 4, cursor: listBusy ? 'not-allowed' : 'pointer' }}>
                취소
              </button>
              <button onClick={submitList} disabled={listBusy || !listPrice || Number(listPrice) <= 0}
                style={{ flex: 1, padding: 10, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: (listBusy || !listPrice) ? 'not-allowed' : 'pointer', opacity: (listBusy || !listPrice) ? 0.5 : 1 }}>
                {listBusy ? '등록 중…' : '등록'}
              </button>
            </div>
          </div>
        </div>
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
                  <span
                    onClick={(e) => { e.stopPropagation(); toggleLockEquipped(slot, e); }}
                    title={locked ? '잠금 해제' : '잠금'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      marginLeft: 'auto', padding: '1px 5px', borderRadius: 3,
                      background: locked ? 'rgba(255,90,90,0.12)' : 'transparent',
                      border: `1px solid ${locked ? '#ff5a5a' : '#555'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <img src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'} alt=""
                      onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                      style={{ width: 18, height: 18, imageRendering: 'pixelated', opacity: locked ? 1 : 0.6 }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 800, color: locked ? '#ff6b6b' : '#888' }}>
                      {locked ? '잠금' : '해제'}
                    </span>
                  </span>
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
              if (!active || !confirm('잠금되지 않은 모든 장비를 폐기하시겠습니까? (골드 지급 없음)')) return;
              setMsg('');
              try {
                const res = await api<{ count: number }>(`/characters/${active.id}/sell-bulk`, { method: 'POST', body: JSON.stringify({}) });
                setMsg(`${res.count}개 장비 폐기 완료`);
                await Promise.all([refresh(), refreshActive()]);
              } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
            }} style={{
              fontSize: 12, padding: '8px 14px', borderRadius: 4,
              background: 'rgba(218,165,32,0.15)', color: 'var(--accent)',
              border: '1px solid var(--accent)', cursor: 'pointer', fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>전체 폐기</button>
            <FilterToggleButton label="드랍필터" active={!!dfTiers} color="#ff6666" onClick={() => setFilterPanel(filterPanel === 'drop' ? null : 'drop')} open={filterPanel === 'drop'} />
          </div>

          {/* 드랍필터 패널 — 간결하게 재디자인 */}
          {filterPanel === 'drop' && (
            <FilterPanel title="드랍필터" subtitle="체크한 조건의 장비는 사냥 시 자동으로 줍지 않음" accentColor="#ff6666" onClose={() => setFilterPanel(null)}>
              <FilterSection label="걸러낼 티어">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <TierChip label="T1" active={dropFilter.t1} color="#5bc0ff" onClick={() => toggleDropFilter('t1')} />
                  <TierChip label="T2" active={dropFilter.t2} color="#b060cc" onClick={() => toggleDropFilter('t2')} />
                  <TierChip label="T3" active={dropFilter.t3} color="#daa520" onClick={() => toggleDropFilter('t3')} />
                  <TierChip label="T4" active={dropFilter.t4} color="#ff4444" onClick={() => toggleDropFilter('t4')} />
                </div>
              </FilterSection>
              {(dropFilter.t1 || dropFilter.t2 || dropFilter.t3 || dropFilter.t4) && (
                <>
                  <FilterSection label="3옵 아이템 보호">
                    <button onClick={toggleDropProtect3opt} style={{
                      fontSize: 12, padding: '8px 14px', borderRadius: 4,
                      background: dropFilter.protect3opt ? 'rgba(102,221,102,0.2)' : 'rgba(255,102,102,0.12)',
                      color: dropFilter.protect3opt ? '#66dd66' : '#ff9090',
                      border: `1px solid ${dropFilter.protect3opt ? '#66dd66' : '#ff6666'}`,
                      cursor: 'pointer', fontWeight: 700, minWidth: 120, textAlign: 'center',
                    }}>
                      {dropFilter.protect3opt ? '🛡 보호 ON (줍기)' : '⚠ 보호 OFF (버리기)'}
                    </button>
                  </FilterSection>
                  <FilterSection label="보호 접두사 (있으면 줍기)">
                    <PrefixProtectGrid selected={dropFilter.protectPrefixes} onToggle={toggleDropPrefix} />
                  </FilterSection>
                </>
              )}
              <div style={{ marginTop: 8, padding: 8, background: 'rgba(255,102,102,0.06)', borderRadius: 4, fontSize: 10, color: '#aaa', lineHeight: 1.6 }}>
                <div>• 체크한 티어 장비는 사냥 중 <b>줍지 않고 버림</b> (골드 지급 없음)</div>
                <div>• <span style={{ color: '#aaaaff' }}>유니크</span>는 항상 줍기</div>
                <div>• <span style={{ color: '#66dd66' }}>보호 ON</span> 시 3옵 / 보호접두 아이템은 티어 체크돼있어도 줍기</div>
              </div>
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
                  className="inv-item-card"
                  onClick={() => setExpandedSlot(isExpanded ? null : s.slotIndex)}
                  style={{
                    position: 'relative',
                    padding: isExpanded ? '10px 12px' : '8px 12px',
                    paddingRight: isEquipment ? 100 : (isExpanded ? 12 : 12),
                    paddingBottom: isEquipment && !isExpanded && (s.item as any).classRestriction ? 22 : undefined,
                    borderRadius: 4, cursor: 'pointer',
                    background: isUnique
                      ? 'linear-gradient(135deg, rgba(255,59,59,0.06), rgba(196,82,255,0.06))'
                      : 'var(--bg-panel)',
                    borderLeft: `3px solid ${isUnique ? '#ff8c2a' : gradeClr}`,
                    borderTop: '1px solid transparent', borderRight: '1px solid transparent',
                    borderBottom: `1px solid ${isExpanded ? 'var(--accent)30' : 'var(--border)'}`,
                    boxShadow: isUnique ? '0 0 8px rgba(255,140,42,0.25)' : 'none',
                  }}
                >
                  {/* 우측 중앙 — 잠금 버튼 + 거래 표시 (색 점). 단일 row 에 정렬해 겹침 방지 */}
                  {isEquipment && (
                    <div style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span
                        className="inv-item-lock"
                        onClick={(e) => toggleLock(s.slotIndex, e)}
                        title={locked ? '잠금 해제' : '잠금'}
                        style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '2px 4px', borderRadius: 3,
                          background: locked ? 'rgba(255,90,90,0.12)' : 'transparent',
                          border: `1px solid ${locked ? '#ff5a5a' : '#555'}`,
                          cursor: 'pointer',
                        }}
                      >
                        <img src={locked ? '/images/slots/lock.png' : '/images/slots/unlock.png'} alt=""
                          onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}
                          style={{ width: 18, height: 18, imageRendering: 'pixelated', opacity: locked ? 1 : 0.6 }}
                        />
                      </span>
                      <span
                        title={s.soulbound ? '거래불가' : '거래가능'}
                        style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: s.soulbound ? '#ff5a5a' : '#4caf50',
                          boxShadow: `0 0 4px ${s.soulbound ? '#ff5a5a' : '#4caf50'}`,
                        }}
                      />
                    </div>
                  )}
                  {/* 품질 — 카드 우상단 고정 */}
                  {(s as any).quality !== undefined && (s.item as any).slot && (() => {
                    const q = (s as any).quality;
                    const color = q >= 90 ? '#ff8800' : q >= 70 ? '#daa520' : q >= 40 ? '#66ccff' : q >= 20 ? '#8dc38d' : '#888';
                    return (
                      <span style={{
                        position: 'absolute', top: 8, right: 10,
                        fontSize: 11, padding: '2px 7px', borderRadius: 3,
                        background: color + '22',
                        border: `1px solid ${color}`, color, fontWeight: 700,
                        pointerEvents: 'none',
                      }}>품질 {q}%</span>
                    );
                  })()}
                  {/* 클래스 전용 — 카드 우하단 고정 텍스트 */}
                  {(s.item as any).classRestriction && (() => {
                    const cls = (s.item as any).classRestriction;
                    const krMap: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사' };
                    const colorMap: Record<string, string> = { warrior: '#e04040', mage: '#4080e0', cleric: '#daa520', rogue: '#a060c0', summoner: '#44cc88' };
                    const charClass = active?.className;
                    const wrong = charClass && cls !== charClass;
                    return (
                      <span style={{
                        position: 'absolute', right: 10, bottom: 6,
                        fontSize: 10, fontWeight: 700,
                        color: wrong ? 'var(--danger)' : colorMap[cls],
                        pointerEvents: 'none',
                      }}>
                        {krMap[cls] || cls} 전용{wrong ? ' ✗' : ''}
                      </span>
                    );
                  })()}
                  {/* 미확인 배지 — 거래소 구매 시 옵션 결정 */}
                  {(s as any).unidentified && (
                    <div style={{
                      position: 'absolute', top: 4, right: 6,
                      background: 'linear-gradient(135deg, #6a4ca8 0%, #a35bd1 100%)',
                      color: '#fff', fontSize: 10, fontWeight: 800,
                      padding: '2px 8px', borderRadius: 999,
                      letterSpacing: 0.5, zIndex: 5,
                      boxShadow: '0 0 6px rgba(163,91,209,0.6)',
                    }}>? 미확인</div>
                  )}
                  {/* 헤더 행 — 우측 absolute 라벨(품질·잠금) 영역 확보용 paddingRight */}
                  <div className="inv-item-header" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 80 }}>
                    <ItemIcon slot={s.item.slot} grade={s.item.grade} itemName={(s.item as any).baseName || s.item.name} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                        {(s as any).prefixName && !(s as any).unidentified && (
                          <span style={{ color: '#66ccff', fontWeight: 700, fontSize: 13 }}>{(s as any).prefixName}</span>
                        )}
                        {(s as any).unidentified && (
                          <span style={{ color: '#a35bd1', fontWeight: 700, fontSize: 13 }}>???</span>
                        )}
                        <span style={nameStyle(s.item.grade, 13)}>{(s.item as any).baseName || s.item.name}</span>
                        {/* 품질/클래스 전용은 카드 우측 절대 위치로 이동 */}
                        {s.enhanceLevel > 0 && (
                          <span style={{
                            color: '#000', background: 'var(--accent)', padding: '0 4px',
                            borderRadius: 2, fontSize: 11, fontWeight: 900, lineHeight: '16px',
                          }}>+{s.enhanceLevel}</span>
                        )}
                        {s.quantity > 1 && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>x{s.quantity}</span>}
                      </div>
                      {/* 접힌 상태: 기본 스탯 요약 + 접두사 뱃지 (비교 블록은 펼쳤을 때) */}
                      {!isExpanded && isEquipment && (
                        <div style={{ marginTop: 2 }}>
                          <StatSummary stats={(s.item as any).baseStats || s.item.stats} enhanceLevel={s.enhanceLevel || 0} quality={(s as any).quality || 0} />
                        </div>
                      )}
                      {!isExpanded && s.prefixStats && Object.keys(s.prefixStats).length > 0 && (
                        <div style={{ marginTop: 2 }}>
                          <PrefixDisplay prefixStats={s.prefixStats} prefixTiers={(s as any).prefixTiers} />
                        </div>
                      )}
                    </div>
                    {s.item.id >= 846 && s.item.id <= 851 && (
                      <button
                        onClick={(e) => openSproutBox(
                          s.item.id === 846 ? 1 : s.item.id === 847 ? 10 : s.item.id === 848 ? 30
                          : s.item.id === 849 ? 50 : s.item.id === 850 ? 70 : 90, e)}
                        style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 800,
                          background: 'linear-gradient(180deg, #6bdc6b, #2ea82e)',
                          color: '#052005', border: '1px solid #6bdc6b', cursor: 'pointer', borderRadius: 4,
                          boxShadow: '0 0 6px rgba(46,168,46,0.4)',
                          flexShrink: 0,
                        }}
                      >개봉</button>
                    )}
                    {(s.item.id === 843 || s.item.id === 844 || s.item.id === 845) && (
                      <button
                        onClick={(e) => openGuildBossChest(s.item.id === 843 ? 'gold' : s.item.id === 844 ? 'silver' : 'copper', e)}
                        style={{
                          padding: '6px 14px', fontSize: 12, fontWeight: 800,
                          background: s.item.id === 843
                            ? 'linear-gradient(180deg, #ffd66b, #daa520)'
                            : s.item.id === 844
                            ? 'linear-gradient(180deg, #e8e8e8, #a0a0a0)'
                            : 'linear-gradient(180deg, #d89060, #a56030)',
                          color: '#1a0f00', border: '1px solid #ffd66b', cursor: 'pointer', borderRadius: 4,
                          boxShadow: '0 0 6px rgba(218,165,32,0.4)',
                          flexShrink: 0,
                        }}
                      >개봉</button>
                    )}
                    {/* Lv/등급 라벨은 접힘 상태에서 숨김 — 펼침 상세에서 확인 가능 */}
                    {isEquipment && isExpanded && (
                      <span className="inv-item-level" style={{
                        fontSize: 9, color: levelTooLow ? 'var(--danger)' : 'var(--text-dim)',
                        opacity: 0.85, fontWeight: 700, flexShrink: 0,
                      }}>Lv.{requiredLevel}</span>
                    )}
                    {isExpanded && <span className="inv-item-grade" style={{ fontSize: 9, color: gradeClr, opacity: 0.6 }}>{GRADE_LABEL[s.item.grade]}</span>}
                    {/* 잠금/거래표시는 카드 우측 절대 위치로 이동됨 */}
                  </div>

                  {/* ── 펼침 상세 ── */}
                  {isExpanded && (() => {
                    const eqItem = isEquipment ? (equipped as any)[s.item.slot!] : null;
                    return (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {isEquipment && (
                        <div style={{ fontSize: 10, color: levelTooLow ? 'var(--danger)' : 'var(--text-dim)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{SLOT_LABEL[s.item.slot!]} · Lv.{requiredLevel}{levelTooLow ? ' (레벨 부족)' : ''}</span>
                          <span style={{
                            padding: '1px 6px',
                            background: (GRADE_COLOR as any)[s.item.grade] + '22',
                            border: `1px solid ${(GRADE_COLOR as any)[s.item.grade]}`,
                            color: (GRADE_COLOR as any)[s.item.grade],
                            borderRadius: 2,
                            fontWeight: 700,
                            fontSize: 10,
                            letterSpacing: 0.3,
                          }}>{(GRADE_LABEL as any)[s.item.grade] || s.item.grade}</span>
                          {(s as any).quality !== undefined && (
                            <span style={{ color: '#aaccff' }}>· 품질 {(s as any).quality}%</span>
                          )}
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
                        {s.item.id >= 846 && s.item.id <= 851 && (
                          <button
                            onClick={(e) => openSproutBox(
                              s.item.id === 846 ? 1 : s.item.id === 847 ? 10 : s.item.id === 848 ? 30
                              : s.item.id === 849 ? 50 : s.item.id === 850 ? 70 : 90, e)}
                            style={{
                              padding: '8px 18px', fontSize: 13, fontWeight: 700,
                              background: 'linear-gradient(180deg, #6bdc6b, #2ea82e)',
                              color: '#052005', border: '1px solid #6bdc6b', cursor: 'pointer', borderRadius: 4,
                              boxShadow: '0 0 8px rgba(46,168,46,0.4)',
                            }}
                          >개봉</button>
                        )}
                        {(s.item.id === 843 || s.item.id === 844 || s.item.id === 845) && (
                          <button
                            onClick={(e) => openGuildBossChest(s.item.id === 843 ? 'gold' : s.item.id === 844 ? 'silver' : 'copper', e)}
                            style={{
                              padding: '8px 18px', fontSize: 13, fontWeight: 700,
                              background: s.item.id === 843
                                ? 'linear-gradient(180deg, #ffd66b, #daa520)'
                                : s.item.id === 844
                                ? 'linear-gradient(180deg, #e8e8e8, #a0a0a0)'
                                : 'linear-gradient(180deg, #d89060, #a56030)',
                              color: '#1a0f00', border: '1px solid #ffd66b', cursor: 'pointer', borderRadius: 4,
                              boxShadow: '0 0 8px rgba(218,165,32,0.4)',
                            }}
                          >개봉</button>
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
                          <button onClick={(e) => sell(s.slotIndex, s.enhanceLevel, s.item.name, s.item.grade, e)}
                            style={actionBtn('#e0a040')}>폐기</button>
                        )}
                        {isEquipment && (
                          <button onClick={(e) => depositToStorage(s.slotIndex, s.item.name, e)}
                            style={actionBtn('#66ccff')}>📦 창고 보관</button>
                        )}
                        {isEquipment && !locked && !s.soulbound && (
                          <button onClick={(e) => openListModal(s, e)}
                            style={actionBtn('#ffd66b')}>💰 거래소 등록</button>
                        )}
                        {/* T4 접두사 추출 — 장비, 미확인 아님, 추첨권 아님, T4 접두사 보유 시만 노출 */}
                        {isEquipment && !locked && !(s as any).unidentified && (() => {
                          const tiers = (s as any).prefixTiers as Record<string, number> | undefined;
                          const hasT4 = tiers && Object.values(tiers).some(t => t === 4);
                          if (!hasT4) return null;
                          return (
                            <button onClick={(e) => extractItem((s as any).invId, s.item.name, e)}
                              style={actionBtn('#a35bd1')}>✨ 추출 (가루+1)</button>
                          );
                        })()}
                        {/* 접두사 추첨권 사용 — T1/T2/T3 중 1개라도 보유 시 */}
                        {isEquipment && !locked && !(s as any).unidentified && (() => {
                          const VOUCHER_IDS = [857, 856, 840, 911];
                          const hasVoucher = inv.some((it: any) => VOUCHER_IDS.includes(it.item.id) && it.quantity > 0);
                          if (!hasVoucher || !s.prefixIds || s.prefixIds.length === 0) return null;
                          return (
                            <button onClick={(e) => openVoucherModal(
                              (s as any).invId, s.item.name, s.prefixIds, (s as any).prefixName || '', e
                            )} style={actionBtn('#66dd99')}>🎟 접두사 추첨권</button>
                          );
                        })()}
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

      {/* 접두사 추첨권 — 슬롯 + 티어 선택 모달 (T1/T2/T3 통합) */}
      {voucherTarget && (
        <div onClick={() => setVoucherTarget(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'var(--bg-panel)', border: '1px solid #66dd99', borderRadius: 8,
            padding: 24, maxWidth: 540, width: '94vw',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#66dd99', marginBottom: 8 }}>
              🎟 접두사 추첨권 — 옵션 + 티어 선택
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              <b style={{ color: 'var(--text)' }}>{voucherTarget.name}</b> 의 접두사 중 1 개를 보장 티어로 재굴림합니다.
              나머지 두 옵션은 변경 없이 유지됩니다.
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, display: 'flex', gap: 10 }}>
              보유:
              <span style={{ color: voucherTarget.counts[1] > 0 ? '#9fd87a' : 'var(--text-mute)' }}>T1 ×{voucherTarget.counts[1]}</span>
              <span style={{ color: voucherTarget.counts[2] > 0 ? '#7eb6d6' : 'var(--text-mute)' }}>T2 ×{voucherTarget.counts[2]}</span>
              <span style={{ color: voucherTarget.counts[3] > 0 ? '#daa520' : 'var(--text-mute)' }}>T3 ×{voucherTarget.counts[3]}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {voucherTarget.prefixIds.map((_, i) => {
                const TIER_COLORS: Record<number, string> = { 1: '#9fd87a', 2: '#7eb6d6', 3: '#daa520' };
                return (
                  <div key={i} style={{
                    padding: 10, border: '1px solid var(--border)', borderRadius: 6,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{i + 1}번 옵션</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{voucherTarget.prefixNames[i] || '???'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1, 2, 3].map(tier => {
                        const hasVoucher = voucherTarget.counts[tier] > 0;
                        const color = TIER_COLORS[tier];
                        return (
                          <button
                            key={tier}
                            disabled={!hasVoucher}
                            onClick={() => applyVoucherReroll(i, tier)}
                            style={{
                              padding: '6px 12px', fontSize: 12, fontWeight: 800,
                              background: hasVoucher ? `${color}22` : 'transparent',
                              color: hasVoucher ? color : 'var(--text-mute)',
                              border: `1px solid ${hasVoucher ? color : 'var(--border)'}`,
                              borderRadius: 4,
                              cursor: hasVoucher ? 'pointer' : 'not-allowed',
                              opacity: hasVoucher ? 1 : 0.4,
                            }}>T{tier}</button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setVoucherTarget(null)} style={{
              marginTop: 14, padding: '8px 14px', fontSize: 12,
              background: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', width: '100%',
            }}>취소</button>
          </div>
        </div>
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
  { key: 'str', label: '힘', color: '#ff6644', group: '스탯' },
  { key: 'dex', label: '민첩', color: '#44cc88', group: '스탯' },
  { key: 'int', label: '지능', color: '#6688ff', group: '스탯' },
  { key: 'vit', label: '체력', color: '#88aa44', group: '스탯' },
  { key: 'spd', label: '속도', color: '#44cccc', group: '스탯' },
  { key: 'cri', label: '치명', color: '#ff4488', group: '공격' },
  { key: 'crit_dmg_pct', label: '치명뎀', color: '#ff6688', group: '공격' },
  { key: 'accuracy', label: '명중', color: '#ccaa44', group: '공격' },
  { key: 'def_reduce_pct', label: '방관', color: '#cc6644', group: '공격' },
  { key: 'dot_amp_pct', label: '도트', color: '#88ff44', group: '공격' },
  { key: 'lifesteal_pct', label: '흡혈', color: '#cc4444', group: '유틸' },
  { key: 'dodge', label: '회피', color: '#88ccff', group: '유틸' },
  { key: 'guardian_pct', label: '방어', color: '#8888cc', group: '유틸' },
  { key: 'hp_regen', label: '재생', color: '#44cc44', group: '유틸' },
  { key: 'predator_pct', label: '포식', color: '#66aa44', group: '유틸' },
  { key: 'spd_pct', label: '속도증가', color: '#ff8844', group: '특수' },
  { key: 'first_strike_pct', label: '선제', color: '#cc88ff', group: '특수' },
  { key: 'berserk_pct', label: '광전사', color: '#ff4444', group: '특수' },
  { key: 'full_hp_amp_pct', label: '풀피증뎀', color: '#66ee99', group: '특수' },
  { key: 'ambush_pct', label: '각성', color: '#aa66ff', group: '특수' },
  { key: 'exp_bonus_pct', label: '경험치', color: '#aaddff', group: '보상' },
  { key: 'gold_bonus_pct', label: '골드', color: '#ffdd44', group: '보상' },
  { key: 'slow_pct', label: '감속', color: '#6688aa', group: '기타' },
  { key: 'thorns_pct', label: '반사', color: '#aa8844', group: '기타' },
  // 신규 8종 (4월 패치)
  { key: 'max_hp_pct', label: '최대HP%', color: '#44dd66', group: '스탯' },
  { key: 'all_stats_pct', label: '전체스탯%', color: '#ff66dd', group: '스탯' },
  { key: 'atk_pct', label: '공격%', color: '#ff8844', group: '공격' },
  { key: 'matk_pct', label: '마공%', color: '#aa66ff', group: '공격' },
  { key: 'def_pierce_pct', label: '추가방관', color: '#cc6644', group: '공격' },
  { key: 'multi_hit_amp_pct', label: '다단뎀', color: '#ff6644', group: '공격' },
  { key: 'miss_combo_pct', label: '빗누적', color: '#66ccaa', group: '특수' },
  { key: 'evasion_burst_pct', label: '회피반격', color: '#88ccff', group: '특수' },
  { key: 'drop_rate_pct', label: '드랍률', color: '#ffaadd', group: '보상' },
  // 110제 craft 추가 옵션
  { key: 'shield_amp', label: '실드강화', color: '#88ddff', group: '유틸' },
  { key: 'summon_amp', label: '소환뎀', color: '#44cc88', group: '소환사' },
  { key: 'summon_double_hit', label: '소환2타', color: '#66dd99', group: '소환사' },
  { key: 'summon_max_extra', label: '소환+', color: '#88ee99', group: '소환사' },
  { key: 'execute_pct', label: '처형', color: '#ff4488', group: '특수' },
  { key: 'shield_on_low_hp', label: '저체력실드', color: '#aaddff', group: '유틸' },
  { key: 'reflect_skill', label: '스킬반사', color: '#cc88aa', group: '유틸' },
  { key: 'def_convert_atk', label: '방어전환', color: '#cc8866', group: '특수' },
  { key: 'damage_taken_down_pct', label: '피감', color: '#88aacc', group: '유틸' },
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

function TierChip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
      background: active ? color : 'transparent',
      color: active ? '#000' : color,
      border: `2px solid ${color}`, minWidth: 60, textAlign: 'center',
      transition: 'all 0.15s',
    }}>
      {label}{active ? ' ✕' : ''}
    </button>
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
