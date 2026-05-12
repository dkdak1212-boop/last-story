const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 소환사 전용 노드 상세 — 위치별 분포
    const r = await c.query(`SELECT tier, position_x AS x, position_y AS y, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='summoner' GROUP BY tier, position_x, position_y ORDER BY tier, position_x, position_y LIMIT 50`);
    console.log('소환사 노드 좌표 분포 (tier별 일부):');
    for (const row of r.rows) console.log(`  ${row.tier} (${row.x},${row.y}) ×${row.cnt}`);
    // tier당 총 개수
    const counts = await c.query(`SELECT tier, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='summoner' GROUP BY tier`);
    console.log('\n소환사 tier 분포:');
    for (const row of counts.rows) console.log(`  ${row.tier}: ${row.cnt}`);
    // huge 위치들
    const huges = await c.query(`SELECT id, name, position_x AS x, position_y AS y FROM node_definitions WHERE class_exclusive='summoner' AND tier='huge' ORDER BY id`);
    console.log('\n소환사 huge 키스톤:');
    for (const row of huges.rows) console.log(`  #${row.id} (${row.x},${row.y}) ${row.name}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
