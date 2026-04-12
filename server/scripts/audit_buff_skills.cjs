const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // damage_mult = 0인 스킬 (= 데미지 없는 액티브 스킬 = 1턴 손해) 모두 조회
  const r = await pool.query(`
    SELECT id, class_name, name, required_level, damage_mult, kind,
           cooldown_actions, effect_type, effect_value, effect_duration, description
    FROM skills
    WHERE damage_mult = 0 OR damage_mult IS NULL
    ORDER BY class_name, required_level
  `);
  console.log(`damage_mult=0 스킬 ${r.rows.length}개:`);
  for (const s of r.rows) {
    console.log(`  [${s.class_name} Lv.${s.required_level}] ${s.name} | ${s.effect_type}=${s.effect_value} dur=${s.effect_duration} cd=${s.cooldown_actions}`);
    console.log(`    설명: ${s.description}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
