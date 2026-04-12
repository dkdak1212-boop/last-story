const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  for (const cls of ['warrior', 'mage', 'cleric', 'rogue']) {
    const useMatk = cls === 'mage' || cls === 'cleric';
    const atkLabel = useMatk ? 'MATK(INT×1.5)' : 'ATK(STR×1.0)';

    const r = await pool.query(`
      SELECT name, required_level, damage_mult, cooldown_actions, kind, effect_type, effect_value, effect_duration, flat_damage, description
      FROM skills WHERE class_name = $1
      ORDER BY required_level
    `, [cls]);

    // DPS 시뮬: ATK=1000 기준, 10턴 동안 총 데미지 (기본기 cd=0 포함)
    let totalDmg = 0;
    let totalDot = 0;
    const turns = 20;
    const cooldowns = new Map();
    const baseMult = cls === 'warrior' ? 1.0 : cls === 'rogue' ? 1.0 : 1.5;
    const baseAtk = 1000 * baseMult;

    const dmgSkills = r.rows.filter(s => s.kind === 'damage' && Number(s.damage_mult) > 0);
    const basicSkill = dmgSkills.find(s => s.cooldown_actions === 0);

    for (let t = 0; t < turns; t++) {
      // tick cooldowns
      for (const [id, cd] of cooldowns) {
        if (cd <= 1) cooldowns.delete(id);
        else cooldowns.set(id, cd - 1);
      }
      // pick best ready skill
      let picked = null;
      for (const sk of dmgSkills.sort((a, b) => Number(b.damage_mult) - Number(a.damage_mult))) {
        if (sk.cooldown_actions === 0) continue;
        if (!cooldowns.has(sk.name) || cooldowns.get(sk.name) <= 0) {
          picked = sk;
          break;
        }
      }
      if (!picked) picked = basicSkill;
      if (!picked) continue;

      const mult = Number(picked.damage_mult);
      const flat = Number(picked.flat_damage) || 0;
      const dmg = baseAtk * mult + flat;
      totalDmg += dmg;

      if (picked.cooldown_actions > 0) cooldowns.set(picked.name, picked.cooldown_actions);

      // dot/bleed 추가
      if (picked.effect_type === 'dot') {
        const dotPer = baseAtk * 1.56; // 화상 도트 계수
        totalDot += dotPer * (picked.effect_duration || 3);
      }
      // 분노의 일격 출혈
      if (picked.name === '분노의 일격') {
        totalDot += baseAtk * 2.0 * 3;
      }
      // 독
      if (picked.effect_type === 'poison' || picked.effect_type === 'multi_hit_poison') {
        const poisonPer = baseAtk * 1.5;
        totalDot += poisonPer * (picked.effect_duration || 3);
      }
      // double_chance 50%
      if (picked.effect_type === 'double_chance' || (picked.effect_type === 'dot' && Number(picked.effect_value) > 0)) {
        const chance = Number(picked.effect_value) || 50;
        totalDmg += dmg * (chance / 100);
      }
      // multi_hit
      if (picked.effect_type === 'multi_hit') {
        totalDmg += dmg * (Number(picked.effect_value) - 1);
      }
      if (picked.effect_type === 'multi_hit_poison') {
        totalDmg += dmg * (Number(picked.effect_value) - 1);
      }
      // hp_pct_damage (가정: 적 HP 50000)
      if (picked.effect_type === 'hp_pct_damage') {
        totalDmg += 50000 * Number(picked.effect_value) / 100;
      }
    }

    const totalAll = totalDmg + totalDot;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${cls.toUpperCase()}] 베이스: ${atkLabel} = ${baseAtk}`);
    console.log(`${'='.repeat(60)}`);

    // 스킬 목록
    for (const s of r.rows) {
      const mult = Number(s.damage_mult);
      const cd = s.cooldown_actions;
      const eff = s.effect_type !== 'damage' ? ` | ${s.effect_type}=${s.effect_value} dur=${s.effect_duration}` : '';
      const kindTag = s.kind !== 'damage' ? ` [${s.kind}]` : '';
      console.log(`  Lv${String(s.required_level).padStart(2)} ${s.name.padEnd(12)} x${String(mult).padStart(5)} cd=${cd}${kindTag}${eff}`);
    }

    console.log(`\n  ── ${turns}턴 DPS 시뮬 (ATK=${baseAtk} 기준) ��─`);
    console.log(`  직접 데미지: ${Math.round(totalDmg).toLocaleString()}`);
    console.log(`  도트 데미지: ${Math.round(totalDot).toLocaleString()}`);
    console.log(`  총합:        ${Math.round(totalAll).toLocaleString()}`);
    console.log(`  턴당 평균:   ${Math.round(totalAll / turns).toLocaleString()}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
