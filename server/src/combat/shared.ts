// 전투 공용 로직 — 필드 전투(engine.ts)와 레이드(worldEvent.ts)가 공유
// 목적: 도트(dot/poison) 계산식을 한 곳에서 관리해 양쪽 수치 일치.

export interface StatusEffect {
  id: string;
  type: string;
  value: number;
  remainingActions: number;
  source: 'player' | 'monster';
  // 장비/스탯 변경 시 재계산에 쓰이는 메타 (engine.ts refreshSessionStats 전용)
  dotMult?: number;
  dotUseMatk?: boolean;
  // 소환수 원소 태그 (fire/frost/lightning/earth/holy/dark) — 소환사 노드 효과 적용용
  element?: string;
  // 소환수 원본 스킬명 — 전투 화면 아이콘 표시용
  summonSkillName?: string;
  // 소환 고정 데미지 — 무기 없는 저레벨에서도 일정 데미지 보장 (예: 늑대 500)
  // processSummons 에서 matk×mult 결과에 더해진다 (스킬 row 의 flat_damage 값)
  summonFlatDamage?: number;
}

// 도트는 방어력의 50%만 무시 (= def × 0.5 × 0.5 = def × 0.25 차감)
export const DOT_DEF_IGNORE_PCT = 0.5;

export interface DotTickCtx {
  // 이미 armor_pierce / def_reduce_pct 등 적용된 최종 방어력
  defenderDef: number;
  // 공격자(도트 시전자) 쪽 증폭 — engine.ts 쪽과 동일한 합산식으로 계산해서 넘겨라
  dotAmpPct: number;
  // 방어자 쪽 저항 (플레이어가 맞을 때만 의미)
  dotResistPct: number;
}

// 순수 함수 — effects 배열을 변이하지 않는다. remainingActions 감소는 호출측에서.
export function calcDotTickDamage(
  effects: StatusEffect[],
  targetSide: 'player' | 'monster',
  ctx: DotTickCtx,
): { totalDamage: number; count: number } {
  const dots = effects.filter(e =>
    (e.type === 'dot' || e.type === 'poison') &&
    ((targetSide === 'monster' && e.source === 'player') || (targetSide === 'player' && e.source === 'monster')) &&
    e.remainingActions > 0
  );
  if (dots.length === 0) return { totalDamage: 0, count: 0 };

  // 방어 차감량: 방어 × 0.5 × (1 - 도트무시율)
  const defReduce = Math.round(ctx.defenderDef * 0.5 * (1 - DOT_DEF_IGNORE_PCT));

  let total = 0;
  for (const dot of dots) {
    let dmg = Math.round(dot.value);
    if (dmg <= 0) continue;
    if (targetSide === 'monster') {
      if (ctx.dotAmpPct > 0) dmg = Math.round(dmg * (1 + ctx.dotAmpPct / 100));
    } else {
      if (ctx.dotResistPct > 0) dmg = Math.round(dmg * (1 - ctx.dotResistPct / 100));
    }
    // 최소 데미지 보장 — 증폭된 도트 데미지의 10% 는 방어 무관 통과 (calcDamage 와 일관)
    // 페인 로드 등 도트 증폭이 고방어 적에게도 체감되도록.
    const minDmg = Math.max(1, Math.round(dmg * 0.10));
    dmg = Math.max(minDmg, dmg - defReduce);
    total += dmg;
  }
  return { totalDamage: total, count: dots.length };
}

// 도트 엔트리 생성 — engine/worldEvent 양쪽에서 써서 수치 일치 보장
export function buildDotEntry(params: {
  type: 'dot' | 'poison';
  attackerBase: number; // atk 또는 matk
  multiplier: number;   // 예: 출혈/도트 1.2, 독 1.5
  duration: number;     // remainingActions
  source: 'player' | 'monster';
  useMatk: boolean;
}): StatusEffect {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: params.type,
    value: Math.round(params.attackerBase * params.multiplier),
    remainingActions: params.duration,
    source: params.source,
    dotMult: params.multiplier,
    dotUseMatk: params.useMatk,
  };
}

// 효과 배열의 remainingActions 감소 + 만료 제거. 순수 X — 배열 새로 반환.
export function decrementEffects(effects: StatusEffect[]): StatusEffect[] {
  return effects
    .map(e => ({ ...e, remainingActions: e.remainingActions - 1 }))
    .filter(e => e.remainingActions > 0);
}
