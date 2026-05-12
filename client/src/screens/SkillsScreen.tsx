import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';
import { confirmIfInCombat } from '../utils/combatGuard';
import { getSkillIcon } from './CombatScreen';

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
    if (!confirmIfInCombat('스킬 프리셋')) return;
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
    if (!confirmIfInCombat('스킬 자동 사용')) return;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--accent)' }}>스킬</h2>
        <div style={{ fontSize: 13, color: autoCount >= 7 ? 'var(--danger)' : 'var(--text-dim)' }}>
          전투 슬롯 <span style={{ fontWeight: 700, color: autoCount >= 7 ? 'var(--danger)' : 'var(--accent)' }}>{autoCount}</span>/7
        </div>
      </div>

      {/* 클래스 고유 시그니처 패시브 — 2026-05-13 재부착 (성직자·소환사 추가) */}
      <SignaturePassiveBox className={className} />

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
          // 스킬창 표시는 레벨순 — 전투창 슬롯 순서(slot_order)와 별개
          const sortedSkills = [...skills].sort((a, b) => a.requiredLevel - b.requiredLevel || a.id - b.id);
          return sortedSkills.map((s) => {
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
              src={getSkillIcon(s.name) || `/images/skills/${className}_${s.requiredLevel}.png`}
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

// 클래스별 시그니처 게이지/패시브 — 한글, 이모지 제외 (2026-05-13).
// 한 클래스가 여러 게이지 메커니즘을 가질 수 있어 entries[] 로 구성.
interface SignatureEntry { name: string; desc: string }
const SIGNATURE_BY_CLASS: Record<string, SignatureEntry[]> = {
  warrior: [
    {
      name: '분노 폭발',
      desc: '평타·스킬로 분노 누적. 게이지 100 도달 시 자동 발동 — 다음 3 행동 동안 모든 공격 데미지 3배. 폭발 후 분노 0으로 초기화.',
    },
  ],
  mage: [
    {
      name: '마나의 흐름',
      desc: '스킬 사용 시 마나 스택 +1 (최대 5). 5 스택 도달 시 5 행동 동안 — 모든 스킬 쿨다운 무시 + 속도 +100% (중첩 불가) + 모든 데미지 +50%. 버스트 중 스킬 사용은 스택 누적 안 함.',
    },
  ],
  rogue: [
    {
      name: '독의 공명',
      desc: '독·출혈 도트 부여 시 공명 게이지 +1 (최대 10). 10 도달 시 다음 공격에 공명 폭발 (도트 폭딜). 폭발 후 게이지 0 리셋.',
    },
  ],
  cleric: [
    {
      name: '광휘의 인장',
      desc: '공격 적중 시 광휘 스택 +1 (최대 3). 3 스택 도달 시 2 행동 동안 속도 +100%. 중첩 불가 — 효과 활성 중엔 스택 누적 X. 효과 종료 후 스택 0 리셋.',
    },
  ],
  summoner: [
    {
      name: '소환 폭주',
      desc: '60초마다 자동 발동. 발동 시 30초 동안 본체 스킬 쿨다운 −25%, 마공 +25%, 받는 피해 +25%. 활성 종료 후 30초 대기 → 재발동.',
    },
  ],
  archer: [
    {
      name: '혼의 화살',
      desc: '치명타 발동 시 차지 +1 (최대 5). 5 차지 도달 후 다음 데미지 스킬 사용 시 강제 치명타 + 데미지 6배 폭발. 사용 후 차지 0으로 초기화.',
    },
    {
      name: '사거리 스택',
      desc: '치명타 발동 시 사거리 스택 +1 (최대 20). 스택 한 개당 데미지 보너스 (노드 보너스 비례). 피격·사망 시 0으로 초기화.',
    },
    {
      name: '저격수의 호흡',
      desc: '연속 처치 시 치명타 확률 누적 (최대 5 연속). 연속 한 개당 치명타 확률 추가 (노드 보너스 비례). 피격·사망 시 누적치 회수.',
    },
  ],
};

function SignaturePassiveBox({ className }: { className: string }) {
  const entries = SIGNATURE_BY_CLASS[className];
  if (!entries || entries.length === 0) return null;
  return (
    <div style={{
      marginBottom: 16,
      padding: '12px 14px',
      background: 'linear-gradient(90deg, rgba(232,185,56,0.10), rgba(232,185,56,0.04))',
      border: '1px solid #c9a24d',
      borderLeft: '4px solid #e8b938',
      borderRadius: 4,
    }}>
      <div style={{ fontSize: 11, color: '#c9a24d', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>고유 패시브 / 게이지</div>
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: i < entries.length - 1 ? 10 : 0 }}>
          <div style={{ fontSize: 13, color: '#e8b938', fontWeight: 800, marginBottom: 3 }}>{e.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>{e.desc}</div>
        </div>
      ))}
    </div>
  );
}

