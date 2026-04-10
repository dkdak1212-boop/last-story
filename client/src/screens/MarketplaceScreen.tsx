import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, InventorySlot, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, STAT_LABEL } from '../components/ui/ItemStats';

interface Listing {
  id: number; itemId: number; itemQuantity: number;
  price: number;
  endsAt: string; sellerName?: string;
  itemName: string; itemGrade: ItemGrade; itemType?: string; itemSlot?: string | null;
  itemStats?: Partial<Stats> | null; itemDescription?: string;
  enhanceLevel?: number; prefixStats?: Record<string, number> | null;
  settled?: boolean; cancelled?: boolean;
}

export function MarketplaceScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [tab, setTab] = useState<'browse' | 'list' | 'mine'>('browse');
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>('');

  async function loadBrowse() {
    const q = gradeFilter ? `?grade=${gradeFilter}` : '';
    setListings(await api<Listing[]>(`/marketplace${q}`));
  }
  async function loadMine() {
    if (!active) return;
    setMine(await api<Listing[]>(`/marketplace/mine/${active.id}`));
  }
  async function loadInv() {
    if (!active) return;
    const d = await api<{ inventory: InventorySlot[] }>(`/characters/${active.id}/inventory`);
    setInv(d.inventory);
  }

  useEffect(() => {
    if (tab === 'browse') loadBrowse();
    if (tab === 'list') loadInv();
    if (tab === 'mine') loadMine();
  }, [tab, gradeFilter, active?.id]);

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
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className={tab === 'browse' ? 'primary' : ''} onClick={() => setTab('browse')}>둘러보기</button>
        <button className={tab === 'list' ? 'primary' : ''} onClick={() => setTab('list')}>등록</button>
        <button className={tab === 'mine' ? 'primary' : ''} onClick={() => setTab('mine')}>내 등록</button>
      </div>

      {tab === 'browse' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>등급 필터:</span>
            {['', 'common', 'rare', 'epic', 'legendary'].map(g => (
              <button key={g} onClick={() => setGradeFilter(g)} className={gradeFilter === g ? 'primary' : ''} style={{ fontSize: 11, padding: '3px 10px' }}>
                {g === '' ? '전체' : g === 'common' ? '일반' : g === 'rare' ? '희귀' : g === 'epic' ? '영웅' : '전설'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {listings.length === 0 && <div style={{ color: 'var(--text-dim)' }}>등록된 아이템이 없습니다</div>}
            {listings.map(a => (
              <ListingRow key={a.id} a={a} onBuy={() => buy(a)} />
            ))}
          </div>
        </>
      )}

      {tab === 'list' && <ListItemPanel active={active?.id} inv={inv} onDone={() => { loadInv(); setTab('mine'); }} />}

      {tab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mine.length === 0 && <div style={{ color: 'var(--text-dim)' }}>등록한 아이템이 없습니다</div>}
          {mine.map(a => (
            <div key={a.id} style={{ padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: GRADE_COLOR[a.itemGrade], fontWeight: 700 }}>{a.itemName}</span>
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

function ListingRow({ a, onBuy }: { a: Listing; onBuy: () => void }) {
  const timeLeft = Math.max(0, new Date(a.endsAt).getTime() - Date.now());
  const h = Math.floor(timeLeft / 3600000); const m = Math.floor((timeLeft % 3600000) / 60000);
  const el = a.enhanceLevel || 0;

  // 강화 적용된 스탯 계산
  const enhancedStats = a.itemStats ? (() => {
    const mult = 1 + el * 0.075;
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(a.itemStats!)) result[k] = Math.round((v as number) * mult);
    return result;
  })() : null;

  return (
    <div style={{ padding: 12, background: 'var(--bg-panel)', border: `1px solid ${GRADE_COLOR[a.itemGrade]}` }}>
      <div className="auction-row-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div>
            <span style={{ color: GRADE_COLOR[a.itemGrade], fontWeight: 700 }}>{a.itemName}</span>
            {el > 0 && <span style={{ color: 'var(--accent)', fontWeight: 700, marginLeft: 4 }}>+{el}</span>}
            {a.itemQuantity > 1 && <span style={{ marginLeft: 6, color: 'var(--text-dim)', fontSize: 12 }}>×{a.itemQuantity}</span>}
            <span style={{ marginLeft: 8, fontSize: 10, color: GRADE_COLOR[a.itemGrade] }}>[{GRADE_LABEL[a.itemGrade]}]</span>
          </div>
          {/* 기본 스탯 (강화 적용) */}
          {enhancedStats && (
            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(enhancedStats).map(([k, v]) => (
                <span key={k} style={{ color: '#aac8a0' }}>{STAT_LABEL[k] || k} +{v}</span>
              ))}
            </div>
          )}
          {/* 접두사 효과 */}
          {a.prefixStats && Object.keys(a.prefixStats).length > 0 && (
            <div style={{ marginTop: 2, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {Object.entries(a.prefixStats).map(([k, v]) => {
                const special = ['def_reduce_pct','slow_pct','dot_amp_pct','hp_regen','lifesteal_pct','gold_bonus_pct','exp_bonus_pct','crit_dmg_pct'].includes(k);
                const fmts: Record<string, (v: number) => string> = {
                  str: v => `힘 +${v}`, dex: v => `민첩 +${v}`, int: v => `지능 +${v}`, vit: v => `체력 +${v}`,
                  spd: v => `속도 +${v}`, cri: v => `치명타 확률 +${v}%`, accuracy: v => `명중 +${v}`, dodge: v => `회피 +${v}`,
                  def_reduce_pct: v => `몬스터 방어력 ${v}% 감소`, slow_pct: v => `몬스터 속도 ${v}% 감소`,
                  dot_amp_pct: v => `도트 데미지 ${v}% 증가`, hp_regen: v => `틱당 HP ${v} 회복`,
                  lifesteal_pct: v => `데미지 흡혈 ${(v/10).toFixed(1)}%`, gold_bonus_pct: v => `골드 획득 ${v}% 증가`,
                  exp_bonus_pct: v => `경험치 획득 ${v}% 증가`, crit_dmg_pct: v => `치명타 데미지 ${v}% 증가`,
                };
                const text = fmts[k] ? fmts[k](v) : `${STAT_LABEL[k]||k} +${v}`;
                return <span key={k} style={{ color: special ? '#66ccff' : '#e0a040', fontWeight: 600 }}>{special ? '◆ ' : ''}{text}</span>;
              })}
            </div>
          )}
          {a.itemDescription && <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2, fontStyle: 'italic' }}>{a.itemDescription}</div>}
          <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4 }}>
            판매자: {a.sellerName} · {h}시간 {m}분 남음
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>{a.price.toLocaleString()}G</div>
        </div>
        <div className="auction-actions">
          <button className="primary" onClick={onBuy} style={{ fontSize: 13, padding: '6px 16px', fontWeight: 700 }}>구매</button>
        </div>
      </div>
    </div>
  );
}

function ListItemPanel({ active, inv, onDone }: { active: number | undefined; inv: InventorySlot[]; onDone: () => void }) {
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');

  const sel = slotIndex !== null ? inv.find(s => s.slotIndex === slotIndex) : null;
  const maxQty = sel?.quantity ?? 1;

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

  // 접두사 효과 포맷 (PrefixDisplay와 동일)
  const EFFECT_FMTS: Record<string, (v: number) => string> = {
    str: v => `힘 +${v}`, dex: v => `민첩 +${v}`, int: v => `지능 +${v}`, vit: v => `체력 +${v}`,
    spd: v => `속도 +${v}`, cri: v => `치명타 확률 +${v}%`, accuracy: v => `명중 +${v}`, dodge: v => `회피 +${v}`,
    def_reduce_pct: v => `몬스터 방어력 ${v}% 감소`, slow_pct: v => `몬스터 속도 ${v}% 감소`,
    dot_amp_pct: v => `도트 데미지 ${v}% 증가`, hp_regen: v => `틱당 HP ${v} 회복`,
    lifesteal_pct: v => `데미지 흡혈 ${(v/10).toFixed(1)}%`, gold_bonus_pct: v => `골드 획득 ${v}% 증가`,
    exp_bonus_pct: v => `경험치 획득 ${v}% 증가`, crit_dmg_pct: v => `치명타 데미지 ${v}% 증가`,
  };

  return (
    <div>
      <div style={{ marginBottom: 12, color: 'var(--text-dim)', fontSize: 13 }}>판매할 아이템을 선택하세요 · 수수료 10% · 등록 기간 72시간</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, marginBottom: 16 }}>
        {inv.length === 0 && <div style={{ color: 'var(--text-dim)' }}>인벤토리 비어있음</div>}
        {inv.map(s => (
          <div key={s.slotIndex} onClick={() => { setSlotIndex(s.slotIndex); setQty(1); setPrice(''); }}
            style={{
              padding: 8, background: slotIndex === s.slotIndex ? 'var(--bg-elev)' : 'var(--bg-panel)',
              border: `1px solid ${slotIndex === s.slotIndex ? 'var(--accent)' : GRADE_COLOR[s.item.grade] || 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12,
            }}>
            <div style={{ fontWeight: 700, color: GRADE_COLOR[s.item.grade] }}>
              {s.item.name}{s.enhanceLevel > 0 && <span style={{ color: 'var(--accent)' }}> +{s.enhanceLevel}</span>}
              {s.quantity > 1 && ` ×${s.quantity}`}
            </div>
            <div style={{ fontSize: 10, color: GRADE_COLOR[s.item.grade] }}>[{GRADE_LABEL[s.item.grade]}]</div>
            {/* 접두사 미리보기 */}
            {s.prefixStats && Object.keys(s.prefixStats).length > 0 && (
              <div style={{ fontSize: 10, color: '#66ccff', marginTop: 2 }}>
                {Object.entries(s.prefixStats).slice(0, 2).map(([k, v]) => {
                  const fmt = EFFECT_FMTS[k];
                  return <div key={k}>{fmt ? fmt(v) : `${k} +${v}`}</div>;
                })}
                {Object.keys(s.prefixStats).length > 2 && <div>+{Object.keys(s.prefixStats).length - 2}개 더</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      {sel && (
        <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>
          {/* 선택 아이템 상세 */}
          <div style={{ fontWeight: 700, color: GRADE_COLOR[sel.item.grade], fontSize: 15, marginBottom: 4 }}>
            {sel.item.name}{sel.enhanceLevel > 0 && <span style={{ color: 'var(--accent)' }}> +{sel.enhanceLevel}</span>}
          </div>
          {sel.item.stats && (
            <div style={{ fontSize: 11, color: 'var(--success)', marginBottom: 2 }}>
              {Object.entries(sel.item.stats).map(([k, v]) => `${STAT_LABEL[k]||k} +${v}`).join(' · ')}
            </div>
          )}
          {sel.prefixStats && Object.keys(sel.prefixStats).length > 0 && (
            <div style={{ fontSize: 11, marginBottom: 6 }}>
              {Object.entries(sel.prefixStats).map(([k, v]) => {
                const fmt = EFFECT_FMTS[k];
                const special = ['def_reduce_pct','slow_pct','dot_amp_pct','hp_regen','lifesteal_pct','gold_bonus_pct','exp_bonus_pct','crit_dmg_pct'].includes(k);
                return <div key={k} style={{ color: special ? '#66ccff' : '#e0a040' }}>{special ? '◆ ' : ''}{fmt ? fmt(v) : `${k} +${v}`}</div>;
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
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
