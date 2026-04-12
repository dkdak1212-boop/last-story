const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const PASSIVE_LABELS = {
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
  balance_apostle: v => `모든 스탯 +${v}%`,
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
};

const STAT_LABELS = {
  str: '힘', dex: '민첩', int: '지능', vit: '체력', spd: '속도', cri: '치명타',
};

(async () => {
  const r = await pool.query(`SELECT id, name, effects, description FROM node_definitions`);
  let updated = 0;

  for (const node of r.rows) {
    if (!node.effects || !Array.isArray(node.effects) || node.effects.length === 0) continue;

    const parts = [];
    for (const e of node.effects) {
      if (e.type === 'stat' && e.stat) {
        const label = STAT_LABELS[e.stat] || e.stat;
        parts.push(`${label} +${e.value}`);
      } else if (e.type === 'passive' && e.key) {
        const fmt = PASSIVE_LABELS[e.key];
        if (fmt) parts.push(fmt(e.value));
        else parts.push(`${e.key} +${e.value}`);
      }
    }

    const newDesc = parts.join(', ');
    if (newDesc && newDesc !== node.description) {
      await pool.query('UPDATE node_definitions SET description = $1 WHERE id = $2', [newDesc, node.id]);
      console.log(`${node.name}: ${newDesc}`);
      updated++;
    }
  }

  console.log(`\n${updated}개 노드 설명 갱신 완료`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
