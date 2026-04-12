const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 1. 전사 딜스킬 계수 ×1.35
  const wr = await pool.query(`
    UPDATE skills SET damage_mult = ROUND((damage_mult * 1.35)::numeric, 2)
    WHERE class_name = 'warrior' AND kind = 'damage' AND damage_mult > 0
  `);
  console.log(`전사 딜스킬 계수 ×1.35: ${wr.rowCount}개`);

  // 2. 마법사 딜스킬 계수 ×1.50
  const mr = await pool.query(`
    UPDATE skills SET damage_mult = ROUND((damage_mult * 1.50)::numeric, 2)
    WHERE class_name = 'mage' AND kind = 'damage' AND damage_mult > 0
  `);
  console.log(`마법사 딜스킬 계수 ×1.50: ${mr.rowCount}개`);

  // 3. 마법사 자기 속도감소 패널티 제거 (self_speed_mod 음수 → 0)
  const sr = await pool.query(`
    UPDATE skills SET effect_type = 'damage', effect_value = 0, effect_duration = 0
    WHERE class_name = 'mage' AND effect_type = 'self_speed_mod' AND effect_value < 0
  `);
  console.log(`마법사 자기 속도감소 제거: ${sr.rowCount}개`);

  // 확인
  console.log('\n=== 전사 결과 ===');
  const wv = await pool.query(`SELECT name, damage_mult, cooldown_actions FROM skills WHERE class_name = 'warrior' AND kind = 'damage' ORDER BY damage_mult DESC`);
  for (const s of wv.rows) console.log(`  ${s.name}: x${s.damage_mult} cd=${s.cooldown_actions}`);

  console.log('\n=== 마법사 결과 ===');
  const mv = await pool.query(`SELECT name, damage_mult, cooldown_actions, effect_type FROM skills WHERE class_name = 'mage' AND kind = 'damage' ORDER BY damage_mult DESC`);
  for (const s of mv.rows) console.log(`  ${s.name}: x${s.damage_mult} cd=${s.cooldown_actions} ${s.effect_type}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
