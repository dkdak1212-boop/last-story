import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, InventorySlot, Stats, Equipped } from '../types';
import { GRADE_COLOR, ItemStatsBlock } from '../components/ui/ItemStats';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';
import { ItemIcon } from '../components/ui/ItemIcon';
import { ItemComparison } from '../components/ui/ItemComparison';

interface Listing {
  id: number; itemId: number; itemQuantity: number;
  price: number;
  endsAt: string;
  itemName: string; itemGrade: ItemGrade; itemType?: string; itemSlot?: string | null;
  itemStats?: Partial<Stats> | null; itemDescription?: string;
  enhanceLevel?: number; prefixStats?: Record<string, number> | null;
  quality?: number; classRestriction?: string | null; prefixName?: string;
  baseItemName?: string;
  requiredLevel?: number;
  settled?: boolean; cancelled?: boolean;
}

// 무기 이름 → 직업 추론 (검=전사, 단검/대검=도적/전사, 지팡이=마법사, 홀=성직자, 구슬=소환사)
function inferWeaponClass(name: string): string | null {
  if (name.includes('지팡이')) return 'mage';
  if (name.includes('홀')) return 'cleric';
  if (name.includes('단검')) return 'rogue';
  if (name.includes('대검')) return 'warrior';
  if (name.includes('구슬')) return 'summoner';
  if (name.includes('검')) return 'warrior';
  return null;
}

// 유니크 등급은 무지개 그라데이션 텍스트
const UNIQUE_RAINBOW_STYLE: React.CSSProperties = {
  background: 'linear-gradient(90deg, #ff3b3b, #ff8c2a, #ffe135, #3bd96b, #3bc8ff, #6b5bff, #c452ff)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};
function nameStyle(grade: ItemGrade, fontSize: number): React.CSSProperties {
  if (grade === 'unique') return { ...UNIQUE_RAINBOW_STYLE, fontWeight: 700, fontSize };
  return { color: GRADE_COLOR[grade], fontWeight: 700, fontSize };
}

export function MarketplaceScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [tab, setTab] = useState<'browse' | 'unique' | 'list' | 'mine'>('browse');
  const [weaponClass, setWeaponClass] = useState<string>(''); // '' = 전체, warrior/mage/cleric/rogue
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [equipped, setEquipped] = useState<Equipped>({});
  const [slotFilter, setSlotFilter] = useState<string>(''); // '', weapon, helm, chest, boots, ring, amulet
  const [uniqueLevelBracket, setUniqueLevelBracket] = useState<string>(''); // '' = 전체, '1-9', '10-19', ...
  const [browseLevelBracket, setBrowseLevelBracket] = useState<string>(''); // 둘러보기 탭 레벨 필터
  const [qualityMin, setQualityMin] = useState<number>(0);
  const [qualityMax, setQualityMax] = useState<number>(100);
  const [prefixStatKey, setPrefixStatKey] = useState<string>('');
  const [prefixTier, setPrefixTier] = useState<number>(0); // 0=전체, 1~4
  const [sortMode, setSortMode] = useState<'default' | 'latest'>('default'); // 레벨/가격 vs 최신순

  async function loadBrowse() {
    const params = new URLSearchParams();
    if (slotFilter) params.set('slot', slotFilter);
    if (tab === 'unique') params.set('grade', 'unique');
    if (qualityMin > 0) params.set('qualityMin', String(qualityMin));
    if (qualityMax < 100) params.set('qualityMax', String(qualityMax));
    if (prefixStatKey) params.set('prefixStatKey', prefixStatKey);
    if (prefixTier > 0) params.set('prefixTier', String(prefixTier));
    // 서버사이드 레벨 구간 필터 (egress 절감)
    const bracket = tab === 'unique' ? uniqueLevelBracket : browseLevelBracket;
    if (bracket) params.set('levelBracket', bracket);
    const qs = params.toString();
    setListings(await api<Listing[]>(`/marketplace${qs ? `?${qs}` : ''}`));
  }
  async function loadMine() {
    if (!active) return;
    setMine(await api<Listing[]>(`/marketplace/mine/${active.id}`));
  }
  async function loadInv() {
    if (!active) return;
    const d = await api<{ inventory: InventorySlot[]; equipped: Equipped }>(`/characters/${active.id}/inventory`);
    setInv(d.inventory);
    setEquipped(d.equipped || {});
  }

  useEffect(() => {
    if (tab === 'browse' || tab === 'unique') { loadBrowse(); loadInv(); }
    if (tab === 'list') loadInv();
    if (tab === 'mine') loadMine();
  }, [tab, slotFilter, qualityMin, qualityMax, prefixStatKey, prefixTier, uniqueLevelBracket, browseLevelBracket, active?.id]);

  async function buy(a: Listing) {
    if (!active) return;
    if (!confirm(`${a.price.toLocaleString()}G에 구매하시겠습니까?`)) return;
    try {
      await api(`/marketplace/${a.id}/buyout`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      await refreshActive(); loadBrowse();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function cancel(id: number) {
    if (!active) return;
    if (!confirm('등록을 취소하시겠습니까?')) return;
    try {
      await api(`/marketplace/${id}/cancel`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      loadMine();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>거래소</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={tab === 'browse' ? 'primary' : ''} onClick={() => setTab('browse')}>둘러보기</button>
        <button onClick={() => setTab('unique')} style={tab === 'unique' ? {
          background: 'linear-gradient(90deg, #ff3b3b, #ff8c2a, #ffe135, #3bd96b, #3bc8ff, #6b5bff, #c452ff)',
          color: '#000', border: 'none', fontWeight: 800,
        } : { fontWeight: 700, border: '1px solid var(--accent)' }}>유니크</button>
        <button className={tab === 'list' ? 'primary' : ''} onClick={() => setTab('list')}>등록</button>
        <button className={tab === 'mine' ? 'primary' : ''} onClick={() => setTab('mine')}>내 등록</button>
      </div>

      {tab === 'browse' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {([
              ['', '전체'],
              ['weapon', '무기'],
              ['helm', '투구'],
              ['chest', '갑옷'],
              ['boots', '신발'],
              ['ring', '반지'],
              ['amulet', '목걸이'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setSlotFilter(key); if (key !== 'weapon') setWeaponClass(''); }} style={{
                fontSize: 11, padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
                background: slotFilter === key ? 'var(--accent)' : 'var(--bg-panel)',
                color: slotFilter === key ? '#000' : 'var(--text-dim)',
                border: `1px solid ${slotFilter === key ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: slotFilter === key ? 700 : 400,
              }}>{label}</button>
            ))}
          </div>

          {/* 무기 선택 시 직업별 서브 탭 */}
          {slotFilter === 'weapon' && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {([
                ['', '전체', 'var(--accent)'],
                ['warrior', '전사 (검/대검)', '#e04040'],
                ['mage', '마법사 (지팡이)', '#4080e0'],
                ['cleric', '성직자 (홀)', '#daa520'],
                ['rogue', '도적 (단검)', '#a060c0'],
                ['summoner', '소환사 (구슬)', '#44cc88'],
              ] as const).map(([key, label, color]) => (
                <button key={key} onClick={() => setWeaponClass(key)} style={{
                  fontSize: 10, padding: '4px 9px', borderRadius: 3, cursor: 'pointer',
                  background: weaponClass === key ? color : 'transparent',
                  color: weaponClass === key ? '#000' : color,
                  border: `1px solid ${color}`,
                  fontWeight: 700,
                }}>{label}</button>
              ))}
            </div>
          )}

          <FilterPanel
            qualityMin={qualityMin} qualityMax={qualityMax}
            setQualityMin={setQualityMin} setQualityMax={setQualityMax}
            prefixStatKey={prefixStatKey} setPrefixStatKey={setPrefixStatKey}
            prefixTier={prefixTier} setPrefixTier={setPrefixTier}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>레벨:</span>
            {([
              ['', '전체'],
              ['1-9', '1~9'],
              ['10-19', '10~19'],
              ['20-29', '20~29'],
              ['30-39', '30~39'],
              ['40-49', '40~49'],
              ['50-59', '50~59'],
              ['60-69', '60~69'],
              ['70-79', '70~79'],
              ['80-89', '80~89'],
              ['90-99', '90~99'],
              ['100+', '100+'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setBrowseLevelBracket(key)} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
                background: browseLevelBracket === key ? 'var(--accent)' : 'var(--bg-panel)',
                color: browseLevelBracket === key ? '#000' : 'var(--text-dim)',
                border: `1px solid ${browseLevelBracket === key ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: browseLevelBracket === key ? 700 : 400,
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button onClick={() => setSortMode('default')} style={{
              fontSize: 11, padding: '4px 10px',
              background: sortMode === 'default' ? 'var(--accent)' : 'var(--bg-panel)',
              color: sortMode === 'default' ? '#000' : 'var(--text-dim)',
              border: `1px solid ${sortMode === 'default' ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer', borderRadius: 3,
            }}>레벨·가격순</button>
            <button onClick={() => setSortMode('latest')} style={{
              fontSize: 11, padding: '4px 10px',
              background: sortMode === 'latest' ? 'var(--accent)' : 'var(--bg-panel)',
              color: sortMode === 'latest' ? '#000' : 'var(--text-dim)',
              border: `1px solid ${sortMode === 'latest' ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer', borderRadius: 3,
            }}>최신순</button>
          </div>
          <BrowseListings
            listings={listings}
            slotFilter={slotFilter}
            weaponClass={weaponClass}
            levelBracket={browseLevelBracket}
            equipped={equipped}
            sortMode={sortMode}
            onBuy={(a) => buy(a)}
          />
        </>
      )}

      {tab === 'unique' && (
        <div>
          <div style={{
            padding: '10px 14px', marginBottom: 10, borderRadius: 4,
            background: 'linear-gradient(90deg, rgba(255,59,59,0.08), rgba(196,82,255,0.08))',
            border: '1px solid var(--accent)', fontSize: 12, color: 'var(--text-dim)',
          }}>
            전 등급 중 <span style={{
              fontWeight: 800,
              background: 'linear-gradient(90deg, #ff3b3b, #ff8c2a, #ffe135, #3bd96b, #3bc8ff, #6b5bff, #c452ff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>유니크</span> 등급 아이템만 표시합니다.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {([
              ['', '전체'],
              ['weapon', '무기'],
              ['helm', '투구'],
              ['chest', '갑옷'],
              ['boots', '신발'],
              ['ring', '반지'],
              ['amulet', '목걸이'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setSlotFilter(key); if (key !== 'weapon') setWeaponClass(''); }} style={{
                fontSize: 11, padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
                background: slotFilter === key ? 'var(--accent)' : 'var(--bg-panel)',
                color: slotFilter === key ? '#000' : 'var(--text-dim)',
                border: `1px solid ${slotFilter === key ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: slotFilter === key ? 700 : 400,
              }}>{label}</button>
            ))}
          </div>

          {/* 유니크 · 무기 선택 시 직업별 서브 탭 */}
          {slotFilter === 'weapon' && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {([
                ['', '전체', 'var(--accent)'],
                ['warrior', '전사 (검/대검)', '#e04040'],
                ['mage', '마법사 (지팡이)', '#4080e0'],
                ['cleric', '성직자 (홀)', '#daa520'],
                ['rogue', '도적 (단검)', '#a060c0'],
                ['summoner', '소환사 (구슬)', '#44cc88'],
              ] as const).map(([key, label, color]) => (
                <button key={key} onClick={() => setWeaponClass(key)} style={{
                  fontSize: 10, padding: '4px 9px', borderRadius: 3, cursor: 'pointer',
                  background: weaponClass === key ? color : 'transparent',
                  color: weaponClass === key ? '#000' : color,
                  border: `1px solid ${color}`,
                  fontWeight: 700,
                }}>{label}</button>
              ))}
            </div>
          )}

          <FilterPanel
            qualityMin={qualityMin} qualityMax={qualityMax}
            setQualityMin={setQualityMin} setQualityMax={setQualityMax}
            prefixStatKey={prefixStatKey} setPrefixStatKey={setPrefixStatKey}
            prefixTier={prefixTier} setPrefixTier={setPrefixTier}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4 }}>레벨:</span>
            {([
              ['', '전체'],
              ['1-9', '1~9'],
              ['10-19', '10~19'],
              ['20-29', '20~29'],
              ['30-39', '30~39'],
              ['40-49', '40~49'],
              ['50-59', '50~59'],
              ['60-69', '60~69'],
              ['70-79', '70~79'],
              ['80-89', '80~89'],
              ['90-99', '90~99'],
              ['100+', '100+'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setUniqueLevelBracket(key)} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
                background: uniqueLevelBracket === key ? 'var(--accent)' : 'var(--bg-panel)',
                color: uniqueLevelBracket === key ? '#000' : 'var(--text-dim)',
                border: `1px solid ${uniqueLevelBracket === key ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: uniqueLevelBracket === key ? 700 : 400,
              }}>{label}</button>
            ))}
          </div>
          {(() => {
            const inBracket = (lv: number): boolean => {
              if (!uniqueLevelBracket) return true;
              if (uniqueLevelBracket === '100+') return lv >= 100;
              const [lo, hi] = uniqueLevelBracket.split('-').map(Number);
              return lv >= lo && lv <= hi;
            };
            let filtered = listings;
            // 무기 + 직업 서브 필터
            if (slotFilter === 'weapon' && weaponClass) {
              filtered = filtered.filter(a => {
                const cls = a.classRestriction || inferWeaponClass(a.baseItemName || a.itemName || '');
                return cls === weaponClass;
              });
            }
            filtered = filtered.filter(a => inBracket(a.requiredLevel || 1));
            if (filtered.length === 0) {
              return <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>해당 조건에 등록된 유니크 아이템이 없습니다</div>;
            }
            const sorted = [...filtered].sort((a, b) => {
              const la = a.requiredLevel || 1;
              const lb = b.requiredLevel || 1;
              if (la !== lb) return la - lb;
              return a.price - b.price;
            });
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sorted.map(a => <ListingRow key={a.id} a={a} equipped={equipped} onBuy={() => buy(a)} />)}
              </div>
            );
          })()}
        </div>
      )}

      {tab === 'list' && <ListItemPanel active={active?.id} inv={inv} onDone={() => { loadInv(); setTab('mine'); }} />}

      {tab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mine.length === 0 && <div style={{ color: 'var(--text-dim)' }}>등록한 아이템이 없습니다</div>}
          {mine.map(a => (
            <div key={a.id} style={{ padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={nameStyle(a.itemGrade, 14)}>{a.itemName}</span>
                  <span style={{ marginLeft: 6, color: 'var(--text-dim)', fontSize: 12 }}>×{a.itemQuantity}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                  {a.settled ? '판매완료/만료' : a.cancelled ? '취소됨' : `${a.price.toLocaleString()}G`}
                </div>
              </div>
              {!a.settled && !a.cancelled && (
                <button onClick={() => cancel(a.id)} style={{ marginTop: 6, fontSize: 12 }}>등록 취소</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 품질/접두사 필터 패널 — 실제 item_prefixes.stat_key와 일치해야 함
const PREFIX_STAT_OPTIONS: { key: string; label: string }[] = [
  { key: '', label: '전체' },
  { key: 'str', label: '힘 (공격력)' },
  { key: 'int', label: '지능 (마법공격)' },
  { key: 'dex', label: '민첩 (회피)' },
  { key: 'vit', label: '체력' },
  { key: 'spd', label: '스피드' },
  { key: 'cri', label: '치명타' },
  { key: 'accuracy', label: '명중' },
  { key: 'dodge', label: '회피' },
  { key: 'hp_regen', label: 'HP 재생' },
  { key: 'crit_dmg_pct', label: '크리 데미지 %' },
  { key: 'lifesteal_pct', label: '흡혈 %' },
  { key: 'dot_amp_pct', label: '도트 증폭 %' },
  { key: 'def_reduce_pct', label: '약화 %' },
  { key: 'berserk_pct', label: '광전사 %' },
  { key: 'first_strike_pct', label: '약점간파 %' },
  { key: 'ambush_pct', label: '각성 %' },
  { key: 'spd_pct', label: '속도증가%' },
  { key: 'full_hp_amp_pct', label: '풀피증뎀%' },
  { key: 'guardian_pct', label: '수호자 %' },
  { key: 'predator_pct', label: '포식자 %' },
  { key: 'thorns_pct', label: '가시 %' },
  { key: 'slow_pct', label: '저주 %' },
  { key: 'exp_bonus_pct', label: '경험치 %' },
  { key: 'gold_bonus_pct', label: '골드 %' },
  // 신규 8종 (4월 패치)
  { key: 'max_hp_pct', label: '최대 HP %' },
  { key: 'all_stats_pct', label: '전체스탯 %' },
  { key: 'atk_pct', label: '공격력 %' },
  { key: 'matk_pct', label: '마법공격 %' },
  { key: 'def_pierce_pct', label: '추가 방어 무시 %' },
  { key: 'multi_hit_amp_pct', label: '다단 타격 데미지 %' },
  { key: 'miss_combo_pct', label: '빗나감 누적 보너스 %' },
  { key: 'evasion_burst_pct', label: '회피 반격 %' },
  { key: 'drop_rate_pct', label: '드랍률 %' },
  // 110제 craft 추가 옵션
  { key: 'shield_amp', label: '실드 효과 %' },
  { key: 'summon_amp', label: '소환수 데미지 %' },
  { key: 'summon_double_hit', label: '소환수 2회 타격 %' },
  { key: 'summon_max_extra', label: '최대 소환수 +' },
  { key: 'execute_pct', label: '처형 %' },
  { key: 'shield_on_low_hp', label: '저체력 자동 실드 %' },
  { key: 'reflect_skill', label: '스킬 피해 반사 %' },
  { key: 'def_convert_atk', label: '방어→공격 전환 %' },
  { key: 'damage_taken_down_pct', label: '받는 피해 감소 %' },
];

const TIER_COLOR: Record<number, string> = { 1: '#5b8ecc', 2: '#b060cc', 3: '#ffcc33', 4: '#ff4444' };

function FilterPanel({ qualityMin, qualityMax, setQualityMin, setQualityMax, prefixStatKey, setPrefixStatKey, prefixTier, setPrefixTier }: {
  qualityMin: number; qualityMax: number;
  setQualityMin: (n: number) => void; setQualityMax: (n: number) => void;
  prefixStatKey: string; setPrefixStatKey: (s: string) => void;
  prefixTier: number; setPrefixTier: (n: number) => void;
}) {
  // 편집 중 문자열 상태 — blur/Enter 에만 부모 숫자 상태에 반영. 입력 중 빈 값/중간 값 허용.
  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  const minDisplay = minDraft !== null ? minDraft : String(qualityMin);
  const maxDisplay = maxDraft !== null ? maxDraft : String(qualityMax);
  function commitMin() {
    if (minDraft === null) return;
    const n = Number(minDraft);
    const final = !minDraft || Number.isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.floor(n)));
    setQualityMin(final); setMinDraft(null);
  }
  function commitMax() {
    if (maxDraft === null) return;
    const n = Number(maxDraft);
    const final = !maxDraft || Number.isNaN(n) ? 100 : Math.max(0, Math.min(100, Math.floor(n)));
    setQualityMax(final); setMaxDraft(null);
  }
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      padding: '8px 12px', marginBottom: 10, background: 'var(--bg-panel)',
      border: '1px solid var(--border)', borderRadius: 4, fontSize: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-dim)' }}>품질</span>
        <input type="text" inputMode="numeric" pattern="[0-9]*"
          value={minDisplay}
          onChange={e => setMinDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onFocus={e => e.target.select()}
          onBlur={commitMin}
          onKeyDown={e => { if (e.key === 'Enter') { commitMin(); (e.target as HTMLInputElement).blur(); } }}
          style={{ width: 50, padding: '3px 5px', fontSize: 11 }} />
        <span style={{ color: 'var(--text-dim)' }}>~</span>
        <input type="text" inputMode="numeric" pattern="[0-9]*"
          value={maxDisplay}
          onChange={e => setMaxDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onFocus={e => e.target.select()}
          onBlur={commitMax}
          onKeyDown={e => { if (e.key === 'Enter') { commitMax(); (e.target as HTMLInputElement).blur(); } }}
          style={{ width: 50, padding: '3px 5px', fontSize: 11 }} />
        <span style={{ color: 'var(--text-dim)' }}>%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--text-dim)' }}>접두사</span>
        <select value={prefixStatKey} onChange={e => setPrefixStatKey(e.target.value)}
          style={{ padding: '3px 5px', fontSize: 11, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          {PREFIX_STAT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--text-dim)', marginRight: 2 }}>티어</span>
        {[0, 1, 2, 3, 4].map(t => {
          const active = prefixTier === t;
          const color = t === 0 ? 'var(--accent)' : TIER_COLOR[t];
          return (
            <button key={t} onClick={() => setPrefixTier(t)} style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
              background: active ? color : 'transparent',
              color: active ? '#000' : color,
              border: `1px solid ${color}`,
              fontWeight: 800,
            }}>{t === 0 ? '전체' : `T${t}`}</button>
          );
        })}
      </div>
      {(qualityMin > 0 || qualityMax < 100 || prefixStatKey || prefixTier > 0) && (
        <button onClick={() => { setQualityMin(0); setQualityMax(100); setPrefixStatKey(''); setPrefixTier(0); }}
          style={{ fontSize: 10, padding: '3px 8px' }}>필터 초기화</button>
      )}
    </div>
  );
}

// 거래소 목록 (레벨 구간 탭 필터 — 유니크 탭과 동일 UI)
function BrowseListings({ listings, slotFilter, weaponClass, levelBracket, equipped, sortMode, onBuy }: {
  listings: Listing[]; slotFilter: string; weaponClass: string; levelBracket: string;
  equipped: Equipped;
  sortMode: 'default' | 'latest';
  onBuy: (a: Listing) => void;
}) {
  // 1. 무기 직업 필터
  let filtered = listings;
  if (slotFilter === 'weapon' && weaponClass) {
    filtered = listings.filter(a => {
      const cls = a.classRestriction || inferWeaponClass(a.baseItemName || a.itemName || '');
      return cls === weaponClass;
    });
  }

  // 2. 레벨 구간 필터
  const inBracket = (lv: number): boolean => {
    if (!levelBracket) return true;
    if (levelBracket === '100+') return lv >= 100;
    const [lo, hi] = levelBracket.split('-').map(Number);
    return lv >= lo && lv <= hi;
  };
  filtered = filtered.filter(a => inBracket(a.requiredLevel || 1));

  if (filtered.length === 0) {
    return <div style={{ color: 'var(--text-dim)', padding: 20, textAlign: 'center' }}>해당 레벨 구간에 등록된 아이템이 없습니다</div>;
  }

  // 3. 정렬 — 기본(레벨·가격) 또는 최신순(id 내림차순)
  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'latest') return b.id - a.id;
    const la = a.requiredLevel || 1;
    const lb = b.requiredLevel || 1;
    if (la !== lb) return la - lb;
    return a.price - b.price;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sorted.map(a => <ListingRow key={a.id} a={a} equipped={equipped} onBuy={() => onBuy(a)} />)}
    </div>
  );
}

function ListingRow({ a, equipped, onBuy }: { a: Listing; equipped?: Equipped; onBuy: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const timeLeft = Math.max(0, new Date(a.endsAt).getTime() - Date.now());
  const h = Math.floor(timeLeft / 3600000); const m = Math.floor((timeLeft % 3600000) / 60000);
  const el = a.enhanceLevel || 0;
  const gradeClr = GRADE_COLOR[a.itemGrade] || 'var(--border)';

  return (
    <div style={{
      padding: 12, background: 'var(--bg-panel)',
      borderLeft: `3px solid ${gradeClr}`,
      border: '1px solid var(--border)',
      borderRadius: 4,
    }}>
      {/* 헤더: 아이콘 + 이름 + 가격 + 구매 버튼 (클릭 시 상세 토글) */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}
      >
        <ItemIcon slot={a.itemSlot ?? null} grade={a.itemGrade} itemName={a.baseItemName || a.itemName} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            {a.prefixName && (
              <span style={{ color: '#66ccff', fontWeight: 700, fontSize: 14 }}>{a.prefixName}</span>
            )}
            <span style={nameStyle(a.itemGrade, 14)}>{a.baseItemName || a.itemName}</span>
            {el > 0 && (
              <span style={{
                color: '#000', background: 'var(--accent)', padding: '0 5px',
                borderRadius: 2, fontSize: 11, fontWeight: 900, lineHeight: '16px',
              }}>+{el}</span>
            )}
            {a.itemQuantity > 1 && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>×{a.itemQuantity}</span>}
            {a.quality !== undefined && (() => {
              const q = a.quality!;
              const color = q >= 90 ? '#ff8800' : q >= 70 ? '#daa520' : q >= 40 ? '#66ccff' : q >= 20 ? '#8dc38d' : '#888';
              return (
                <span style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 3,
                  background: color + '22', border: `1px solid ${color}`, color, fontWeight: 700,
                }}>품질 {q}%</span>
              );
            })()}
            {a.classRestriction && (() => {
              const cls = a.classRestriction!;
              const krMap: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적', summoner: '소환사' };
              const colorMap: Record<string, string> = { warrior: '#e04040', mage: '#4080e0', cleric: '#daa520', rogue: '#a060c0', summoner: '#44cc88' };
              return (
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 2,
                  border: `1px solid ${colorMap[cls]}`, color: colorMap[cls], fontWeight: 700,
                }}>{krMap[cls]} 전용</span>
              );
            })()}
            {a.requiredLevel && a.requiredLevel > 1 && (
              <span style={{
                fontSize: 10, padding: '1px 5px', borderRadius: 2,
                background: 'rgba(102,204,255,0.12)', border: '1px solid #66ccff',
                color: '#66ccff', fontWeight: 700,
              }}>Lv.{a.requiredLevel}+</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            남은 시간 {h}시간 {m}분
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>
            {a.price.toLocaleString()}G
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onBuy(); }}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 700,
              background: 'var(--success)', color: '#000',
              border: 'none', cursor: 'pointer', borderRadius: 4,
            }}
          >구매</button>
        </div>
      </div>

      {/* 본문: 스탯 + 접두사 (클릭 시 펼침) */}
      {expanded && (
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {a.itemStats && Object.keys(a.itemStats).length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3, fontWeight: 700 }}>아이템 스탯</div>
            <ItemStatsBlock stats={a.itemStats} enhanceLevel={el} quality={a.quality || 0} />
            {/* 매물 접두사 — 스탯 바로 아래, 내 장착 비교 블록 위로 이동 (UX 피드백) */}
            {a.prefixStats && Object.keys(a.prefixStats).length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3, fontWeight: 700 }}>접두사</div>
                <PrefixDisplay prefixStats={a.prefixStats} prefixTiers={(a as any).prefixTiers} />
              </div>
            )}
            {a.itemSlot && equipped && (equipped as any)[a.itemSlot] && (() => {
              const eq = (equipped as any)[a.itemSlot];
              return (
                <div style={{ marginTop: 8, padding: 8, background: 'rgba(218,165,32,0.05)', border: '1px solid rgba(218,165,32,0.25)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700 }}>
                    내 장착 중 · <span style={nameStyle(eq.grade, 11)}>{eq.name}</span>
                    {eq.enhanceLevel ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}> +{eq.enhanceLevel}</span> : ''}
                    {eq.quality ? <span style={{ color: 'var(--text-dim)' }}> · 품질 {eq.quality}%</span> : ''}
                  </div>
                  {/* 내 장착 스탯 (base stats 에 강화·품질 적용) */}
                  <ItemStatsBlock stats={eq.baseStats || eq.stats} enhanceLevel={eq.enhanceLevel || 0} quality={eq.quality || 0} />
                  {/* 내 장착 접두사 */}
                  {eq.prefixStats && Object.keys(eq.prefixStats).length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <PrefixDisplay prefixStats={eq.prefixStats} prefixTiers={eq.prefixTiers} />
                    </div>
                  )}
                  {/* 매물 대비 내 장착 diff — 매물로 바꿨을 때 변화량 (+ 면 매물이 더 좋음) */}
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3, fontWeight: 700 }}>
                      매물 교체 시 변화량 (+ 증가 / − 감소)
                    </div>
                    <ItemComparison
                      itemStats={a.itemStats}
                      equippedStats={eq.baseStats || eq.stats}
                      itemEnhance={el}
                      equippedEnhance={eq.enhanceLevel || 0}
                      itemQuality={a.quality || 0}
                      equippedQuality={eq.quality || 0}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        {a.itemDescription && (
          <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 6, fontStyle: 'italic' }}>
            {a.itemDescription}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

type ListCategory = 'all' | 'weapon' | 'helm' | 'chest' | 'boots' | 'ring' | 'amulet' | 'locked';
const LIST_CATS: { key: ListCategory; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'locked', label: '🔒 잠금' },
  { key: 'weapon', label: '무기' },
  { key: 'helm', label: '투구' },
  { key: 'chest', label: '갑옷' },
  { key: 'boots', label: '신발' },
  { key: 'ring', label: '반지' },
  { key: 'amulet', label: '목걸이' },
];

function ListItemPanel({ active, inv, onDone }: { active: number | undefined; inv: InventorySlot[]; onDone: () => void }) {
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [cat, setCat] = useState<ListCategory>('all');

  const sel = slotIndex !== null ? inv.find(s => s.slotIndex === slotIndex) : null;
  const maxQty = sel?.quantity ?? 1;

  // 장비 아이템만 + 카테고리 필터 + 잠긴 아이템 우선 정렬
  const equipInv = inv.filter(s => !!s.item.slot);
  const filteredInv = (() => {
    let list = equipInv;
    if (cat === 'locked') list = list.filter(s => (s as any).locked);
    else if (cat !== 'all') list = list.filter(s => s.item.slot === cat);
    return [...list].sort((a, b) => {
      const la = (a as any).locked ? 1 : 0;
      const lb = (b as any).locked ? 1 : 0;
      if (la !== lb) return lb - la; // 잠긴 것 먼저
      return b.slotIndex - a.slotIndex;
    });
  })();
  const catCount = (k: ListCategory) => {
    if (k === 'all') return equipInv.length;
    if (k === 'locked') return equipInv.filter(s => (s as any).locked).length;
    return equipInv.filter(s => s.item.slot === k).length;
  };

  async function submit() {
    if (!active || slotIndex === null) return;
    const p = Number(price);
    if (!p || p < 1) { alert('판매가를 입력하세요'); return; }
    try {
      await api('/marketplace/list', {
        method: 'POST',
        body: JSON.stringify({
          characterId: active, slotIndex, quantity: qty, price: p,
        }),
      });
      onDone();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <div style={{ marginBottom: 8, color: 'var(--text-dim)', fontSize: 13 }}>판매할 아이템을 선택하세요 · 수수료 10% · 등록 기간 72시간</div>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {LIST_CATS.map(({ key, label }) => {
          const n = catCount(key);
          const active = cat === key;
          return (
            <button key={key} onClick={() => { setCat(key); setSlotIndex(null); }}
              style={{
                padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                background: active ? 'var(--accent)' : 'var(--bg-panel)',
                color: active ? '#000' : 'var(--text-dim)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 3, fontWeight: active ? 700 : 400,
                opacity: n === 0 && !active ? 0.5 : 1,
              }}>{label} {n > 0 && `(${n})`}</button>
          );
        })}
      </div>

      {/* 인벤토리 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, marginBottom: 16 }}>
        {filteredInv.length === 0 && <div style={{ color: 'var(--text-dim)', gridColumn: '1 / -1', padding: 20, textAlign: 'center' }}>해당 카테고리에 아이템 없음</div>}
        {filteredInv.map(s => {
          const gradeClr = GRADE_COLOR[s.item.grade];
          const isSel = slotIndex === s.slotIndex;
          return (
            <div key={s.slotIndex} onClick={() => { setSlotIndex(s.slotIndex); setQty(1); setPrice(''); }}
              style={{
                padding: 8, background: isSel ? 'var(--bg-elev)' : 'var(--bg-panel)',
                borderLeft: `3px solid ${gradeClr}`,
                border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 4, cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ItemIcon slot={s.item.slot ?? null} grade={s.item.grade} itemName={s.item.name} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={nameStyle(s.item.grade, 12)}>
                    {(s as any).locked && <span style={{ marginRight: 4 }}>🔒</span>}
                    {s.item.name}
                    {s.enhanceLevel > 0 && (
                      <span style={{
                        color: '#000', background: 'var(--accent)', padding: '0 4px',
                        borderRadius: 2, fontSize: 10, fontWeight: 900, marginLeft: 4,
                        // 유니크 그라데이션의 WebkitTextFillColor:transparent 상속 차단 — 100제 유니크에서 +N 글자 안 보이는 버그 수정
                        WebkitTextFillColor: '#000', backgroundClip: 'border-box', WebkitBackgroundClip: 'border-box',
                      }}>+{s.enhanceLevel}</span>
                    )}
                  </div>
                  {(s as any).quality !== undefined && (() => {
                    const q = (s as any).quality;
                    const color = q >= 90 ? '#ff8800' : q >= 70 ? '#daa520' : q >= 40 ? '#66ccff' : q >= 20 ? '#8dc38d' : '#888';
                    return <div style={{ fontSize: 9, color, fontWeight: 700, marginTop: 1 }}>품질 {q}%</div>;
                  })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sel && (
        <div style={{
          padding: 14, background: 'var(--bg-panel)',
          border: '2px solid var(--accent)', borderRadius: 6,
        }}>
          {/* 선택 아이템 상세 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <ItemIcon slot={sel.item.slot ?? null} grade={sel.item.grade} itemName={sel.item.name} size={32} />
            <div style={{ flex: 1 }}>
              <div style={nameStyle(sel.item.grade, 15)}>
                {sel.item.name}
                {sel.enhanceLevel > 0 && (
                  <span style={{
                    color: '#000', background: 'var(--accent)', padding: '0 5px',
                    borderRadius: 2, fontSize: 11, fontWeight: 900, marginLeft: 6,
                    WebkitTextFillColor: '#000', WebkitBackgroundClip: 'border-box',
                  }}>+{sel.enhanceLevel}</span>
                )}
              </div>
              {(sel as any).quality !== undefined && (() => {
                const q = (sel as any).quality;
                const color = q >= 90 ? '#ff8800' : q >= 70 ? '#daa520' : q >= 40 ? '#66ccff' : q >= 20 ? '#8dc38d' : '#888';
                return (
                  <span style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 3, marginTop: 4, display: 'inline-block',
                    background: color + '22', border: `1px solid ${color}`, color, fontWeight: 700,
                  }}>품질 {q}%</span>
                );
              })()}
            </div>
          </div>
          {sel.item.stats && (
            <div style={{ marginBottom: 6 }}>
              <ItemStatsBlock stats={(sel.item as any).baseStats || sel.item.stats} enhanceLevel={sel.enhanceLevel || 0} quality={(sel as any).quality || 0} />
            </div>
          )}
          {sel.prefixStats && Object.keys(sel.prefixStats).length > 0 && (
            <PrefixDisplay prefixStats={sel.prefixStats} prefixTiers={(sel as any).prefixTiers} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>수량 (최대 {maxQty})
              <input type="number" min="1" max={maxQty} value={qty} onChange={e => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
                style={{ marginLeft: 8, width: 80 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>판매가
              <input type="text" value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="금액 입력"
                style={{ marginLeft: 8, width: 140 }} />G
            </label>
            {price && Number(price) > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                판매 시 수령액: <b style={{ color: 'var(--accent)' }}>{Math.floor(Number(price) * 0.9).toLocaleString()}G</b>
                <span style={{ marginLeft: 6 }}>(수수료 10% 차감)</span>
              </div>
            )}
            <button className="primary" onClick={submit} disabled={!price}>등록</button>
          </div>
        </div>
      )}
    </div>
  );
}
