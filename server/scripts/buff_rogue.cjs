const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`
    UPDATE skills SET damage_mult = ROUND((damage_mult * 1.2)::numeric, 2)
    WHERE class_name = 'rogue' AND kind = 'damage' AND damage_mult > 0
  `);
  console.log(`도적 딜스킬 ×1.2: ${r.rowCount}개`);

  // 도적 독 계수도 상향: 1.5 → 1.8
  console.log('도적 독 계수: 1.5 → 1.8 (엔진에서 처리)');

  const v = await pool.query(`
    SELECT name, damage_mult, cooldown_actions, effect_type
    FROM skills WHERE class_name = 'rogue' AND kind = 'damage'
    ORDER BY damage_mult DESC
  `);
  console.log('\n도적 결과:');
  for (const s of v.rows) console.log(`  ${s.name}: x${s.damage_mult} cd=${s.cooldown_actions} ${s.effect_type}`);

  // 도적 스킬 설명도 갱신
  for (const s of v.rows) {
    const mult = Number(s.damage_mult);
    const pct = Math.round(mult * 100);
    let desc = `ATK x${pct}%`;
    if (s.effect_type === 'crit_bonus') desc += ', 치명타 확률 상승';
    else if (s.effect_type === 'hp_pct_damage') desc += ', 적 현재 HP 비례 추가 데미지';
    else if (s.effect_type === 'multi_hit_poison') desc += ', 다회 타격 + 독';
    else if (s.effect_type === 'double_chance') desc += ', 20% 확률 2회 발동';
    else if (s.effect_type === 'poison') desc += ', 독 도트';
    await pool.query('UPDATE skills SET description = $1 WHERE class_name = $2 AND name = $3', [desc, 'rogue', s.name]);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
