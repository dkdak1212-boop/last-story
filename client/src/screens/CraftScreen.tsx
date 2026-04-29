import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCharacterStore } from '../stores/characterStore';

const GRADE_COLOR: Record<string, string> = { common: '#9a8b75', rare: '#5b8ecc', epic: '#b060cc', legendary: '#e08030' };
const STAT_LABEL: Record<string, string> = {
  // 기본 스탯
  str: '힘', dex: '민첩', int: '지능', vit: '체력', spd: '스피드', cri: '치명타 확률',
  accuracy: '명중', dodge: '회피',
  atk: '공격력', matk: '마법공격', def: '방어력', mdef: '마법방어', hp: 'HP',
  // 접두사 스타일 키 (% 단위)
  atk_pct: '공격력%', matk_pct: '마법공격%', hp_pct: '최대HP%', max_hp_pct: '최대HP%',
  crit_dmg_pct: '치명타 데미지%', def_pierce_pct: '방어 추가무시%',
  damage_taken_down_pct: '받는 피해 감소%', drop_rate_pct: '드랍률%',
  multi_hit_amp_pct: '다단 데미지%', miss_combo_pct: '빗누적%', evasion_burst_pct: '회피반격%',
  shield_amp: '실드 효과%',
  summon_amp: '소환수 데미지%', summon_double_hit: '소환 2회타격%', summon_max_extra: '최대 소환수+',
  lifesteal_pct: '흡혈%', dot_amp_pct: '도트 데미지%', exp_bonus_pct: '경험치%',
  gold_bonus_pct: '골드%', guardian_pct: '수호%', spd_pct: '속도증가%',
  first_strike_pct: '약점간파%', berserk_pct: '광폭%', ambush_pct: '기습%',
  predator_pct: '포식%', def_reduce_pct: '방어 감소%', hp_regen: 'HP 재생',
  slow_pct: '저주%', thorns_pct: '가시 반사%',
  execute_pct: '처형%', undispellable: '디스펠 면역',
  shield_on_low_hp: '저체력 자동실드%', reflect_skill: '스킬 반사%', def_convert_atk: '방어→공격%',
};

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
  const [openSets, setOpenSets] = useState<Set<number | string>>(new Set());

  useEffect(() => {
    api<Recipe[]>('/craft/recipes').then(setRecipes).catch(() => {});
    api<SetInfo[]>('/craft/sets').then(setSets).catch(() => {});
  }, []);

  function toggleOpen(key: number | string) {
    setOpenSets(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

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
  const standalone: Recipe[] = [];
  for (const r of recipes) {
    if (r.setId) {
      if (!grouped.has(r.setId)) {
        const s = sets.find(s => s.id === r.setId);
        if (s) grouped.set(r.setId, { set: s, recipes: [] });
      }
      grouped.get(r.setId)?.recipes.push(r);
    } else {
      standalone.push(r);
    }
  }

  return (
    <div>
      <h2 style={{ color: 'var(--accent)', marginBottom: 16 }}>제작</h2>

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

      {/* 일반 제작 (비세트) */}
      {standalone.length > 0 && (
        <div style={{ marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(100,140,220,0.3)', background: 'linear-gradient(135deg, rgba(100,140,220,0.04) 0%, rgba(100,140,220,0.02) 100%)' }}>
          <button onClick={() => toggleOpen('etc')} style={{
            width: '100%', padding: '14px 16px', background: 'transparent', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#7ba4e0' }}>일반 제작</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{openSets.has('etc') ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {openSets.has('etc') && (
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {standalone.map(r => <RecipeCard key={r.id} r={r} onCraft={craft} busy={busy} />)}
            </div>
          )}
        </div>
      )}

      {/* 세트 제작 */}
      {[...grouped.values()].map(({ set, recipes: recs }) => {
        const isOpen = openSets.has(set.id);
        return (
          <div key={set.id} style={{
            marginBottom: 16, borderRadius: 8, overflow: 'hidden',
            border: '1px solid rgba(224,128,48,0.3)',
            background: 'linear-gradient(135deg, rgba(224,128,48,0.04) 0%, rgba(201,162,77,0.02) 100%)',
          }}>
            {/* 접이식 헤더 */}
            <button onClick={() => toggleOpen(set.id)} style={{
              width: '100%', padding: '14px 16px', background: 'transparent', border: 'none',
              borderBottom: isOpen ? '1px solid rgba(224,128,48,0.2)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left',
            }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#e08030' }}>{set.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 10 }}>{set.bossName}</span>
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{isOpen ? '접기 ▲' : '펼치기 ▼'}</span>
            </button>

            {isOpen && (
              <>
                {/* 세트 효과 */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(224,128,48,0.1)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <SetBonusLine count={2} bonus={set.bonus2} />
                    <SetBonusLine count={4} bonus={set.bonus4} />
                    <SetBonusLine count={6} bonus={set.bonus6} />
                  </div>
                </div>

                {/* 레시피 */}
                <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {recs.map(r => <RecipeCard key={r.id} r={r} onCraft={craft} busy={busy} isSet />)}
                </div>
              </>
            )}
          </div>
        );
      })}

      {recipes.length === 0 && <div style={{ color: 'var(--text-dim)' }}>레시피가 없습니다.</div>}
    </div>
  );
}

function RecipeCard({ r, onCraft, busy, isSet }: { r: Recipe; onCraft: (id: number) => void; busy: boolean; isSet?: boolean }) {
  return (
    <div style={{
      padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>{r.name}</div>
        <button className="primary" onClick={() => onCraft(r.id)} disabled={busy}
          style={{ padding: '6px 18px', fontWeight: 700 }}>제작</button>
      </div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: 'var(--text-dim)' }}>재료: </span>
        <span style={{ color: GRADE_COLOR[r.materialGrade], fontWeight: 700 }}>{r.materialName}</span>
        <span style={{ color: 'var(--accent)' }}> ×{r.materialQty}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        <span>결과: </span>
        {r.resultItems.map((item, i) => (
          <span key={item.id}>
            {i > 0 && ' / '}
            <span style={{ color: GRADE_COLOR[item.grade], fontWeight: 600 }}>{item.name}</span>
          </span>
        ))}
      </div>
      {isSet && (
        <div style={{ fontSize: 11, color: '#66ccff', marginTop: 4 }}>
          제작 시 3옵 접두사 자동 부여 (2~4티어)
        </div>
      )}
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
