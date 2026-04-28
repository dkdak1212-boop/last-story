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
  slotOrder: number;
}

interface SkillPreset {
  idx: number;
  name: string;
  skillIds: number[];
  empty: boolean;
}

export function SkillsScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [presets, setPresets] = useState<SkillPreset[]>([]);
  const [presetBusy, setPresetBusy] = useState(false);

  async function refresh() {
    if (!active) return;
    // 스킬은 필수, 프리셋은 실패해도 무시
    try {
      const data = await api<Skill[]>(`/characters/${active.id}/skills`);
      setSkills(data);
    } catch (e) {
      console.error('skills fetch failed', e);
    }
    try {
      const presetData = await api<SkillPreset[]>(`/characters/${active.id}/skill-presets`);
      setPresets(presetData);
    } catch (e) {
      console.error('presets fetch failed (마이그레이션 미적용 가능)', e);
      setPresets([1, 2, 3].map(idx => ({ idx, name: `프리셋 ${idx}`, skillIds: [], empty: true })));
    }
  }

  useEffect(() => {
    refresh();
  }, [active]);

  const [msg, setMsg] = useState('');

  async function savePreset(idx: number) {
    if (!active || presetBusy) return;
    setPresetBusy(true); setMsg('');
    try {
      const r = await api<{ savedCount: number; name: string }>(
        `/characters/${active.id}/skill-presets/${idx}/save`,
        { method: 'POST', body: JSON.stringify({ name: presets.find(p => p.idx === idx)?.name }) }
      );
      setMsg(`프리셋 ${idx} 저장 (${r.savedCount}개)`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장 실패');
    }
    setPresetBusy(false);
  }

  async function loadPreset(idx: number) {
    if (!active || presetBusy) return;
    setPresetBusy(true); setMsg('');
    try {
      const r = await api<{ loadedCount: number; name: string }>(
        `/characters/${active.id}/skill-presets/${idx}/load`, { method: 'POST' }
      );
      setMsg(`프리셋 ${idx} 적용 (${r.loadedCount}개)`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '불러오기 실패');
    }
    setPresetBusy(false);
  }

  async function renamePreset(idx: number) {
    if (!active || presetBusy) return;
    const cur = presets.find(p => p.idx === idx);
    const newName = prompt('프리셋 이름', cur?.name || `프리셋 ${idx}`);
    if (!newName || newName === cur?.name) return;
    setPresetBusy(true); setMsg('');
    try {
      await api(`/characters/${active.id}/skill-presets/${idx}/rename`, {
        method: 'POST', body: JSON.stringify({ name: newName }),
      });
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '이름변경 실패');
    }
    setPresetBusy(false);
  }

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
      setMsg(e instanceof Error ? e.message : '최대 7개까지 설정 가능');
    }
    setToggling(false);
  }

  // 드래그 reorder
  const [dragId, setDragId] = useState<number | null>(null);
  async function reorderSkills(orderedIds: number[]) {
    if (!active) return;
    try {
      await api(`/characters/${active.id}/skills/reorder`, {
        method: 'POST', body: JSON.stringify({ skillIds: orderedIds }),
      });
      await refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'reorder 실패'); }
  }
  function handleDragStart(id: number) { setDragId(id); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(targetId: number) {
    if (dragId === null || dragId === targetId) { setDragId(null); return; }
    const onSkills = skills.filter(s => s.learned && s.autoUse);
    const ids = onSkills.map(s => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    reorderSkills(ids);
  }

  const className = active?.className || 'warrior';
  const autoCount = skills.filter(s => s.learned && s.autoUse && s.cooldown > 0).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: 'var(--accent)' }}>스킬</h2>
        <div style={{ fontSize: 13, color: autoCount >= 7 ? 'var(--danger)' : 'var(--text-dim)' }}>
          전투 슬롯 <span style={{ fontWeight: 700, color: autoCount >= 7 ? 'var(--danger)' : 'var(--accent)' }}>{autoCount}</span>/7
        </div>
      </div>
      {msg && <div style={{ color: msg.includes('OFF') ? 'var(--danger)' : msg.includes('ON') || msg.includes('저장') || msg.includes('적용') ? 'var(--success)' : 'var(--danger)', fontSize: 13, marginBottom: 10, fontWeight: 700 }}>{msg}</div>}

      {/* 프리셋 슬롯 */}
      <div style={{ marginBottom: 14, padding: 10, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, fontWeight: 700 }}>스킬 프리셋</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {presets.map(p => (
            <div key={p.idx} style={{
              padding: 8, background: p.empty ? 'var(--bg)' : 'rgba(218,165,32,0.08)',
              border: `1px solid ${p.empty ? 'var(--border)' : 'rgba(218,165,32,0.4)'}`,
              borderRadius: 4,
            }}>
              <div
                onClick={() => renamePreset(p.idx)}
                style={{ fontSize: 12, fontWeight: 700, color: p.empty ? 'var(--text-dim)' : 'var(--accent)', cursor: 'pointer', marginBottom: 4 }}
                title="클릭하여 이름 변경"
              >
                {p.name} <span style={{ fontSize: 9, opacity: 0.5 }}>✎</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>
                {p.empty ? '비어있음' : `${p.skillIds.length}개 스킬`}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => savePreset(p.idx)} disabled={presetBusy} style={{
                  flex: 1, padding: '5px', fontSize: 10, fontWeight: 700,
                  background: 'var(--bg)', color: 'var(--accent)',
                  border: '1px solid var(--accent)', cursor: 'pointer', borderRadius: 3,
                }}>저장</button>
                <button onClick={() => loadPreset(p.idx)} disabled={presetBusy || p.empty} style={{
                  flex: 1, padding: '5px', fontSize: 10, fontWeight: 700,
                  background: p.empty ? 'transparent' : 'var(--success)',
                  color: p.empty ? 'var(--text-dim)' : '#000',
                  border: `1px solid ${p.empty ? 'var(--border)' : 'var(--success)'}`,
                  cursor: p.empty ? 'not-allowed' : 'pointer', borderRadius: 3,
                }}>불러오기</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(() => {
          const onSkills = skills.filter(s => s.learned && s.autoUse);
          const moveOnSkill = (skillId: number, delta: number) => {
            const ids = onSkills.map(s => s.id);
            const idx = ids.indexOf(skillId);
            const newIdx = idx + delta;
            if (idx < 0 || newIdx < 0 || newIdx >= ids.length) return;
            [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
            reorderSkills(ids);
          };
          return skills.map((s) => {
          const isOn = s.learned && s.autoUse;
          const draggable = isOn;
          const onIdx = isOn ? onSkills.findIndex(x => x.id === s.id) : -1;
          return (
          <div
            key={s.id}
            draggable={draggable}
            onDragStart={() => draggable && handleDragStart(s.id)}
            onDragOver={handleDragOver}
            onDrop={() => isOn && handleDrop(s.id)}
            style={{
              padding: 14,
              background: 'var(--bg-panel)',
              border: `1px solid ${dragId === s.id ? 'var(--accent)' : 'var(--border)'}`,
              opacity: s.learned ? 1 : 0.4,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              cursor: draggable ? 'grab' : 'default',
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
                {s.description.includes('자유행동') && (
                  <span style={{ color: '#88c8ff', fontWeight: 400, fontSize: 11, marginLeft: 8 }}>자유 행동</span>
                )}
                {s.cooldown === 0 && <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 8 }}>[기본기 — 슬롯 미차감]</span>}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                {s.description.replace(/\s*·\s*자유행동/g, '').replace(/\s*·\s*쿨\s*\d+\s*행동/g, '')}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
                쿨다운 {s.cooldown} 행동
              </div>
            </div>
            {isOn && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  onClick={() => moveOnSkill(s.id, -1)}
                  disabled={onIdx <= 0}
                  style={{ padding: '2px 8px', fontSize: 11, lineHeight: 1, background: 'var(--bg)', color: onIdx <= 0 ? 'var(--text-dim)' : 'var(--accent)', border: '1px solid var(--border)', cursor: onIdx <= 0 ? 'not-allowed' : 'pointer' }}
                  aria-label="위로"
                >▲</button>
                <button
                  onClick={() => moveOnSkill(s.id, 1)}
                  disabled={onIdx === onSkills.length - 1}
                  style={{ padding: '2px 8px', fontSize: 11, lineHeight: 1, background: 'var(--bg)', color: onIdx === onSkills.length - 1 ? 'var(--text-dim)' : 'var(--accent)', border: '1px solid var(--border)', cursor: onIdx === onSkills.length - 1 ? 'not-allowed' : 'pointer' }}
                  aria-label="아래로"
                >▼</button>
              </div>
            )}
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
        );
        });
        })()}
        {skills.length === 0 && <div style={{ color: 'var(--text-dim)' }}>스킬이 없다.</div>}
      </div>
    </div>
  );
}
