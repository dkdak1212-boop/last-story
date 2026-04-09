import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface PremiumItem { code: string; name: string; description: string; priceKrw: number; requireCharacter?: boolean }
interface PremiumStatus {
  expBoostUntil: string | null;
  goldBoostUntil: string | null;
  dropBoostUntil: string | null;
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

  async function buy(code: string) {
    if (!active) return;
    setMsg('');
    try {
      await api('/premium/purchase', {
        method: 'POST',
        body: JSON.stringify({ code, characterId: active.id }),
      });
      setMsg('구매 완료!');
      await refreshActive();
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : '실패'); }
  }

  const fmtUntil = (iso: string | null) => {
    if (!iso) return '미활성';
    const d = new Date(iso);
    if (d < new Date()) return '만료';
    const diff = d.getTime() - Date.now();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}시간 ${m}분 남음`;
  };

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 6 }}>프리미엄 상점</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
        테스트 기간 — 모든 아이템 무료 · 반복 구매 가능
      </p>

      {status && (
        <div style={{ padding: 12, background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: 16, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>경험치 부스트: </span>
            <span style={{ color: fmtUntil(status.expBoostUntil) === '미활성' || fmtUntil(status.expBoostUntil) === '만료' ? 'var(--text-dim)' : 'var(--success)', fontWeight: 700 }}>
              {fmtUntil(status.expBoostUntil)}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>골드 부스트: </span>
            <span style={{ color: fmtUntil(status.goldBoostUntil) === '미활성' || fmtUntil(status.goldBoostUntil) === '만료' ? 'var(--text-dim)' : '#e0a040', fontWeight: 700 }}>
              {fmtUntil(status.goldBoostUntil)}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>드롭 부스트: </span>
            <span style={{ color: fmtUntil(status.dropBoostUntil) === '미활성' || fmtUntil(status.dropBoostUntil) === '만료' ? 'var(--text-dim)' : '#b060cc', fontWeight: 700 }}>
              {fmtUntil(status.dropBoostUntil)}
            </span>
          </div>
        </div>
      )}

      {msg && <div style={{ color: 'var(--success)', marginBottom: 12, fontSize: 13, fontWeight: 700 }}>{msg}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.code} style={{
            padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{item.name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{item.description}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: 'var(--success)', fontWeight: 700 }}>{item.priceKrw === 0 ? '무료' : `₩${item.priceKrw.toLocaleString()}`}</div>
              <button className="primary" onClick={() => buy(item.code)}>구매</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
