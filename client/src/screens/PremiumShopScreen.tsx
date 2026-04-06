import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface PremiumItem { code: string; name: string; description: string; priceKrw: number; requireCharacter?: boolean }
interface PremiumStatus {
  premiumUntil: string | null;
  maxCharacterSlots: number;
  inventorySlotsBonus: number;
  expBoostUntil: string | null;
}

export function PremiumShopScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [items, setItems] = useState<PremiumItem[]>([]);
  const [status, setStatus] = useState<PremiumStatus | null>(null);
  const [msg, setMsg] = useState('');

  async function load() {
    if (!active) return;
    setItems(await api<PremiumItem[]>('/premium/shop'));
    setStatus(await api<PremiumStatus>(`/premium/status/${active.id}`));
  }
  useEffect(() => { load(); }, [active?.id]);

  async function buy(code: string, requireChar?: boolean) {
    if (!active) return;
    setMsg('');
    try {
      await api('/premium/purchase', {
        method: 'POST',
        body: JSON.stringify({ code, characterId: requireChar ? active.id : undefined }),
      });
      setMsg('구매 완료! 효과가 적용되었습니다.');
      await refreshActive();
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  const activeUntil = (iso: string | null) => {
    if (!iso) return '미활성';
    const d = new Date(iso);
    if (d < new Date()) return '만료';
    return d.toLocaleDateString('ko-KR') + '까지';
  };

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 6 }}>프리미엄 상점</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
        (테스트 빌드 — 실제 결제 없이 버튼 클릭 시 즉시 적용)
      </p>

      {status && (
        <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 16, fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text-dim)' }}>오프라인 100%:</span> {activeUntil(status.premiumUntil)}</div>
          <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text-dim)' }}>경험치 부스트:</span> {activeUntil(status.expBoostUntil)}</div>
          <div><span style={{ color: 'var(--text-dim)' }}>추가 인벤 슬롯:</span> +{status.inventorySlotsBonus}</div>
        </div>
      )}

      {msg && <div style={{ color: 'var(--accent)', marginBottom: 12, fontSize: 13 }}>{msg}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.code} style={{
            padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{item.name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>{item.description}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: 'var(--success)', fontWeight: 700 }}>{item.priceKrw === 0 ? '무료' : `₩${item.priceKrw.toLocaleString()}`}</div>
              <button className="primary" onClick={() => buy(item.code, item.requireCharacter)}>구매</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
