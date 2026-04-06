import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useCharacterStore } from '../stores/characterStore';

const DESTINATIONS = [
  { to: '/map', label: '지도', desc: '필드로 떠난다' },
  { to: '/world-event', label: '월드 이벤트', desc: '서버 전체 레이드 보스에 도전한다' },
  { to: '/shop', label: '상점', desc: '소모품을 구매한다' },
  { to: '/inventory', label: '인벤토리', desc: '아이템과 장비를 확인한다' },
  { to: '/skills', label: '스킬', desc: '익힌 기술을 본다' },
];

export function VillageScreen() {
  const refresh = useCharacterStore((s) => s.refreshActive);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return (
    <div>
      <h2 style={{ marginBottom: 6, color: 'var(--accent)' }}>마을</h2>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
        작은 성벽 도시. 모험가들이 오가며 하루를 마감한다.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {DESTINATIONS.map((d) => (
          <Link
            key={d.to}
            to={d.to}
            style={{
              padding: 18,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              textDecoration: 'none',
              color: 'var(--text)',
              display: 'block',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>{d.label}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{d.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
