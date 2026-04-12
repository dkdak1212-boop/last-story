const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const r = await pool.query(`
    UPDATE skills SET description = '적 기절 2행동 + 자신 모든 능력치 20% 상승 3행동 (공격/방어/속도)'
    WHERE class_name = 'cleric' AND name = '신성 사슬'
  `);
  console.log(`신성 사슬 갱신: ${r.rowCount}행`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
