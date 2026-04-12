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
  // 유니크 전용
  atk_pct: v => `공격력 ${v}% 증가`,
  matk_pct: v => `마법공격 ${v}% 증가`,
  hp_pct: v => `최대 HP ${v}% 증가`,
  damage_taken_down_pct: v => `받는 데미지 ${v}% 감소`,
};

interface Props {
  prefixStats: Record<string, number> | undefined | null;
  prefixTiers?: Record<string, number> | null;
}

// 티어별 색상/스타일
function getTierStyle(tier: number): { color: string; glow: boolean; bg: string } {
  switch (tier) {
    case 4: return { color: '#ff4444', glow: true, bg: 'rgba(255,68,68,0.12)' };  // 빨강 + 발광
    case 3: return { color: '#b060cc', glow: false, bg: 'transparent' };           // 보라
    case 2: return { color: '#5b8ecc', glow: false, bg: 'transparent' };           // 파랑
    default: return { color: '#66ccff', glow: false, bg: 'transparent' };          // T1 기본
  }
}

export function PrefixDisplay({ prefixStats, prefixTiers }: Props) {
  if (!prefixStats || Object.keys(prefixStats).length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, marginTop: 4 }}>
      {Object.entries(prefixStats).map(([key, val]) => {
        const fmt = EFFECT_FORMATS[key];
        const text = fmt ? fmt(val) : `${key} +${val}`;
        const tier = prefixTiers?.[key] || 1;
        const s = getTierStyle(tier);
        const isT4 = tier === 4;
        return (
          <span key={key} style={{
            color: s.color,
            fontWeight: isT4 ? 800 : 600,
            background: s.bg,
            padding: isT4 ? '1px 5px' : 0,
            borderRadius: isT4 ? 3 : 0,
            border: isT4 ? `1px solid ${s.color}` : 'none',
            textShadow: s.glow ? `0 0 6px ${s.color}, 0 0 2px ${s.color}` : undefined,
            display: 'inline-block',
            width: 'fit-content',
          }}>
            {isT4 && <span style={{ marginRight: 3, fontWeight: 900 }}>★T4</span>}
            ◆ {text}
          </span>
        );
      })}
    </div>
  );
}
