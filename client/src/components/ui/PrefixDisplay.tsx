// 아이템 접두사 — 효과 설명 표시

const EFFECT_FORMATS: Record<string, (v: number) => string> = {
  // 기본 스탯
  str: v => `힘 +${v}`,
  dex: v => `민첩 +${v}`,
  int: v => `지능 +${v}`,
  vit: v => `체력 +${v}`,
  spd: v => `속도 +${v}`,
  cri: v => `치명타 +${v}%`,
  accuracy: v => `명중 +${v}`,
  dodge: v => `회피 +${v}`,
  // 신규 특수 효과
  def_reduce_pct: v => `몬스터 방어력 ${v}% 감소`,
  slow_pct: v => `몬스터 속도 ${v}% 감소`,
  dot_amp_pct: v => `도트 데미지 ${v}% 증가`,
  hp_regen: v => `틱당 HP ${v} 회복`,
  lifesteal_pct: v => `데미지 흡혈 ${(v / 10).toFixed(1)}%`,
  gold_bonus_pct: v => `골드 획득 ${v}% 증가`,
  exp_bonus_pct: v => `경험치 획득 ${v}% 증가`,
  crit_dmg_pct: v => `크리 데미지 ${v}% 증가`,
};

interface Props {
  prefixStats: Record<string, number> | undefined | null;
}

export function PrefixDisplay({ prefixStats }: Props) {
  if (!prefixStats || Object.keys(prefixStats).length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, marginTop: 4 }}>
      {Object.entries(prefixStats).map(([key, val]) => {
        const fmt = EFFECT_FORMATS[key];
        const text = fmt ? fmt(val) : `${key} +${val}`;
        // 기본 스탯은 골드색, 특수 효과는 하늘색
        const isSpecial = ['def_reduce_pct', 'slow_pct', 'dot_amp_pct', 'hp_regen', 'lifesteal_pct', 'gold_bonus_pct', 'exp_bonus_pct', 'crit_dmg_pct'].includes(key);
        return (
          <span key={key} style={{ color: isSpecial ? '#66ccff' : '#e0a040', fontWeight: 600 }}>
            {isSpecial ? '◆ ' : ''}{text}
          </span>
        );
      })}
    </div>
  );
}
