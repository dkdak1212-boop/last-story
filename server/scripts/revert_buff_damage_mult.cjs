const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 1. kind='buff' 스킬의 damage_mult 0으로 되돌리고 설명에서 'ATK xN% 동시 타격' 제거
  const r = await pool.query(`
    UPDATE skills
       SET damage_mult = 0,
           description = REGEXP_REPLACE(description, ' \\((MATK|ATK) x[0-9.]+% 동시 타격\\)', '', 'g')
     WHERE kind = 'buff'
  `);
  console.log(`buff damage_mult 초기화: ${r.rowCount}행`);

  // 2. 결과 확인
  const v = await pool.query(`SELECT class_name, name, damage_mult, description FROM skills WHERE kind = 'buff' ORDER BY class_name, required_level`);
  for (const row of v.rows) {
    console.log(`  [${row.class_name}] ${row.name} mult=${row.damage_mult} | ${row.description}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
