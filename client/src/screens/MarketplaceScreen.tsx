import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, InventorySlot, Stats } from '../types';
import { GRADE_COLOR, GRADE_LABEL, STAT_LABEL } from '../components/ui/ItemStats';

interface Auction {
  id: number; itemId: number; itemQuantity: number;
  startPrice: number; buyoutPrice: number | null;
  currentBid: number | null; endsAt: string; sellerName: string;
  itemName: string; itemGrade: ItemGrade; itemType: string; itemSlot: string | null;
  itemStats: Partial<Stats> | null; itemDescription: string;
  enhanceLevel?: number; prefixStats?: Record<string, number> | null;
  settled?: boolean; cancelled?: boolean;
}

export function MarketplaceScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [tab, setTab] = useState<'browse' | 'list' | 'mine'>('browse');
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [mine, setMine] = useState<Auction[]>([]);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string>('');

  async function loadBrowse() {
    const q = gradeFilter ? `?grade=${gradeFilter}` : '';
    setAuctions(await api<Auction[]>(`/marketplace${q}`));
  }
  async function loadMine() {
    if (!active) return;
    setMine(await api<Auction[]>(`/marketplace/mine/${active.id}`));
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

  async function bid(a: Auction) {
    if (!active) return;
    const min = a.currentBid ? a.currentBid + 1 : a.startPrice;
    const input = prompt(`입찰가 (최소 ${min}G)`, String(min));
    if (!input) return;
    const n = Number(input);
    if (!Number.isFinite(n) || n < min) return alert('잘못된 금액');
    try {
      await api(`/marketplace/${a.id}/bid`, { method: 'POST', body: JSON.stringify({ characterId: active.id, bid: n }) });
      await refreshActive(); loadBrowse();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function buyout(a: Auction) {
    if (!active || !a.buyoutPrice) return;
    if (!confirm(`${a.buyoutPrice}G에 즉시구매?`)) return;
    try {
      await api(`/marketplace/${a.id}/buyout`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      await refreshActive(); loadBrowse();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }
  async function cancel(id: number) {
    if (!active) return;
    try {
      await api(`/marketplace/${id}/cancel`, { method: 'POST', body: JSON.stringify({ characterId: active.id }) });
      loadMine();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>경매소</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className={tab === 'browse' ? 'primary' : ''} onClick={() => setTab('browse')}>둘러보기</button>
        <button className={tab === 'list' ? 'primary' : ''} onClick={() => setTab('list')}>등록</button>
        <button className={tab === 'mine' ? 'primary' : ''} onClick={() => setTab('mine')}>내 경매</button>
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
            {auctions.length === 0 && <div style={{ color: 'var(--text-dim)' }}>경매 없음</div>}
            {auctions.map(a => (
              <AuctionRow key={a.id} a={a} onBid={() => bid(a)} onBuyout={() => buyout(a)} />
            ))}
          </div>
        </>
      )}

      {tab === 'list' && <ListItemPanel active={active?.id} inv={inv} onDone={() => { loadInv(); setTab('mine'); }} />}

      {tab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mine.length === 0 && <div style={{ color: 'var(--text-dim)' }}>내 경매 없음</div>}
          {mine.map(a => (
            <div key={a.id} style={{ padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ color: GRADE_COLOR[a.itemGrade], fontWeight: 700 }}>{a.itemName}</span>
                  <span style={{ marginLeft: 6, color: 'var(--text-dim)', fontSize: 12 }}>×{a.itemQuantity}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {a.settled ? '정산 완료' : a.cancelled ? '취소됨' : `현재가: ${a.currentBid ?? a.startPrice}G`}
                </div>
              </div>
              {!a.settled && !a.cancelled && !a.currentBid && (
                <button onClick={() => cancel(a.id)} style={{ marginTop: 6, fontSize: 12 }}>취소</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuctionRow({ a, onBid, onBuyout }: { a: Auction; onBid: () => void; onBuyout: () => void }) {
  const cur = a.currentBid ?? a.startPrice;
  const timeLeft = Math.max(0, new Date(a.endsAt).getTime() - Date.now());
  const h = Math.floor(timeLeft / 3600000); const m = Math.floor((timeLeft % 3600000) / 60000);
  const el = a.enhanceLevel || 0;

  // 강화 적용된 스탯 계산
  const enhancedStats = a.itemStats ? (() => {
    const mult = el <= 6 ? (1 + el * 0.15) : (1 + 6 * 0.15 + (el - 6) * 0.25);
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
                  spd: v => `속도 +${v}`, cri: v => `치명타 +${v}%`, accuracy: v => `명중 +${v}`, dodge: v => `회피 +${v}`,
                  def_reduce_pct: v => `몬스터 방어력 ${v}% 감소`, slow_pct: v => `몬스터 속도 ${v}% 감소`,
                  dot_amp_pct: v => `도트 데미지 ${v}% 증가`, hp_regen: v => `틱당 HP ${v} 회복`,
                  lifesteal_pct: v => `데미지 흡혈 ${(v/10).toFixed(1)}%`, gold_bonus_pct: v => `골드 획득 ${v}% 증가`,
                  exp_bonus_pct: v => `경험치 획득 ${v}% 증가`, crit_dmg_pct: v => `크리 데미지 ${v}% 증가`,
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
          <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{cur.toLocaleString()}G</div>
          {a.buyoutPrice && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>즉구: {a.buyoutPrice.toLocaleString()}G</div>}
        </div>
        <div className="auction-actions" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="primary" onClick={onBid} style={{ fontSize: 12, padding: '4px 12px' }}>입찰</button>
          {a.buyoutPrice && <button onClick={onBuyout} style={{ fontSize: 12, padding: '4px 12px' }}>즉구</button>}
        </div>
      </div>
    </div>
  );
}

function ListItemPanel({ active, inv, onDone }: { active: number | undefined; inv: InventorySlot[]; onDone: () => void }) {
  const [slotIndex, setSlotIndex] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [startPrice, setStartPrice] = useState(100);
  const [buyout, setBuyout] = useState<string>('');

  const sel = slotIndex !== null ? inv.find(s => s.slotIndex === slotIndex) : null;
  const maxQty = sel?.quantity ?? 1;

  async function submit() {
    if (!active || slotIndex === null) return;
    try {
      await api('/marketplace/list', {
        method: 'POST',
        body: JSON.stringify({
          characterId: active, slotIndex, quantity: qty, startPrice,
          buyoutPrice: buyout ? Number(buyout) : null,
        }),
      });
      onDone();
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
  }

  return (
    <div>
      <div style={{ marginBottom: 12, color: 'var(--text-dim)', fontSize: 13 }}>판매할 아이템을 선택하세요 (수수료 10%, 24시간)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 16 }}>
        {inv.length === 0 && <div style={{ color: 'var(--text-dim)' }}>인벤토리 비어있음</div>}
        {inv.map(s => (
          <div key={s.slotIndex} onClick={() => { setSlotIndex(s.slotIndex); setQty(1); }}
            style={{
              padding: 8, background: slotIndex === s.slotIndex ? 'var(--bg-elev)' : 'var(--bg-panel)',
              border: `1px solid ${slotIndex === s.slotIndex ? 'var(--accent)' : GRADE_COLOR[s.item.grade] || 'var(--border)'}`,
              cursor: 'pointer', fontSize: 13,
            }}>
            <div style={{ fontWeight: 700, color: GRADE_COLOR[s.item.grade] }}>
              {s.item.name}{s.enhanceLevel > 0 && <span style={{ color: 'var(--accent)' }}> +{s.enhanceLevel}</span>}
              {s.quantity > 1 && ` ×${s.quantity}`}
            </div>
            <div style={{ fontSize: 11, color: GRADE_COLOR[s.item.grade] }}>[{GRADE_LABEL[s.item.grade]}]</div>
          </div>
        ))}
      </div>

      {sel && (
        <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--accent)' }}>
          <div style={{ marginBottom: 10, fontWeight: 700 }}>{sel.item.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>수량 (최대 {maxQty})
              <input type="number" min="1" max={maxQty} value={qty} onChange={e => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
                style={{ marginLeft: 8, width: 80 }} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>시작가
              <input type="number" min="1" value={startPrice} onChange={e => setStartPrice(Math.max(1, Number(e.target.value) || 1))}
                style={{ marginLeft: 8, width: 120 }} />G
            </label>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>즉시구매가 (선택)
              <input type="number" min="0" value={buyout} onChange={e => setBuyout(e.target.value)}
                style={{ marginLeft: 8, width: 120 }} placeholder="없음" />G
            </label>
            <button className="primary" onClick={submit}>등록</button>
          </div>
        </div>
      )}
    </div>
  );
}
