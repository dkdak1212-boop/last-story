const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT zone, tier, MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='summoner' GROUP BY zone, tier ORDER BY zone, tier`);
    for (const row of r.rows) console.log(`  ${row.zone}/${row.tier}: x ${row.minx}~${row.maxx}, y ${row.miny}~${row.maxy} (${row.cnt}개)`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
