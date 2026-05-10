// 아이템 접두사 — 효과 설명 표시

const EFFECT_FORMATS: Record<string, (v: number) => string> = {
  // 기본 스탯
  str: v => `힘 +${v}`,
  dex: v => `민첩 +${v}`,
  int: v => `지능 +${v}`,
  vit: v => `체력 +${v}`,
  spd: v => `스피드 +${v}`,
  cri: v => `치명타 확률 +${v}%`,
  accuracy: v => `명중 +${v}`,
  dodge: v => `회피 +${v}`,
  // 신규 특수 효과
  def_reduce_pct: v => `몬스터 방어력 ${v}% 감소`,
  slow_pct: v => `몬스터 스피드 ${v}% 감소`,
  dot_amp_pct: v => `도트 데미지 ${v}% 증가`,
  hp_regen: v => `틱당 HP ${v} 회복`,
  lifesteal_pct: v => `데미지 흡혈 ${v}%`,
  gold_bonus_pct: v => `골드 획득 ${v}% 증가`,
  exp_bonus_pct: v => `경험치 획득 ${v}% 증가`,
  crit_dmg_pct: v => `치명타 데미지 ${v}% 증가`,
  // 신규 7종
  berserk_pct: v => `내 HP 35% 이하 시 데미지 +${v}%`,
  full_hp_amp_pct: v => `풀피 시 데미지 +${v}%`,
  guardian_pct: v => `HP 50% 이상 시 받는 데미지 -${v}%`,
  thorns_pct: v => `받는 데미지 ${v}% 반사`,
  spd_pct: v => `속도증가 +${v}% (합산 100% 제한)`,
  ambush_pct: v => `5초 미피격 시 다음 공격 +${v}%`,
  predator_pct: v => `적 처치 시 HP ${v}% 회복`,
  first_strike_pct: v => `첫 공격 데미지 +${v}%`,
  // 유니크 전용
  atk_pct: v => `공격력 ${v}% 증가`,
  matk_pct: v => `마법공격 ${v}% 증가`,
  hp_pct: v => `최대 HP ${v}% 증가`,
  damage_taken_down_pct: v => `받는 데미지 ${v}% 감소`,
  // 신규 8종 (4월 패치)
  max_hp_pct: v => `최대 HP ${v}% 증가`,
  all_stats_pct: v => `전체 스탯 ${v}% 증가 (힘/민/지/체)`,
  drop_rate_pct: v => `아이템 드랍률 ${v}% 증가`,
  multi_hit_amp_pct: v => `다단 타격 데미지 ${v}% 증가`,
  def_pierce_pct: v => `적 방어 ${v}% 추가 무시`,
  miss_combo_pct: v => `빗나감 1회당 다음 공격 +${v}% (5스택)`,
  evasion_burst_pct: v => `회피 성공 후 다음 공격 +${v}%`,
  // 소환사 접두사 — engine.ts 에서 getPassive + equipPrefixes 합산
  summon_amp: v => `소환수 데미지 ${v}% 증가`,
  summon_double_hit: v => `소환수 2회 타격 ${v}%`,
  summon_max_extra: v => `최대 소환수 +${v}`,
  summon_crit_dmg_amp: v => `소환수 치명타 데미지 +${v}%`,
  // 성직자 — 실드 효과 강화 (시공의 차원의 홀 등)
  shield_amp: v => `실드 효과 ${v}% 증가`,
  // 110제 craft 추가 옵션
  execute_pct: v => `적 HP 20% 이하 시 데미지 +${v}%`,
  undispellable: () => `버프 디스펠 면역`,
  shield_on_low_hp: v => `HP 30% 이하 시 자동 실드 max_hp ${v}%`,
  reflect_skill: v => `스킬 피해 ${v}% 반사`,
  def_convert_atk: v => `방어력 ${v}% 만큼 공격력 추가`,
};

interface Props {
  prefixStats: Record<string, number> | undefined | null;
  prefixTiers?: Record<string, number> | null;
  uniquePrefixStats?: Record<string, number> | null; // 유니크 고정 옵션 (raw, 강화 미적용)
  enhanceLevel?: number; // 강화 +레벨 (유니크 raw → scaled 변환용)
}

// 티어별 색상/스타일
function getTierStyle(tier: number): { color: string; glow: boolean; bg: string } {
  switch (tier) {
    case 4: return { color: '#ff4444', glow: true,  bg: 'rgba(255,68,68,0.12)' }; // 빨강 + 발광
    case 3: return { color: '#ffcc33', glow: false, bg: 'transparent' };           // 황금
    case 2: return { color: '#b060cc', glow: false, bg: 'transparent' };           // 보라
    default: return { color: '#5b8ecc', glow: false, bg: 'transparent' };          // T1 파랑
  }
}

// 유니크 고정 옵션 스타일 — 주황색 + 검은 음영 (다른 티어와 명확한 구분)
const UNIQUE_FIXED_STYLE = { color: '#ff9933', glow: false, bg: 'transparent' };
const UNIQUE_FIXED_TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.6)';

type Row = {
  key: string;
  value: number;
  isUniqueFixed: boolean;
  tier: number;
};

export function PrefixDisplay({ prefixStats, prefixTiers, uniquePrefixStats, enhanceLevel }: Props) {
  if (!prefixStats || Object.keys(prefixStats).length === 0) return null;

  // 같은 키에 유니크 + 굴림 둘 다 있으면 두 줄로 분리:
  //   prefixStats[key] = (unique_raw + rolled_raw) × enhMult  (서버에서 합산·강화 적용된 값)
  //   uniquePrefixStats[key] = unique_raw  (강화 미적용)
  // → 클라에서 unique_scaled = unique_raw × enhMult, rolled_scaled = total - unique_scaled
  const enhMult = 1 + (enhanceLevel || 0) * 0.025;
  const allKeys = Array.from(new Set([
    ...Object.keys(prefixStats),
    ...Object.keys(uniquePrefixStats || {}),
  ]));
  const rows: Row[] = [];
  for (const key of allKeys) {
    const totalScaled = prefixStats[key] ?? 0;
    const uniqRaw = uniquePrefixStats?.[key] ?? 0;
    const uniqScaled = uniqRaw > 0 ? Math.round(uniqRaw * enhMult) : 0;
    const rolledScaled = Math.max(0, totalScaled - uniqScaled);
    const tier = prefixTiers?.[key] || 1;

    if (uniqScaled > 0) {
      rows.push({ key, value: uniqScaled, isUniqueFixed: true, tier });
    }
    if (rolledScaled > 0) {
      rows.push({ key, value: rolledScaled, isUniqueFixed: false, tier });
    }
    // 둘 다 0 (totalScaled<=0 또는 uniq 가 raw>0 인데 합산=0) — 안전 fallback
    if (uniqScaled === 0 && rolledScaled === 0 && totalScaled > 0) {
      rows.push({ key, value: totalScaled, isUniqueFixed: false, tier });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, marginTop: 4 }}>
      {rows.map((row, idx) => {
        const fmt = EFFECT_FORMATS[row.key];
        const text = fmt ? fmt(row.value) : `${row.key} +${row.value}`;
        const s = row.isUniqueFixed ? UNIQUE_FIXED_STYLE : getTierStyle(row.tier);
        const isT4 = !row.isUniqueFixed && row.tier === 4;
        const labelText = row.isUniqueFixed ? '[고정]' : `T${row.tier}`;
        return (
          <span key={`${row.key}-${row.isUniqueFixed ? 'u' : 'r'}-${idx}`} style={{
            color: s.color,
            fontWeight: isT4 ? 800 : 600,
            background: s.bg,
            padding: isT4 ? '1px 5px' : 0,
            borderRadius: isT4 ? 3 : 0,
            border: isT4 ? `1px solid ${s.color}` : 'none',
            textShadow: row.isUniqueFixed
              ? UNIQUE_FIXED_TEXT_SHADOW
              : (s.glow ? `0 0 6px ${s.color}, 0 0 2px ${s.color}` : undefined),
            display: 'inline-block',
            width: 'fit-content',
          }}>
            <span style={{
              marginRight: 4,
              fontWeight: 900,
              fontSize: 10,
              padding: '0 3px',
              border: `1px solid ${s.color}`,
              borderRadius: 2,
            }}>{labelText}</span>
            {text}
          </span>
        );
      })}
    </div>
  );
}
