import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import type { Field } from '../types';

export function MapScreen() {
  const nav = useNavigate();
  const [fields, setFields] = useState<Field[]>([]);
  const active = useCharacterStore((s) => s.activeCharacter);

  useEffect(() => {
    api<Field[]>('/fields').then(setFields).catch(() => {});
  }, []);

  async function enter(fieldId: number) {
    if (!active) return;
    await api(`/characters/${active.id}/enter-field`, {
      method: 'POST',
      body: JSON.stringify({ fieldId }),
    });
    nav('/combat');
  }

  return (
    <div>
      <h2 style={{ marginBottom: 6, color: 'var(--accent)' }}>지도</h2>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
        떠날 구역을 고르라.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fields.map((f) => {
          const locked = (active?.level ?? 1) < f.requiredLevel;
          return (
            <div
              key={f.id}
              style={{
                padding: 14,
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                opacity: locked ? 0.5 : 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{f.name}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                  권장 레벨 {f.requiredLevel} · {f.description}
                </div>
              </div>
              <button className="primary" onClick={() => enter(f.id)} disabled={locked}>
                {locked ? '잠김' : '입장'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
