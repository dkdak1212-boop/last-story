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

  const [msg, setMsg] = useState('');

  const [toggling, setToggling] = useState(false);
  async function toggleAuto(skillId: number, skillName: string, currentState: boolean) {
    if (!active || toggling) return;
    setMsg('');
    setToggling(true);
    try {
      await api(`/characters/${active.id}/skills/${skillId}/toggle-auto`, { method: 'POST' });
      await refresh();
      setMsg(`${skillName} → ${currentState ? 'OFF' : 'ON'}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '최대 6개까지 설정 가능');
    }
    setToggling(false);
  }

  const className = active?.className || 'warrior';
  const autoCount = skills.filter(s => s.learned && s.autoUse).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: 'var(--accent)' }}>스킬</h2>
        <div style={{ fontSize: 13, color: autoCount >= 6 ? 'var(--danger)' : 'var(--text-dim)' }}>
          전투 슬롯 <span style={{ fontWeight: 700, color: autoCount >= 6 ? 'var(--danger)' : 'var(--accent)' }}>{autoCount}</span>/6
        </div>
      </div>
      {msg && <div style={{ color: msg.includes('OFF') ? 'var(--danger)' : msg.includes('ON') ? 'var(--success)' : 'var(--danger)', fontSize: 13, marginBottom: 10, fontWeight: 700 }}>{msg}</div>}
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
                쿨다운 {s.cooldown}s
              </div>
            </div>
            {s.learned && (
              <button
                onClick={() => toggleAuto(s.id, s.name, s.autoUse)}
                disabled={toggling}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 700,
                  background: s.autoUse ? 'var(--success)' : 'transparent',
                  color: s.autoUse ? '#000' : 'var(--text-dim)',
                  border: `2px solid ${s.autoUse ? 'var(--success)' : 'var(--border)'}`,
                  cursor: toggling ? 'wait' : 'pointer',
                }}
              >
                {s.autoUse ? 'ON' : 'OFF'}
              </button>
            )}
          </div>
        ))}
        {skills.length === 0 && <div style={{ color: 'var(--text-dim)' }}>스킬이 없다.</div>}
      </div>
    </div>
  );
}
