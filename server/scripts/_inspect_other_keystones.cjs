const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT class_exclusive, id, name, position_x AS x, position_y AS y FROM node_definitions WHERE class_exclusive IN ('warrior','mage','cleric','rogue','summoner') AND zone='core' AND tier='huge' ORDER BY class_exclusive, id`);
    let cur = '';
    for (const row of r.rows) {
      if (cur !== row.class_exclusive) { cur = row.class_exclusive; console.log(`\n[${cur}] huge keystones:`); }
      console.log(`  #${row.id} (${row.x}, ${row.y}) ${row.name}`);
    }
    // medium/large 클러스터 위치 확인
    console.log('\n[직업별 small/medium/large 클러스터]');
    const c2 = await c.query(`SELECT class_exclusive, MIN(position_x) AS minx, MAX(position_x) AS maxx, MIN(position_y) AS miny, MAX(position_y) AS maxy FROM node_definitions WHERE class_exclusive IN ('warrior','mage','cleric','rogue','summoner') AND zone='core' AND tier IN ('small','medium','large') GROUP BY class_exclusive`);
    for (const row of c2.rows) console.log(`  ${row.class_exclusive}: x ${row.minx}~${row.maxx}, y ${row.miny}~${row.maxy}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
