const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, name, description, zone, tier, cost, class_exclusive, effects FROM node_definitions WHERE zone = 'core' ORDER BY class_exclusive NULLS FIRST, id`);
    console.log(`총 ${r.rowCount} core 노드:`);
    for (const row of r.rows) {
      console.log(`\n#${row.id} [${row.class_exclusive || '공용'}] ${row.name} (${row.tier}, cost=${row.cost})`);
      console.log(`  설명: ${row.description}`);
      console.log(`  effects: ${JSON.stringify(row.effects)}`);
    }
  } finally { await c.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });
