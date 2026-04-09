import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { Item } from '../types';
import { GRADE_COLOR, GRADE_LABEL, ItemStatsInline } from '../components/ui/ItemStats';

interface ShopEntry {
  item: Item;
  price: number;
}

export function ShopScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [shop, setShop] = useState<ShopEntry[]>([]);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [msg, setMsg] = useState('');

  async function refresh() {
    const data = await api<ShopEntry[]>('/shop');
    setShop(data);
  }

  useEffect(() => {
    refresh();
  }, []);

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
      <p style={{ color: 'var(--text-dim)', marginBottom: 20 }}>소모품을 취급한다.</p>
      {msg && <div style={{ color: msg.includes('구매했습니다') ? 'var(--success)' : 'var(--danger)', marginBottom: 12, fontWeight: 700, fontSize: 14 }}>{msg}</div>}
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
