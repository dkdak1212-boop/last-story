const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 각 직업별 노드 패시브 조회
  const nodeR = await pool.query(`
    SELECT nd.class_exclusive AS cls, e->>'key' AS key, (e->>'value')::numeric AS value
    FROM node_definitions nd, jsonb_array_elements(nd.effects) AS e
    WHERE e->>'type' = 'passive' AND nd.class_exclusive IS NOT NULL
  `);
  const nodesByClass = {};
  for (const r of nodeR.rows) {
    if (!nodesByClass[r.cls]) nodesByClass[r.cls] = {};
    nodesByClass[r.cls][r.key] = (nodesByClass[r.cls][r.key] || 0) + Number(r.value);
  }

  console.log('=== 직업별 전체 노드 패시브 합 ===');
  for (const [cls, nodes] of Object.entries(nodesByClass)) {
    console.log(`\n[${cls}]`);
    for (const [k, v] of Object.entries(nodes)) console.log(`  ${k}: +${v}`);
  }

  // 시뮬 파라미터
  const BASE_STR = 300; // Lv75 기준 스탯 가정
  const BASE_INT = 300;
  const TURNS = 30;
  const MONSTER_HP = 100000;
  const MONSTER_DEF = 200;
  const MONSTER_MDEF = 200;

  for (const cls of ['warrior', 'mage', 'cleric', 'rogue']) {
    const useMatk = cls === 'mage' || cls === 'cleric';
    const nodes = nodesByClass[cls] || {};

    // 베이스 스탯 계산 (formulas.ts 동일)
    let atk = useMatk ? (BASE_INT * 1.5) : (BASE_STR * 1.2);
    let def = 200;

    // 노드 적용: 스탯 증폭
    if (nodes.war_god) atk = Math.round(atk * (1 + nodes.war_god / 100));
    if (nodes.mana_overload) atk = Math.round(atk * (1 + nodes.mana_overload / 100));
    if (nodes.berserker_heart) atk = Math.round(atk * (1 + nodes.berserker_heart / 100));
    if (nodes.balance_apostle) atk = Math.round(atk * (1 + nodes.balance_apostle / 100));

    // 도트/독 증폭 합산
    const dotAmp = (nodes.dot_amp || 0) + (nodes.poison_amp || 0) + (nodes.bleed_amp || 0)
      + (nodes.burn_amp || 0) + (nodes.holy_dot_amp || 0) + (nodes.elemental_storm || 0)
      + (nodes.poison_lord || 0);

    // 스킬 증폭
    const spellAmp = nodes.spell_amp || 0;
    const judgeAmp = (nodes.judge_amp || 0) + (nodes.holy_judge || 0);
    const critDmgBonus = nodes.crit_damage || 0;
    const armorPierce = nodes.armor_pierce || 0;
    const extraHit = nodes.extra_hit || 0;
    const bleedOnHit = nodes.bleed_on_hit || 0;
    const critLifesteal = nodes.crit_lifesteal || 0;
    const poisonBurstAmp = nodes.poison_burst_amp || 0;
    const shieldAmp = nodes.shield_amp || 0;

    // 스킬 로드
    const sr = await pool.query(`
      SELECT name, damage_mult, cooldown_actions, kind, effect_type, effect_value, effect_duration, flat_damage
      FROM skills WHERE class_name = $1 ORDER BY required_level
    `, [cls]);

    const dmgSkills = sr.rows.filter(s => s.kind === 'damage' && Number(s.damage_mult) > 0);
    const basicSkill = dmgSkills.find(s => s.cooldown_actions === 0);

    // 방어 관통 적용
    const effectiveDef = useMatk
      ? Math.round(MONSTER_MDEF * (1 - Math.min(80, armorPierce) / 100))
      : Math.round(MONSTER_DEF * (1 - Math.min(80, armorPierce) / 100));

    let totalDmg = 0;
    let totalDot = 0;
    let poisonStacks = 0;
    const cooldowns = new Map();
    const CRIT_RATE = 30; // 기본 30% 치명타
    const DOT_SKILL_MULT = 1.56;
    const POISON_MULT = 1.8;
    const BLEED_MULT = 2.0;

    for (let t = 0; t < TURNS; t++) {
      // tick cooldowns
      for (const [id, cd] of cooldowns) {
        if (cd <= 1) cooldowns.delete(id);
        else cooldowns.set(id, cd - 1);
      }

      // 버프 효과 (전쟁의 함성 등은 자유행동으로 이미 적용된다고 가정)
      let atkBuff = 1.0;
      if (nodes.war_god || nodes.mana_overload) atkBuff = 1.0; // 이미 atk에 반영됨

      // ATK buff from 전쟁의 함성 (40%, 약 43% uptime: 3/7)
      if (cls === 'warrior') atkBuff *= 1 + 0.4 * (3 / 7);
      // 마력 집중 (speed buff → 더 자주 행동, 약 20% 실효 DPS 증가)
      if (cls === 'mage') atkBuff *= 1.10;

      // pick best ready skill (쿨다운 순)
      let picked = null;
      for (const sk of [...dmgSkills].sort((a, b) => Number(b.damage_mult) - Number(a.damage_mult))) {
        if (sk.cooldown_actions === 0) continue;
        if (!cooldowns.has(sk.name)) { picked = sk; break; }
      }
      if (!picked) picked = basicSkill;
      if (!picked) continue;

      const mult = Number(picked.damage_mult);
      const flat = Number(picked.flat_damage) || 0;

      // 기본 데미지 (ATK - DEF*0.5)
      let baseDmg = Math.max(1, atk * atkBuff - effectiveDef * 0.5);
      let dmg = baseDmg * mult + flat;

      // spell_amp (마법사/성직자)
      if (spellAmp > 0 && useMatk) dmg *= (1 + spellAmp / 100);

      // judge_amp (성직자)
      if (judgeAmp > 0 && cls === 'cleric') dmg *= (1 + judgeAmp / 100);

      // 치명타 (30% 확률, 200% + critDmgBonus)
      const critChance = CRIT_RATE / 100;
      const critMult = 2.0 + critDmgBonus / 100;
      const avgCritMult = 1 + critChance * (critMult - 1);
      dmg *= avgCritMult;

      if (picked.cooldown_actions > 0) cooldowns.set(picked.name, picked.cooldown_actions);

      // multi_hit
      if (picked.effect_type === 'multi_hit') {
        dmg *= Number(picked.effect_value);
      }
      if (picked.effect_type === 'multi_hit_poison') {
        const hits = Number(picked.effect_value);
        dmg *= hits;
        const pDmg = atk * POISON_MULT * (1 + dotAmp / 100);
        totalDot += pDmg * 3 * hits; // 각 히트마다 독 3턴
        poisonStacks += hits;
      }

      // double_chance
      if (picked.effect_type === 'double_chance' || (picked.effect_type === 'dot' && Number(picked.effect_value) > 0)) {
        const chance = Number(picked.effect_value) || 50;
        dmg *= (1 + chance / 100);
      }

      // hp_pct_damage
      if (picked.effect_type === 'hp_pct_damage') {
        dmg += MONSTER_HP * 0.5 * Number(picked.effect_value) / 100; // 평균 50% HP
      }

      totalDmg += dmg;

      // 도트
      if (picked.effect_type === 'dot') {
        const dDmg = atk * DOT_SKILL_MULT * (1 + dotAmp / 100);
        const dur = picked.effect_duration || 3;
        totalDot += dDmg * dur;
      }
      if (picked.effect_type === 'poison') {
        const pDmg = atk * POISON_MULT * (1 + dotAmp / 100);
        totalDot += pDmg * (picked.effect_duration || 3);
        poisonStacks++;
      }

      // 분노의 일격 출혈
      if (picked.name === '분노의 일격') {
        const bDmg = atk * BLEED_MULT * (1 + dotAmp / 100);
        totalDot += bDmg * 3;
      }

      // bleed_on_hit 패시브
      if (bleedOnHit > 0) {
        const bChance = bleedOnHit / 100;
        const bDmg = atk * 1.2 * (1 + dotAmp / 100);
        totalDot += bDmg * 3 * bChance;
      }

      // extra_hit 패시브 (50% 추가 타격)
      if (extraHit > 0) {
        totalDmg += dmg * 0.5 * (extraHit / 100);
      }

      // poison_burst (도적: 5턴마다 사용 가정)
      if (cls === 'rogue' && t % 5 === 4 && poisonStacks > 0) {
        const burstDmg = atk * POISON_MULT * poisonStacks * 2.0 * (1 + poisonBurstAmp / 100);
        totalDmg += burstDmg;
      }

      // shield_break 보너스 (성직자: 쉴드 비례)
      if (picked.effect_type === 'shield_break' || picked.effect_type === 'judgment_day') {
        // 쉴드 약 50% maxHp × shieldAmp
        const shieldVal = 5000 * (1 + shieldAmp / 100);
        totalDmg += shieldVal * 4.0; // shield_break 400% conversion
      }
    }

    const totalAll = totalDmg + totalDot;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${cls.toUpperCase()}] ATK/MATK=${Math.round(atk)} | 방어관통=${armorPierce}% | 도트증폭=${dotAmp}%`);
    console.log(`  spell_amp=${spellAmp}% judge_amp=${judgeAmp}% crit_dmg_bonus=${critDmgBonus}%`);
    console.log(`  bleed_on_hit=${bleedOnHit}% extra_hit=${extraHit}% shield_amp=${shieldAmp}%`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  직접: ${Math.round(totalDmg).toLocaleString()}`);
    console.log(`  도트: ${Math.round(totalDot).toLocaleString()}`);
    console.log(`  총합: ${Math.round(totalAll).toLocaleString()}`);
    console.log(`  턴당: ${Math.round(totalAll / TURNS).toLocaleString()}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
