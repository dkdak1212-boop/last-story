const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='node_definitions' ORDER BY ordinal_position`);
    console.log('node_definitions cols:', cols.rows.map(r=>r.column_name).join(', '));
    const r = await c.query(`SELECT zone, tier, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='rogue' GROUP BY zone, tier ORDER BY zone, tier`);
    console.log('\nrogue zone/tier 분포:');
    for (const row of r.rows) console.log(`  ${row.zone}/${row.tier}: ${row.cnt}개`);
    const ids = await c.query(`SELECT MIN(id), MAX(id), COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='rogue'`);
    console.log(`\nrogue id 범위: ${ids.rows[0].min}~${ids.rows[0].max}, 총 ${ids.rows[0].cnt}`);
    const maxId = await c.query(`SELECT MAX(id) AS maxid FROM node_definitions`);
    console.log(`전체 max id: ${maxId.rows[0].maxid}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
