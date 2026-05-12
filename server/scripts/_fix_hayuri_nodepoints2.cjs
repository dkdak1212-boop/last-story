const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 직업 cost 92 + unspent 7 = 총 99 (정상)
    const r = await c.query(`UPDATE characters SET node_points = 7 WHERE name = '하유리' RETURNING id, name, level, node_points`);
    for (const row of r.rows) console.log(`✅ #${row.id} ${row.name} L${row.level} node_points: ${row.node_points} (투자된 92 + 미투자 7 = 99)`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
