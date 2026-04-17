const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const NAME = '나우아임영';

(async () => {
  const c = await pool.query(
    'SELECT id, name, level, class_name, location, last_online_at FROM characters WHERE name = $1',
    [NAME]
  );
  if (c.rowCount === 0) {
    console.error(`캐릭터 ${NAME} 없음`);
    process.exit(1);
  }
  console.log(`캐릭터: ${JSON.stringify(c.rows[0])}`);

  // 전투 세션에 있나?
  const s = await pool.query(
    'SELECT character_id, field_id FROM combat_sessions WHERE character_id = $1',
    [c.rows[0].id]
  );
  console.log(`전투 세션: ${s.rowCount > 0 ? JSON.stringify(s.rows[0]) : '없음 (비전투)'}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
