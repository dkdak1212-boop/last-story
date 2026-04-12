const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`
    SELECT id, name, required_level, damage_mult, cooldown_actions, effect_type, effect_value, effect_duration
    FROM skills WHERE class_name = 'cleric' ORDER BY required_level
  `);
  for (const s of r.rows) {
    console.log(`Lv${s.required_level} ${s.name} | mult=${s.damage_mult} cd=${s.cooldown_actions} | ${s.effect_type}=${s.effect_value} dur=${s.effect_duration}`);
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
