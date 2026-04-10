// 아이템 접두사 — 효과 설명 표시

const EFFECT_FORMATS: Record<string, (v: number) => string> = {
  // 기본 스탯
  str: v => `힘 +${v}`,
  dex: v => `민첩 +${v}`,
  int: v => `지능 +${v}`,
  vit: v => `체력 +${v}`,
  spd: v => `속도 +${v}`,
  cri: v => `치명타 확률 +${v}%`,
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
  crit_dmg_pct: v => `치명타 데미지 ${v}% 증가`,
  // 신규 7종
  berserk_pct: v => `HP 30% 이하 시 데미지 +${v}%`,
  guardian_pct: v => `HP 50% 이상 시 받는 데미지 -${v}%`,
  thorns_pct: v => `받는 데미지 ${v}% 반사`,
  gauge_on_crit_pct: v => `치명타 시 게이지 +${v}%`,
  ambush_pct: v => `5초 미피격 시 다음 공격 +${v}%`,
  predator_pct: v => `적 처치 시 HP ${v}% 회복`,
  first_strike_pct: v => `첫 공격 데미지 +${v}%`,
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
        // 모든 접두사 통일: ◆ + 진한 하늘색
        return (
          <span key={key} style={{ color: '#66ccff', fontWeight: 600 }}>
            ◆ {text}
          </span>
        );
      })}
    </div>
  );
}
