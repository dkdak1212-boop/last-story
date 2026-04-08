import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

const GRADE_COLOR: Record<string, string> = { common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030' };
const STAT_LABEL: Record<string, string> = { str: '힘', dex: '민첩', int: '지능', vit: '체력', spd: '속도', cri: '치명' };

interface Recipe {
  id: number; name: string;
  materialItemId: number; materialName: string; materialGrade: string; materialQty: number;
  resultType: string;
  resultItems: { id: number; name: string; grade: string; slot: string | null }[];
  setId: number | null; setName: string | null; setDescription: string | null;
}

interface SetInfo {
  id: number; name: string; bossName: string;
  bonus2: Record<string, number>; bonus4: Record<string, number>; bonus6: Record<string, number>;
  description: string;
}

export function CraftScreen() {
  const active = useCharacterStore((s) => s.activeCharacter);
  const refreshActive = useCharacterStore((s) => s.refreshActive);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<{ itemName: string; prefixCount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Recipe[]>('/craft/recipes').then(setRecipes).catch(() => {});
    api<SetInfo[]>('/craft/sets').then(setSets).catch(() => {});
  }, []);

  async function craft(recipeId: number) {
    if (!active || busy) return;
    setBusy(true); setMsg(''); setResult(null);
    try {
      const r = await api<{ itemName: string; prefixCount: number; message: string }>(
        '/craft/craft', { method: 'POST', body: JSON.stringify({ characterId: active.id, recipeId }) }
      );
      setResult({ itemName: r.itemName, prefixCount: r.prefixCount });
      setMsg(r.message);
      await refreshActive();
    } catch (e) { setMsg(e instanceof Error ? e.message : '제작 실패'); }
    finally { setBusy(false); }
  }

  // 세트별 그룹핑
  const grouped = new Map<number, { set: SetInfo; recipes: Recipe[] }>();
  for (const r of recipes) {
    if (!r.setId) continue;
    if (!grouped.has(r.setId)) {
      const s = sets.find(s => s.id === r.setId);
      if (s) grouped.set(r.setId, { set: s, recipes: [] });
    }
    grouped.get(r.setId)?.recipes.push(r);
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>세트 아이템 제작</h2>

      {msg && (
        <div style={{
          padding: 12, marginBottom: 14, fontSize: 13, borderRadius: 6,
          background: result ? 'rgba(107,163,104,0.15)' : 'rgba(192,90,74,0.15)',
          border: `1px solid ${result ? 'var(--success)' : 'var(--danger)'}`,
          color: result ? 'var(--success)' : 'var(--danger)', fontWeight: 700, textAlign: 'center',
        }}>
          {msg}
        </div>
      )}

      {[...grouped.values()].map(({ set, recipes: recs }) => (
        <div key={set.id} style={{
          marginBottom: 20, borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(224,128,48,0.3)',
          background: 'linear-gradient(135deg, rgba(224,128,48,0.04) 0%, rgba(201,162,77,0.02) 100%)',
        }}>
          {/* 세트 헤더 */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(224,128,48,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#e08030' }}>{set.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 10 }}>{set.bossName}</span>
              </div>
            </div>
            {/* 세트 효과 */}
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <SetBonusLine count={2} bonus={set.bonus2} />
              <SetBonusLine count={4} bonus={set.bonus4} />
              <SetBonusLine count={6} bonus={set.bonus6} />
            </div>
          </div>

          {/* 레시피 목록 */}
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recs.map(r => (
              <div key={r.id} style={{
                padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>{r.name}</div>
                  <button
                    className="primary" onClick={() => craft(r.id)} disabled={busy}
                    style={{ padding: '6px 18px', fontWeight: 700 }}
                  >제작</button>
                </div>
                {/* 재료 */}
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-dim)' }}>재료: </span>
                  <span style={{ color: GRADE_COLOR[r.materialGrade], fontWeight: 700 }}>{r.materialName}</span>
                  <span style={{ color: 'var(--accent)' }}> ×{r.materialQty}</span>
                </div>
                {/* 결과 아이템 */}
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  <span>결과 (랜덤): </span>
                  {r.resultItems.map((item, i) => (
                    <span key={item.id}>
                      {i > 0 && ' / '}
                      <span style={{ color: GRADE_COLOR[item.grade], fontWeight: 600 }}>{item.name}</span>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#66ccff', marginTop: 4 }}>
                  제작 시 3옵 접두사 자동 부여 (2~4티어)
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {recipes.length === 0 && <div style={{ color: 'var(--text-dim)' }}>레시피가 없습니다.</div>}
    </div>
  );
}

function SetBonusLine({ count, bonus }: { count: number; bonus: Record<string, number> }) {
  const entries = Object.entries(bonus).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontWeight: 700, fontSize: 11, padding: '1px 8px', borderRadius: 3,
        background: count === 6 ? 'rgba(224,128,48,0.2)' : count === 4 ? 'rgba(176,96,204,0.15)' : 'rgba(100,140,220,0.15)',
        color: count === 6 ? '#e08030' : count === 4 ? '#b060cc' : '#7ba4e0',
        border: `1px solid ${count === 6 ? '#e08030' : count === 4 ? '#b060cc' : '#7ba4e0'}44`,
      }}>
        {count}세트
      </span>
      <span style={{ color: 'var(--text-dim)' }}>
        {entries.map(([k, v]) => `${STAT_LABEL[k] || k} +${v}`).join(', ')}
      </span>
    </div>
  );
}
