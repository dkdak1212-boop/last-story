const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const LABELS = {
  // stat
  str: v => `힘 +${v}`,
  dex: v => `민첩 +${v}`,
  int: v => `지능 +${v}`,
  vit: v => `체력 +${v}`,
  spd: v => `속도 +${v}`,
  cri: v => `치명타 +${v}%`,
  // passive
  war_god: v => `공격력 +${v}%`,
  mana_overload: v => `마법공격 +${v}%`,
  spell_amp: v => `스킬 데미지 +${v}%`,
  dot_amp: v => `도트 데미지 +${v}%`,
  burn_amp: v => `화상 데미지 +${v}%`,
  poison_amp: v => `독 데미지 +${v}%`,
  bleed_amp: v => `출혈 데미지 +${v}%`,
  holy_dot_amp: v => `신성 도트 +${v}%`,
  poison_lord: v => `독 데미지 +${v}%, 독 중첩 +3`,
  elemental_storm: v => `도트 지속 +${v}행동`,
  judge_amp: v => `심판 데미지 +${v}%`,
  holy_judge: v => `신성 심판 +${v}%`,
  shield_amp: v => `실드량 +${v}%`,
  heal_amp: v => `회복량 +${v}%`,
  armor_pierce: v => `방어 관통 +${v}%`,
  crit_damage: v => `치명타 데미지 +${v}%`,
  crit_lifesteal: v => `치명타 흡혈 +${v}%`,
  lifesteal_amp: v => `흡혈 +${v}%`,
  extra_hit: v => `${v}% 확률 추가 타격`,
  bleed_on_hit: v => `${v}% 확률 출혈`,
  guard_instinct: v => `HP 40% 이하 시 방어 +${v}%`,
  reflect_amp: v => `반사 데미지 +${v}%`,
  counter_incarnation: v => `상시 데미지 반사 ${v}%`,
  undying_fury: v => `체력 비례 공격 +${v}%`,
  rage_reduce: v => `분노 소모 -${v}%`,
  cooldown_reduce: v => `쿨다운 -${v}행동`,
  resurrect_amp: v => `부활 HP +${v}%`,
  sanctuary_guard: v => `최대 HP +${v}%`,
  balance_apostle: v => `공격/마법공격/방어 +${v}%`,
  frost_amp: v => `빙결 효과 +${v}%`,
  gauge_control_amp: v => `게이지 제어 +${v}%`,
  freeze_extend: v => `동결 지속 +${v}행동`,
  stun_extend: v => `기절 지속 +${v}행동`,
  time_lord: v => `스피드 +${v}%`,
  poison_burst_amp: v => `독 폭발 +${v}%`,
  control_amp: v => `CC 효과 +${v}%`,
  shadow_dance: v => `회피 +${v}`,
  trickster: v => `치명타 확률 +${v}%`,
  chain_action_amp: v => `연속행동 데미지 +${v}%`,
  smoke_extend: v => `연막 지속 +${v}행동`,
  mana_flow: v => `쿨다운 추가 -${v}`,
  dot_resist: v => `도트 저항 +${v}%`,
  iron_will: v => `방어력 +${v}%`,
  berserker_heart: v => `광전사 (공격 +${v}%, 방어 -${Math.round(v/2)}%)`,
  focus_mastery: v => `명중 강화 +${v}`,
};

(async () => {
  const r = await pool.query(`SELECT id, name, effects, description FROM node_definitions`);
  let updated = 0;

  for (const node of r.rows) {
    if (!node.effects || !Array.isArray(node.effects) || node.effects.length === 0) continue;

    const parts = [];
    for (const e of node.effects) {
      const key = e.stat || e.key;
      const val = e.value;
      const fmt = LABELS[key];
      if (fmt) {
        parts.push(fmt(val));
      } else if (key) {
        // 아직 매핑 안 된 키 — 한글로 최대한
        parts.push(`${key} +${val}`);
      }
    }

    const newDesc = parts.join(', ');
    if (newDesc && newDesc !== node.description) {
      await pool.query('UPDATE node_definitions SET description = $1 WHERE id = $2', [newDesc, node.id]);
      if (node.description !== newDesc) {
        // 영어 키가 남아있는지 체크
        const hasEnglish = /[a-z_]{3,}/.test(newDesc);
        const marker = hasEnglish ? ' ⚠️영어잔여' : '';
        console.log(`${node.name}: ${newDesc}${marker}`);
        updated++;
      }
    }
  }

  console.log(`\n${updated}개 노드 설명 갱신`);

  // 영어 잔여 체크
  const check = await pool.query(`SELECT name, description FROM node_definitions WHERE description ~ '[a-z_]{4,}'`);
  if (check.rows.length > 0) {
    console.log(`\n⚠️ 아직 영어가 남은 노드 ${check.rows.length}개:`);
    for (const r of check.rows) console.log(`  ${r.name}: ${r.description}`);
  } else {
    console.log('\n✅ 영어 잔여 없음 — 모두 한글화 완료');
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
