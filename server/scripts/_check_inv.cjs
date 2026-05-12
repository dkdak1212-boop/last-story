const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='character_inventory' ORDER BY ordinal_position`);
    for (const row of r.rows) console.log(`  ${row.column_name} : ${row.data_type}`);
    const sample = await c.query(`SELECT prefix_ids, prefix_stats FROM character_inventory WHERE prefix_ids IS NOT NULL LIMIT 1`);
    if (sample.rowCount > 0) console.log('\nsample prefix_ids:', JSON.stringify(sample.rows[0].prefix_ids), 'prefix_stats:', JSON.stringify(sample.rows[0].prefix_stats));
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
