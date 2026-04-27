import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, STAT_LABEL } from '../components/ui/ItemStats';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';

interface PrefixDetail { id: number; statKey: string; tier: number; scaledMin: number; scaledMax: number; }
interface EnhanceItem {
  kind: 'inventory' | 'equipped';
  slotIndex?: number; equipSlot?: string;
  itemId: number; name: string; grade: ItemGrade; itemSlot: string | null;
  stats: Partial<Stats> | null; // 강화 적용된 현재 스탯
  baseStats: Partial<Stats> | null; // 원본(강화 전) 스탯
  enhanceLevel: number;
  prefixIds?: number[]; prefixStats?: Record<string, number>;
  prefixStatsRaw?: Record<string, number>;
  prefixName?: string;
  prefixDetails?: PrefixDetail[];
  quality?: number;
}

const STAT_KEY_LABEL: Record<string, string> = {
  str: '힘', dex: '민첩', int: '지능', vit: '체력', spd: '스피드', cri: '치명타',
  accuracy: '명중', dodge: '회피', hp_regen: 'HP재생',
  crit_dmg_pct: '크리뎀', lifesteal_pct: '흡혈', dot_amp_pct: '도트',
  def_reduce_pct: '약화', berserk_pct: '광전사', first_strike_pct: '약점간파',
  ambush_pct: '각성', gauge_on_crit_pct: '재충전', guardian_pct: '수호자',
  predator_pct: '포식자', thorns_pct: '가시', slow_pct: '저주',
  exp_bonus_pct: '경험치', gold_bonus_pct: '골드',
  atk_pct: '공격%', matk_pct: '마공%', hp_pct: '최대HP%',
  damage_taken_down_pct: '데미지감소',
  max_hp_pct: '최대HP%', drop_rate_pct: '드랍률', multi_hit_amp_pct: '다단뎀',
  def_pierce_pct: '방관', miss_combo_pct: '빗누적', evasion_burst_pct: '회피반격',
};
const TIER_COLOR: Record<number, string> = { 1: '#5b8ecc', 2: '#b060cc', 3: '#ffcc33', 4: '#ff4444' };

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
  const [rerollCount, setRerollCount] = useState(0);
  const [rerolling, setRerolling] = useState(false);
  const [rerollIndex, setRerollIndex] = useState<number | null>(null); // null=전체
  const [qualityRerollCount, setQualityRerollCount] = useState(0);
  const [qualityRerolling, setQualityRerolling] = useState(false);
  const [t1TicketCount, setT1TicketCount] = useState(0);
  const [t2TicketCount, setT2TicketCount] = useState(0);
  const [t3TicketCount, setT3TicketCount] = useState(0);
  const [p3TicketCount, setP3TicketCount] = useState(0);
  const [usingTier, setUsingTier] = useState<1 | 2 | 3 | null>(null);
  const [usingP3, setUsingP3] = useState(false);

  async function load(): Promise<{ inventory: EnhanceItem[]; equipped: EnhanceItem[] } | null> {
    if (!active) return null;
    const d = await api<{ inventory: EnhanceItem[]; equipped: EnhanceItem[]; scrollCount: number; rerollCount: number; qualityRerollCount?: number; t1TicketCount?: number; t2TicketCount?: number; t3TicketCount?: number; p3TicketCount?: number }>(`/enhance/${active.id}/list`);
    setItems([...d.equipped, ...d.inventory]);
    const newScrollCount = d.scrollCount || 0;
    setScrollCount(newScrollCount);
    // 스크롤 소진 시 useScroll 자동 해제 — UI 의 (+10%) 표기 + useScroll=true 전송으로
    // "스크롤이 없습니다" 400 발생하던 버그 차단.
    if (newScrollCount === 0) setUseScroll(false);
    setRerollCount(d.rerollCount || 0);
    setQualityRerollCount(d.qualityRerollCount || 0);
    setT1TicketCount(d.t1TicketCount || 0);
    setT2TicketCount(d.t2TicketCount || 0);
    setT3TicketCount(d.t3TicketCount || 0);
    setP3TicketCount(d.p3TicketCount || 0);
    return { inventory: d.inventory, equipped: d.equipped };
  }

  async function useTierTicket(tier: 1 | 2 | 3) {
    if (!active || !selected || usingTier !== null) return;
    if (rerollIndex === null) { alert(`T${tier} 추첨권은 특정 접두사 1개를 선택해야 합니다. 아래 "접두사 선택" 에서 하나 골라주세요.`); return; }
    if (selected.grade === 'unique') { alert('유니크 장비는 사용 불가'); return; }
    const count = tier === 1 ? t1TicketCount : tier === 2 ? t2TicketCount : t3TicketCount;
    if (count <= 0) { alert(`T${tier} 접두사 보장 추첨권이 없습니다.`); return; }
    if (!confirm(`선택한 접두사 1개를 T${tier} 티어로 재굴림합니다. 진행하시겠습니까?`)) return;
    setUsingTier(tier);
    try {
      await api<{ success: boolean; prefixIds: number[]; prefixStats: Record<string, number>; prefixStatsRaw?: Record<string, number> }>(
        `/enhance/${active.id}/use-t${tier}-ticket`,
        { method: 'POST', body: JSON.stringify({
          kind: selected.kind,
          slotKey: selected.kind === 'inventory' ? selected.slotIndex : selected.equipSlot,
          prefixIndex: rerollIndex,
        }) }
      );
      await load();
      const refreshed = await api<{ inventory: EnhanceItem[]; equipped: EnhanceItem[] }>(`/enhance/${active.id}/list`);
      const all = [...refreshed.equipped, ...refreshed.inventory];
      const match = all.find(it => it.kind === selected.kind && (selected.kind === 'inventory' ? it.slotIndex === selected.slotIndex : it.equipSlot === selected.equipSlot));
      if (match) setSelected(match);
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
    finally { setUsingTier(null); }
  }

  async function use3PrefixTicket() {
    if (!active || !selected || usingP3) return;
    if (selected.grade === 'unique') { alert('유니크 장비는 사용 불가'); return; }
    if (p3TicketCount <= 0) { alert('3옵 보장 굴림권이 없습니다.'); return; }
    if (!confirm('기존 접두사를 모두 폐기하고 3옵을 새로 굴립니다. 진행하시겠습니까?')) return;
    setUsingP3(true);
    try {
      await api<{ success: boolean }>(
        `/enhance/${active.id}/use-3prefix-ticket`,
        { method: 'POST', body: JSON.stringify({
          kind: selected.kind,
          slotKey: selected.kind === 'inventory' ? selected.slotIndex : selected.equipSlot,
        }) }
      );
      await load();
      const refreshed = await api<{ inventory: EnhanceItem[]; equipped: EnhanceItem[] }>(`/enhance/${active.id}/list`);
      const all = [...refreshed.equipped, ...refreshed.inventory];
      const match = all.find(it => it.kind === selected.kind && (selected.kind === 'inventory' ? it.slotIndex === selected.slotIndex : it.equipSlot === selected.equipSlot));
      if (match) setSelected(match);
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
    finally { setUsingP3(false); }
  }

  async function rerollPrefix() {
    if (!active || !selected || rerolling) return;
    if (!selected.prefixStats || Object.keys(selected.prefixStats).length === 0) {
      alert('접두사가 없는 장비입니다.');
      return;
    }
    if (rerollCount <= 0) { alert('접두사 수치 재굴림권이 없습니다.'); return; }
    const details = selected.prefixDetails || [];
    const targetLabel = rerollIndex === null
      ? '모든 접두사'
      : `${details[rerollIndex]?.statKey ? (STAT_KEY_LABEL[details[rerollIndex].statKey] || details[rerollIndex].statKey) : '?'} (T${details[rerollIndex]?.tier || 1})`;
    if (!confirm(`${targetLabel} 의 수치를 새로 굴립니다. 진행하시겠습니까?`)) return;
    setRerolling(true);
    try {
      const r = await api<{ success: boolean; prefixIds: number[]; prefixStats: Record<string, number>; prefixStatsRaw?: Record<string, number> }>(
        `/enhance/${active.id}/reroll-prefix`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: selected.kind,
            slotKey: selected.kind === 'inventory' ? selected.slotIndex : selected.equipSlot,
            ...(rerollIndex !== null ? { prefixIndex: rerollIndex } : {}),
          }),
        }
      );
      // 응답으로 선택 아이템 즉시 갱신 (load() 이전 state 클로저 문제 회피)
      const updated: EnhanceItem = { ...selected, prefixIds: r.prefixIds, prefixStats: r.prefixStats, prefixStatsRaw: r.prefixStatsRaw };
      setSelected(updated);
      setItems(prev => prev.map(it => {
        if (it.kind !== selected.kind) return it;
        const sameSlot = selected.kind === 'inventory'
          ? it.slotIndex === selected.slotIndex
          : it.equipSlot === selected.equipSlot;
        return sameSlot ? updated : it;
      }));
      setRerollCount(c => Math.max(0, c - 1));
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    } finally { setRerolling(false); }
  }

  async function rerollQuality() {
    if (!active || !selected || qualityRerolling) return;
    if (qualityRerollCount <= 0) { alert('품질 재굴림권이 없습니다.'); return; }
    if (!confirm(`현재 품질 ${selected.quality ?? 0}% 를 새로 굴립니다. (0~100 무작위) 진행하시겠습니까?`)) return;
    setQualityRerolling(true);
    try {
      const r = await api<{ success: boolean; quality: number }>(
        `/enhance/${active.id}/reroll-quality`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind: selected.kind,
            slotKey: selected.kind === 'inventory' ? selected.slotIndex : selected.equipSlot,
          }),
        }
      );
      const updated: EnhanceItem = { ...selected, quality: r.quality };
      setSelected(updated);
      setItems(prev => prev.map(it => {
        if (it.kind !== selected.kind) return it;
        const sameSlot = selected.kind === 'inventory'
          ? it.slotIndex === selected.slotIndex
          : it.equipSlot === selected.equipSlot;
        return sameSlot ? updated : it;
      }));
      setQualityRerollCount(c => Math.max(0, c - 1));
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    } finally { setQualityRerolling(false); }
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
      const fresh = await load();
      if (r.destroyed) {
        setSelected(null);
      } else {
        // 강화 레벨 반영된 새 prefixStats(스케일) 로 selected 전체 갱신
        const match = fresh && selected
          ? (selected.kind === 'inventory'
              ? fresh.inventory.find(x => x.slotIndex === selected.slotIndex)
              : fresh.equipped.find(x => x.equipSlot === selected.equipSlot))
          : undefined;
        if (match) setSelected(match);
        else setSelected((s) => s ? { ...s, enhanceLevel: r.newLevel } : null);
      }
      // 스크롤 체크 상태는 유지 — 유저가 직접 해제할 때까지 지속 (연속 강화 편의)
      // 스크롤 소진 시 (scrollCount=0) 체크박스 자체가 숨겨지므로 자동 비활성화 효과는 보장됨
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
                <div key={`${it.kind}-${idx}`} onClick={() => { setSelected(it); setResult(null); setRerollIndex(null); }}
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
                      <PrefixDisplay prefixStats={it.prefixStats} prefixTiers={(it as any).prefixTiers} />
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
                    // 강화 배율: +5%/단계 + 품질 보너스
                    const qBonus = (selected.quality || 0) / 100;
                    const getMult = (el: number) => 1 + el * 0.05 + qBonus;
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

                  {/* 스크롤 사용 옵션 — 체크박스 자체만 클릭 가능. 라벨 텍스트로 토글 방지 (강화 연타 중 오작동 방지) */}
                  {scrollCount > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      fontSize: 12, color: 'var(--text-dim)',
                    }}>
                      <input
                        type="checkbox"
                        checked={useScroll}
                        onChange={e => setUseScroll(e.target.checked)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                      <span style={{ userSelect: 'none' }}>강화 성공률 스크롤 사용 (+10%) · 보유: {scrollCount}개</span>
                    </div>
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

              {/* 현재 접두사 표시 + 수치 재굴림 */}
              {selected.prefixStats && Object.keys(selected.prefixStats).length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700 }}>접두사 (강화 +{selected.enhanceLevel || 0})</div>
                  <PrefixDisplay prefixStats={selected.prefixStats} prefixTiers={(selected as any).prefixTiers} />

                  {/* 강화 전/후 수치 병기 — 강화 레벨 있을 때만 */}
                  {(selected.enhanceLevel || 0) > 0 && selected.prefixStatsRaw && (
                    <div style={{ marginTop: 8, padding: 6, background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border)', borderRadius: 3 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>강화 전 → 강화 후</div>
                      {Object.keys(selected.prefixStats).map(key => {
                        const raw = selected.prefixStatsRaw?.[key] ?? 0;
                        const scaled = selected.prefixStats?.[key] ?? 0;
                        const label = STAT_KEY_LABEL[key] || key;
                        const delta = scaled - raw;
                        return (
                          <div key={key} style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'monospace' }}>
                            {label}: <span style={{ color: 'var(--text-dim)' }}>{raw}</span>
                            <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>→</span>
                            <span style={{ color: '#66ccff', fontWeight: 700 }}>{scaled}</span>
                            {delta !== 0 && <span style={{ color: '#4caf50', marginLeft: 4, fontSize: 10 }}>(+{delta})</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 재굴림 범위 표시: 접두사가 있으면 항상 노출 — 강화 후 스케일 (PrefixDisplay 값과 동일 기준) */}
                  {(selected.prefixDetails?.length || 0) > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11 }}>
                      <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>
                        재굴림 범위 <span style={{ fontSize: 9, opacity: 0.7 }}>(강화 +{selected.enhanceLevel || 0} 반영)</span> {(selected.prefixDetails?.length || 0) > 1 ? '· 대상 선택' : ''}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(selected.prefixDetails?.length || 0) > 1 && (
                          <button onClick={() => setRerollIndex(null)} style={{
                            fontSize: 10, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                            background: rerollIndex === null ? 'var(--accent)' : 'transparent',
                            color: rerollIndex === null ? '#000' : 'var(--accent)',
                            border: '1px solid var(--accent)', fontWeight: 700,
                          }}>전체</button>
                        )}
                        {(selected.prefixDetails || []).map((d, i) => {
                          const isActive = rerollIndex === i;
                          const c = TIER_COLOR[d.tier] || '#888';
                          // 버튼 범위/현재값 모두 "강화 후" 스케일 (PrefixDisplay 와 1:1 비교)
                          const enhMult = 1 + (selected.enhanceLevel || 0) * 0.025;
                          const rangeMin = Math.max(1, Math.round(d.scaledMin * enhMult));
                          const rangeMax = Math.max(1, Math.round(d.scaledMax * enhMult));
                          const currentVal = selected.prefixStats?.[d.statKey] ?? 0;
                          const hasRange = d.scaledMin > 0 && d.scaledMax > 0;
                          const multiSelect = (selected.prefixDetails?.length || 0) > 1;
                          return (
                            <button
                              key={i}
                              onClick={() => multiSelect && setRerollIndex(i)}
                              style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 3,
                                cursor: multiSelect ? 'pointer' : 'default',
                                background: isActive ? c : 'transparent',
                                color: isActive ? '#000' : c,
                                border: `1px solid ${c}`, fontWeight: 700,
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                              }}
                              title={hasRange ? `T${d.tier} 강화 후 범위: ${rangeMin}~${rangeMax} (현재 ${currentVal})` : ''}
                            >
                              <div>T{d.tier} {STAT_KEY_LABEL[d.statKey] || d.statKey}</div>
                              {hasRange && (
                                <div style={{ fontSize: 9, opacity: 0.9, marginTop: 1 }}>
                                  {rangeMin}~{rangeMax} <span style={{ opacity: 0.7 }}>(현재 {currentVal})</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button onClick={rerollPrefix} disabled={rerolling || rerollCount <= 0} style={{
                    marginTop: 10, width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700,
                    background: rerollCount > 0 ? 'var(--accent)' : 'transparent',
                    color: rerollCount > 0 ? '#000' : 'var(--text-dim)',
                    border: '1px solid var(--accent)', borderRadius: 4,
                    cursor: rerollCount > 0 && !rerolling ? 'pointer' : 'default',
                  }}>
                    {rerolling ? '재굴림 중...' : `수치 재굴림권 사용 (보유: ${rerollCount}개)`}
                  </button>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, textAlign: 'center' }}>
                    {(selected.prefixDetails?.length || 0) > 1
                      ? '선택한 접두사만(또는 전체) 새로 굴립니다'
                      : 'tier/옵션은 그대로, 수치만 새로 굴립니다'}
                  </div>
                </div>
              )}

              {/* 품질 재굴림 섹션 — 장비라면 항상 표시 */}
              {selected.equipSlot !== undefined || selected.kind === 'inventory' ? (
                <div style={{ marginTop: 12, padding: 10, border: '1px solid #333', borderRadius: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>현재 품질</span>
                    <span style={{ color: (selected.quality ?? 0) >= 70 ? '#daa520' : '#ccc', fontWeight: 700 }}>
                      {selected.quality ?? 0}%
                    </span>
                  </div>
                  <button onClick={rerollQuality} disabled={qualityRerolling || qualityRerollCount <= 0} style={{
                    width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700,
                    background: qualityRerollCount > 0 ? '#daa520' : 'transparent',
                    color: qualityRerollCount > 0 ? '#000' : 'var(--text-dim)',
                    border: '1px solid #daa520', borderRadius: 4,
                    cursor: qualityRerollCount > 0 && !qualityRerolling ? 'pointer' : 'default',
                  }}>
                    {qualityRerolling ? '굴리는 중...' : `품질 재굴림권 사용 (보유: ${qualityRerollCount}개)`}
                  </button>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, textAlign: 'center' }}>
                    품질을 0~100% 범위에서 새로 굴립니다
                  </div>
                </div>
              ) : null}

              {/* T1/T2/T3 보장 추첨권 / 3옵 보장 굴림권 */}
              {selected.itemSlot && selected.grade !== 'unique' ? (
                <div style={{ marginTop: 12, padding: 10, border: '1px solid #a24bff', borderRadius: 4 }}>
                  <div style={{ fontSize: 11, color: '#a24bff', marginBottom: 8, fontWeight: 700 }}>접두사 보장 추첨권</div>
                  {([1, 2, 3] as const).map(tier => {
                    const cnt = tier === 1 ? t1TicketCount : tier === 2 ? t2TicketCount : t3TicketCount;
                    const tierColor = TIER_COLOR[tier];
                    const isUsing = usingTier === tier;
                    const enabled = cnt > 0 && rerollIndex !== null && usingTier === null;
                    return (
                      <button key={tier} onClick={() => useTierTicket(tier)} disabled={!enabled || isUsing} style={{
                        width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700, marginBottom: 6,
                        background: enabled ? tierColor : 'transparent',
                        color: enabled ? '#000' : 'var(--text-dim)',
                        border: `1px solid ${tierColor}`, borderRadius: 4,
                        cursor: enabled ? 'pointer' : 'default',
                      }}>
                        {isUsing ? '굴리는 중...' : `T${tier} 보장 추첨권 (보유: ${cnt}개)`}
                      </button>
                    );
                  })}
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8, textAlign: 'center' }}>
                    선택한 접두사 1개를 해당 티어로 교체 — 아래 "접두사 선택" 필수
                  </div>
                  <button onClick={use3PrefixTicket} disabled={usingP3 || p3TicketCount <= 0} style={{
                    width: '100%', padding: '8px 0', fontSize: 12, fontWeight: 700,
                    background: p3TicketCount > 0 ? '#a24bff' : 'transparent',
                    color: p3TicketCount > 0 ? '#000' : 'var(--text-dim)',
                    border: '1px solid #a24bff', borderRadius: 4,
                    cursor: p3TicketCount > 0 && !usingP3 ? 'pointer' : 'default',
                  }}>
                    {usingP3 ? '굴리는 중...' : `3옵 보장 굴림권 (보유: ${p3TicketCount}개)`}
                  </button>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, textAlign: 'center' }}>
                    기존 접두사 폐기 후 3옵 새로 굴림
                  </div>
                </div>
              ) : null}
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
