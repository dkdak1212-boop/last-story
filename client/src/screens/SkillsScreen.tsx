import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface Skill {
  id: number;
  name: string;
  description: string;
  cooldown: number;
  mpCost: number;
  learned: boolean;
  autoUse: boolean;
}

export function SkillsScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [skills, setSkills] = useState<Skill[]>([]);

  async function refresh() {
    if (!active) return;
    const data = await api<Skill[]>(`/characters/${active.id}/skills`);
    setSkills(data);
  }

  useEffect(() => {
    refresh();
  }, [active]);

  async function toggleAuto(skillId: number) {
    if (!active) return;
    await api(`/characters/${active.id}/skills/${skillId}/toggle-auto`, { method: 'POST' });
    refresh();
  }

  return (
    <div>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>스킬</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {skills.map((s) => (
          <div
            key={s.id}
            style={{
              padding: 14,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              opacity: s.learned ? 1 : 0.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{s.description}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
                쿨다운 {s.cooldown}s · MP {s.mpCost}
              </div>
            </div>
            {s.learned && (
              <button
                onClick={() => toggleAuto(s.id)}
                className={s.autoUse ? 'primary' : ''}
              >
                {s.autoUse ? '자동 ON' : '자동 OFF'}
              </button>
            )}
          </div>
        ))}
        {skills.length === 0 && <div style={{ color: 'var(--text-dim)' }}>스킬이 없다.</div>}
      </div>
    </div>
  );
}
