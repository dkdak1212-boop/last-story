import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { Item } from '../types';
import { GRADE_COLOR, GRADE_LABEL, ItemStatsInline } from '../components/ui/ItemStats';

interface ShopEntry {
  item: Item;
  price: number;
}
interface PremiumItem { code: string; name: string; description: string; priceKrw: number; requireCharacter?: boolean }
interface PremiumStatus {
  expBoostUntil: string | null;
  goldBoostUntil: string | null;
  dropBoostUntil: string | null;
}

export function ShopScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [shop, setShop] = useState<ShopEntry[]>([]);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState('');
  const [premiumItems, setPremiumItems] = useState<PremiumItem[]>([]);
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus | null>(null);

  async function refresh() {
    const data = await api<ShopEntry[]>('/shop');
    setShop(data);
    // 프리미엄 아이템 + 상태
    try {
      const items = await api<PremiumItem[]>('/premium/shop');
      setPremiumItems(items);
      if (active) {
        const status = await api<PremiumStatus>(`/premium/status/${active.id}`);
        setPremiumStatus(status);
      }
    } catch {}
  }

  useEffect(() => {
    refresh();
  }, [active?.id]);

  async function buyPremium(code: string) {
    if (!active) return;
    setMsg('');
    try {
      await api('/premium/purchase', { method: 'POST', body: JSON.stringify({ code, characterId: active.id }) });
      setMsg('구매 완료!');
      await refreshActive();
      await refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  function fmtUntil(iso: string | null) {
    if (!iso) return '미활성';
    const d = new Date(iso);
    if (d < new Date()) return '만료';
    const diff = d.getTime() - Date.now();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}시간 ${m}분`;
  }

  function getQty(itemId: number) {
    return qty[itemId] ?? 1;
  }
  function setItemQty(itemId: number, v: number) {
    const clamped = Math.max(1, Math.min(99, Math.floor(v) || 1));
    setQty((q) => ({ ...q, [itemId]: clamped }));
  }

  async function buy(itemId: number) {
    if (!active) return;
    setMsg('');
    const quantity = getQty(itemId);
    try {
      await api(`/characters/${active.id}/shop/buy`, {
        method: 'POST',
        body: JSON.stringify({ itemId, quantity }),
      });
      const itemName = shop.find(s => s.item.id === itemId)?.item.name || '';
      setMsg(`${itemName} ${quantity}개 구매했습니다!`);
      refreshActive();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '구매 실패');
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 6, color: 'var(--accent)' }}>상점</h2>
      <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>소모품 · 부스터 · 특수 아이템</p>
      {msg && <div style={{ color: msg.includes('구매') || msg.includes('완료') ? 'var(--success)' : 'var(--danger)', marginBottom: 12, fontWeight: 700, fontSize: 14 }}>{msg}</div>}

      {/* 프리미엄 아이템 섹션 */}
      {premiumItems.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ color: 'var(--accent)', fontSize: 14, marginBottom: 8 }}>특수 아이템 (테스트 무료)</h3>
          {premiumStatus && (
            <div style={{ padding: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 10, fontSize: 11, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div>경험치 부스트: <b style={{ color: fmtUntil(premiumStatus.expBoostUntil).includes('미활성') || fmtUntil(premiumStatus.expBoostUntil).includes('만료') ? 'var(--text-dim)' : 'var(--success)' }}>{fmtUntil(premiumStatus.expBoostUntil)}</b></div>
              <div>골드 부스트: <b style={{ color: fmtUntil(premiumStatus.goldBoostUntil).includes('미활성') || fmtUntil(premiumStatus.goldBoostUntil).includes('만료') ? 'var(--text-dim)' : '#e0a040' }}>{fmtUntil(premiumStatus.goldBoostUntil)}</b></div>
              <div>드롭 부스트: <b style={{ color: fmtUntil(premiumStatus.dropBoostUntil).includes('미활성') || fmtUntil(premiumStatus.dropBoostUntil).includes('만료') ? 'var(--text-dim)' : '#b060cc' }}>{fmtUntil(premiumStatus.dropBoostUntil)}</b></div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {premiumItems.map(item => (
              <div key={item.code} style={{
                padding: 12, background: 'var(--bg-panel)', border: '1px solid #66ccff40', borderRadius: 4,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#66ccff', fontSize: 13 }}>{item.name}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>{item.description}</div>
                </div>
                <button className="primary" onClick={() => buyPremium(item.code)} style={{ fontSize: 12, padding: '6px 14px' }}>
                  무료 구매
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ color: 'var(--accent)', fontSize: 14, marginBottom: 8 }}>일반 상점</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shop.map((e) => (
          <div
            key={e.item.id}
            className="shop-item-row"
            style={{
              padding: 14,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ flex: 1 }}>
              <div>
                <span style={{ color: GRADE_COLOR[e.item.grade], fontWeight: 700 }}>{e.item.name}</span>
                <span style={{ marginLeft: 8, fontSize: 10, color: GRADE_COLOR[e.item.grade] }}>[{GRADE_LABEL[e.item.grade]}]</span>
              </div>
              {e.item.stats && <div style={{ marginTop: 2 }}><ItemStatsInline stats={e.item.stats} /></div>}
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2, fontStyle: 'italic' }}>{e.item.description}</div>
            </div>
            <div className="shop-item-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ color: 'var(--accent)', minWidth: 60, textAlign: 'right' }}>
                {(e.price * getQty(e.item.id)).toLocaleString()}G
              </div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)' }}>
                <button
                  onClick={() => setItemQty(e.item.id, getQty(e.item.id) - 1)}
                  style={{ padding: '4px 10px', border: 'none' }}
                >−</button>
                <input
                  type="number" min="1" max="99" value={getQty(e.item.id)}
                  onChange={(ev) => setItemQty(e.item.id, Number(ev.target.value))}
                  style={{ width: 48, textAlign: 'center', border: 'none', padding: '4px' }}
                />
                <button
                  onClick={() => setItemQty(e.item.id, getQty(e.item.id) + 1)}
                  style={{ padding: '4px 10px', border: 'none' }}
                >+</button>
              </div>
              <button className="primary" onClick={() => buy(e.item.id)}>
                구매
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
