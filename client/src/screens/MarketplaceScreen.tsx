import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { ItemGrade, InventorySlot, Stats } from '../types';
import { GRADE_COLOR, ItemStatsBlock } from '../components/ui/ItemStats';
import { PrefixDisplay } from '../components/ui/PrefixDisplay';
import { ItemIcon } from '../components/ui/ItemIcon';

interface Listing {
  id: number; itemId: number; itemQuantity: number;
  price: number;
  endsAt: string; sellerName?: string;
  itemName: string; itemGrade: ItemGrade; itemType?: string; itemSlot?: string | null;
  itemStats?: Partial<Stats> | null; itemDescription?: string;
  enhanceLevel?: number; prefixStats?: Record<string, number> | null;
  quality?: number; classRestriction?: string | null; prefixName?: string;
  baseItemName?: string;
  settled?: boolean; cancelled?: boolean;
}

export function MarketplaceScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [tab, setTab] = useState<'browse' | 'list' | 'mine'>('browse');
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [inv, setInv] = useState<InventorySlot[]>([]);
  const [slotFilter, setSlotFilter] = useState<string>(''); // '', weapon, helm, chest, boots, ring, amulet

  async function loadBrowse() {
    const q = slotFilter ? `?slot=${slotFilter}` : '';
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
  }, [tab, slotFilter, active?.id]);

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {([
              ['', '전체'],
              ['weapon', '무기'],
              ['helm', '투구'],
              ['chest', '갑옷'],
              ['boots', '신발'],
              ['ring', '반지'],
              ['amulet', '목걸이'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSlotFilter(key)} style={{
                fontSize: 11, padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
                background: slotFilter === key ? 'var(--accent)' : 'var(--bg-panel)',
                color: slotFilter === key ? '#000' : 'var(--text-dim)',
                border: `1px solid ${slotFilter === key ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: slotFilter === key ? 700 : 400,
              }}>{label}</button>
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
  const gradeClr = GRADE_COLOR[a.itemGrade] || 'var(--border)';

  return (
    <div style={{
      padding: 12, background: 'var(--bg-panel)',
      borderLeft: `3px solid ${gradeClr}`,
      border: '1px solid var(--border)',
      borderRadius: 4,
    }}>
      {/* 헤더: 아이콘 + 이름 + 가격 + 구매 버튼 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <ItemIcon slot={a.itemSlot ?? null} grade={a.itemGrade} itemName={a.baseItemName || a.itemName} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            {a.prefixName && (
              <span style={{ color: '#66ccff', fontWeight: 700, fontSize: 14 }}>{a.prefixName}</span>
            )}
            <span style={{ color: gradeClr, fontWeight: 700, fontSize: 14 }}>{a.baseItemName || a.itemName}</span>
            {el > 0 && (
              <span style={{
                color: '#000', background: 'var(--accent)', padding: '0 5px',
                borderRadius: 2, fontSize: 11, fontWeight: 900, lineHeight: '16px',
              }}>+{el}</span>
            )}
            {a.itemQuantity > 1 && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>×{a.itemQuantity}</span>}
            {a.quality !== undefined && a.quality > 0 && (() => {
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
              const krMap: Record<string, string> = { warrior: '전사', mage: '마법사', cleric: '성직자', rogue: '도적' };
              const colorMap: Record<string, string> = { warrior: '#e04040', mage: '#4080e0', cleric: '#daa520', rogue: '#a060c0' };
              return (
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 2,
                  border: `1px solid ${colorMap[cls]}`, color: colorMap[cls], fontWeight: 700,
                }}>{krMap[cls]} 전용</span>
              );
            })()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
            판매자: {a.sellerName} · 남은 시간 {h}시간 {m}분
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>
            {a.price.toLocaleString()}G
          </div>
          <button onClick={onBuy} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 700,
            background: 'var(--success)', color: '#000',
            border: 'none', cursor: 'pointer', borderRadius: 4,
          }}>구매</button>
        </div>
      </div>

      {/* 본문: 스탯 + 접두사 */}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {a.itemStats && Object.keys(a.itemStats).length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3, fontWeight: 700 }}>아이템 스탯</div>
            <ItemStatsBlock stats={a.itemStats} enhanceLevel={el} quality={a.quality || 0} />
          </div>
        )}
        {a.prefixStats && Object.keys(a.prefixStats).length > 0 && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 3, fontWeight: 700 }}>접두사</div>
            <PrefixDisplay prefixStats={a.prefixStats} />
          </div>
        )}
        {a.itemDescription && (
          <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 6, fontStyle: 'italic' }}>
            {a.itemDescription}
          </div>
        )}
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

  return (
    <div>
      <div style={{ marginBottom: 12, color: 'var(--text-dim)', fontSize: 13 }}>판매할 아이템을 선택하세요 · 수수료 10% · 등록 기간 72시간</div>
      {/* 인벤토리 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, marginBottom: 16 }}>
        {inv.length === 0 && <div style={{ color: 'var(--text-dim)' }}>인벤토리 비어있음</div>}
        {inv.filter(s => !!s.item.slot).map(s => {
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
                  <div style={{ color: gradeClr, fontWeight: 700, fontSize: 12 }}>
                    {s.item.name}
                    {s.enhanceLevel > 0 && (
                      <span style={{
                        color: '#000', background: 'var(--accent)', padding: '0 4px',
                        borderRadius: 2, fontSize: 10, fontWeight: 900, marginLeft: 4,
                      }}>+{s.enhanceLevel}</span>
                    )}
                  </div>
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
            <div style={{ fontWeight: 700, color: GRADE_COLOR[sel.item.grade], fontSize: 15 }}>
              {sel.item.name}
              {sel.enhanceLevel > 0 && (
                <span style={{
                  color: '#000', background: 'var(--accent)', padding: '0 5px',
                  borderRadius: 2, fontSize: 11, fontWeight: 900, marginLeft: 6,
                }}>+{sel.enhanceLevel}</span>
              )}
            </div>
          </div>
          {sel.item.stats && (
            <div style={{ marginBottom: 6 }}>
              <ItemStatsBlock stats={sel.item.stats} enhanceLevel={sel.enhanceLevel || 0} />
            </div>
          )}
          {sel.prefixStats && Object.keys(sel.prefixStats).length > 0 && (
            <PrefixDisplay prefixStats={sel.prefixStats} />
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
