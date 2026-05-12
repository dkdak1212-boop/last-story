const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`
      SELECT id, name, zone, tier, cost, position_x as x, position_y as y, prerequisites
      FROM node_definitions WHERE class_exclusive='rogue' ORDER BY zone, tier, id LIMIT 30
    `);
    for (const row of r.rows) {
      const prereq = Array.isArray(row.prerequisites) ? row.prerequisites.join(',') : row.prerequisites;
      console.log(`#${row.id} ${row.zone}/${row.tier} (${row.x},${row.y}) ${row.name}  prereq=[${prereq}]`);
    }
    // 위치 범위
    const range = await c.query(`SELECT zone, MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive='rogue' GROUP BY zone`);
    console.log('\nrogue 위치 범위:');
    for (const row of range.rows) console.log(`  ${row.zone}: x ${row.minx}~${row.maxx}, y ${row.miny}~${row.maxy} (${row.cnt}개)`);
    // 공용 노드도 확인
    const common = await c.query(`SELECT zone, MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive IS NULL AND zone='core' GROUP BY zone`);
    console.log('\n공용 core 노드 위치:');
    for (const row of common.rows) console.log(`  ${row.zone}: x ${row.minx}~${row.maxx}, y ${row.miny}~${row.maxy} (${row.cnt}개)`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
