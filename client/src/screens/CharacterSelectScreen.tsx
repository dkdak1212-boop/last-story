import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../stores/characterStore';
import { ClassIcon } from '../components/ui/ClassIcon';
import type { ClassName } from '../types';

const CLASSES: { name: ClassName; label: string; desc: string }[] = [
  { name: 'warrior', label: '전사', desc: '압도적 물리, 흡혈 지속전투' },
  { name: 'mage', label: '마법사', desc: '원소 파괴 + 게이지 조작 제어' },
  { name: 'cleric', label: '성직자', desc: '보조/공격 양면, 신성 실드와 심판' },
  { name: 'rogue', label: '도적', desc: '스피드와 제어, 독 스택 연속행동' },
];

export function CharacterSelectScreen() {
  const nav = useNavigate();
  const { characters, fetchCharacters, selectCharacter, createCharacter, deleteCharacter } = useCharacterStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pickedClass, setPickedClass] = useState<ClassName>('warrior');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleDelete(id: number, charName: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (busy) return;
    if (!confirm(`정말로 "${charName}" 캐릭터를 삭제하시겠습니까?\n\n레벨, 아이템, 골드, 진행도 등 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.`)) return;
    setBusy(true);
    try {
      await deleteCharacter(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetchCharacters().catch(() => {});
  }, [fetchCharacters]);

  async function handleCreate() {
    setError('');
    try {
      const c = await createCharacter(name, pickedClass);
      await selectCharacter(c.id);
      nav('/village');
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패');
    }
  }

  async function handleSelect(id: number) {
    await selectCharacter(id);
    nav('/village');
  }

  if (creating || characters.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: 20 }}>캐릭터 생성</h2>
        <input
          placeholder="캐릭터 이름 (2~12자)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={12}
          style={{ width: '100%', marginBottom: 20 }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
          {CLASSES.map((c) => (
            <div
              key={c.name}
              onClick={() => setPickedClass(c.name)}
              style={{
                padding: 14,
                background: pickedClass === c.name ? 'var(--bg-elev)' : 'var(--bg-panel)',
                border: `1px solid ${pickedClass === c.name ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClassIcon className={c.name} size={20} />
                {c.label}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{c.desc}</div>
            </div>
          ))}
        </div>
        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="primary" onClick={handleCreate} disabled={name.length < 2}>
            생성
          </button>
          {characters.length > 0 && <button onClick={() => setCreating(false)}>취소</button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>캐릭터 선택</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {characters.map((c) => (
          <div
            key={c.id}
            onClick={() => handleSelect(c.id)}
            style={{
              padding: 14,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <ClassIcon className={c.className as ClassName} size={28} />
              <div>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.name}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                  Lv.{c.level} {c.className}
                </div>
              </div>
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              {c.gold}G
            </div>
            <button
              onClick={(e) => handleDelete(c.id, c.name, e)}
              disabled={busy}
              style={{
                padding: '5px 10px', fontSize: 11, fontWeight: 700,
                background: 'transparent', color: 'var(--danger)',
                border: '1px solid var(--danger)', cursor: 'pointer', borderRadius: 3,
              }}
            >삭제</button>
          </div>
        ))}
      </div>
      <button style={{ marginTop: 20 }} onClick={() => setCreating(true)}>
        새 캐릭터 만들기
      </button>
    </div>
  );
}
