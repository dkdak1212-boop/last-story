import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { useNavigate } from 'react-router-dom';

interface ShopItem {
  id: number;
  section: 'large' | 'medium' | 'small' | 'guild';
  name: string;
  description: string;
  price: number;
  limitScope: 'daily' | 'weekly' | 'monthly' | 'account_total' | null;
  limitCount: number;
  purchased: number;
  remaining: number; // -1 = 무제한
  leaderOnly: boolean;
  canBuy: boolean;
}

interface ShopState {
  medals: number;
  isLeader: boolean;
  items: ShopItem[];
}

const SECTION_LABEL: Record<ShopItem['section'], string> = {
  large: '대형',
  medium: '중형',
  small: '소형',
  guild: '길드 단위',
};

const SECTION_COLOR: Record<ShopItem['section'], string> = {
  large: '#daa520',
  medium: '#c0c0c0',
  small: '#cd7f32',
  guild: '#6a8fff',
};

function scopeLabel(scope: ShopItem['limitScope'], count: number): string {
  if (!scope || count <= 0) return '무제한';
  switch (scope) {
    case 'daily': return `일 ${count}회`;
    case 'weekly': return `주 ${count}회`;
    case 'monthly': return `월 ${count}회`;
    case 'account_total': return `계정 ${count}회`;
  }
  return '';
}

export function GuildBossShopScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const navigate = useNavigate();
  const [state, setState] = useState<ShopState | null>(null);
  const [loading, setLoading] = useState(false);
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<ShopItem['section']>('large');

  const loadShop = async () => {
    if (!active) return;
    setLoading(true);
    try {
      const data = await api<ShopState>(`/guild-boss-shop/${active.id}/list`);
      setState(data);
    } catch (e: any) {
      setMsg(typeof e?.message === 'string' ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const buy = async (item: ShopItem) => {
    if (!active || buyingId) return;
    if (!confirm(`${item.name} 구매하시겠습니까? (메달 ${item.price} 소모)`)) return;
    setBuyingId(item.id);
    setMsg(null);
    try {
      const r = await api<{ itemName: string; rewards: string[]; medalsLeft: number }>(
        `/guild-boss-shop/${active.id}/buy`,
        { method: 'POST', body: JSON.stringify({ itemId: item.id }) }
      );
      setMsg(`${r.itemName} 구매 완료 — ${r.rewards.join(', ')}`);
      await loadShop();
    } catch (e: any) {
      setMsg(typeof e?.message === 'string' ? e.message : 'buy failed');
    } finally {
      setBuyingId(null);
    }
  };

  if (!active) return <div style={{ padding: 20, color: '#aaa' }}>캐릭터를 선택해주세요.</div>;
  if (loading || !state) return <div style={{ padding: 20, color: '#aaa' }}>로딩 중…</div>;

  const filteredItems = state.items.filter((it) => it.section === tab);

  return (
    <div style={{ padding: 20, maxWidth: 960, margin: '0 auto', color: '#ddd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <button onClick={() => navigate('/guild-boss')} style={{ padding: '6px 14px', background: '#2a2520', color: '#daa520', border: '1px solid #444', cursor: 'pointer', marginRight: 12 }}>← 돌아가기</button>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#daa520' }}>길드 보스 메달 상점</span>
        </div>
        <div style={{ padding: '8px 14px', background: '#1a1612', border: '1px solid #daa520', borderRadius: 4, fontSize: 15 }}>
          보유 메달: <span style={{ color: '#daa520', fontWeight: 700 }}>{state.medals.toLocaleString()}</span>
        </div>
      </div>

      {msg && (
        <div style={{ padding: 10, marginBottom: 12, background: '#1e2a1e', border: '1px solid #555', fontSize: 13 }}>
          {msg}
        </div>
      )}

      {/* 섹션 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['large', 'medium', 'small', 'guild'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            style={{
              padding: '8px 16px',
              background: tab === s ? SECTION_COLOR[s] : '#1a1612',
              color: tab === s ? '#000' : '#ccc',
              border: `1px solid ${SECTION_COLOR[s]}`,
              cursor: 'pointer',
              fontWeight: tab === s ? 700 : 400,
              fontSize: 13,
            }}
          >
            {SECTION_LABEL[s]}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#777', background: '#1a1612', border: '1px solid #333' }}>
          이 섹션에 표시할 상품이 없습니다.
        </div>
      )}

      {/* 상품 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filteredItems.map((it) => {
          const limitText = scopeLabel(it.limitScope, it.limitCount);
          const remainingText = it.limitCount > 0 ? `남은 횟수: ${it.remaining} / ${it.limitCount}` : '구매 제한 없음';
          const leaderBlock = it.leaderOnly && !state.isLeader;
          const notEnoughMedals = state.medals < it.price;
          return (
            <div
              key={it.id}
              style={{
                padding: 14,
                background: '#1a1612',
                border: `1px solid ${SECTION_COLOR[it.section]}`,
                opacity: it.remaining === 0 || leaderBlock ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: SECTION_COLOR[it.section] }}>{it.name}</div>
                {it.leaderOnly && <span style={{ fontSize: 10, color: '#6a8fff', border: '1px solid #6a8fff', padding: '1px 4px' }}>길드장</span>}
              </div>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10, minHeight: 32 }}>{it.description}</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>제한: {limitText}</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>{remainingText}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 15, color: '#daa520', fontWeight: 700 }}>메달 {it.price.toLocaleString()}</div>
                <button
                  onClick={() => buy(it)}
                  disabled={!it.canBuy || buyingId === it.id}
                  style={{
                    padding: '6px 14px',
                    background: it.canBuy ? '#daa520' : '#333',
                    color: it.canBuy ? '#000' : '#777',
                    border: 'none',
                    cursor: it.canBuy ? 'pointer' : 'not-allowed',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {buyingId === it.id ? '구매 중…' :
                   leaderBlock ? '길드장만' :
                   it.remaining === 0 ? '구매 제한' :
                   notEnoughMedals ? '메달 부족' : '구매'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
