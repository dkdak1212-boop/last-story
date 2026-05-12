const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const before = await c.query(`SELECT id, name, level, node_points FROM characters WHERE name = $1`, ['하유리']);
    if (before.rowCount === 0) { console.log("'하유리' 캐릭 없음"); return; }
    for (const r of before.rows) {
      console.log(`#${r.id} ${r.name} L${r.level}  현재 node_points: ${r.node_points}`);
    }
    const upd = await c.query(`UPDATE characters SET node_points = 99 WHERE name = $1 RETURNING id, node_points`, ['하유리']);
    for (const r of upd.rows) console.log(`✅ #${r.id} → node_points: ${r.node_points}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
