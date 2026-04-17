const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const c = await pool.query(`SELECT zone, tier, COUNT(*)::int AS n FROM node_definitions WHERE class_exclusive = 'summoner' GROUP BY zone, tier ORDER BY zone, tier`);
  console.log('소환사 노드 분포:');
  c.rows.forEach(r => console.log(`  zone=${r.zone} tier=${r.tier}: ${r.n}`));
  const t = await pool.query(`SELECT COUNT(*)::int AS n FROM node_definitions WHERE class_exclusive = 'summoner'`);
  console.log(`총: ${t.rows[0].n}`);
  await pool.end();
})();
