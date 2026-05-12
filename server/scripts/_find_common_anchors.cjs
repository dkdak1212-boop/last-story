const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, name, position_x as x, position_y as y, effects FROM node_definitions WHERE class_exclusive IS NULL AND zone='core' ORDER BY id LIMIT 20`);
    for (const row of r.rows) console.log(`#${row.id} (${row.x},${row.y}) ${row.name} :: ${JSON.stringify(row.effects).slice(0,100)}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
