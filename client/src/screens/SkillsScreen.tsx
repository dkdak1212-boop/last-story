import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

interface Skill {
  id: number;
  name: string;
  description: string;
  cooldown: number;
  mpCost: number;
  requiredLevel: number;
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

  const className = active?.className || 'warrior';

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
              opacity: s.learned ? 1 : 0.4,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <img
              src={`/images/skills/${className}_${s.requiredLevel}.png`}
              alt={s.name}
              width={40}
              height={40}
              style={{ imageRendering: 'pixelated', flexShrink: 0, border: '1px solid var(--border)', background: 'var(--bg)' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {s.name}
                <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>Lv.{s.requiredLevel}</span>
              </div>
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
