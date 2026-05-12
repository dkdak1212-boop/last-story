const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT id, name, description, effects FROM node_definitions WHERE effects::text ILIKE '%paragon_heal_to_damage%'`);
    for (const row of r.rows) {
      console.log(`#${row.id} ${row.name}`);
      console.log(`  effects: ${JSON.stringify(row.effects)}`);
      console.log(`  desc: ${row.description}`);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
