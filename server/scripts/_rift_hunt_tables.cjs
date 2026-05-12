const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    for (const t of ['combat_sessions','item_drop_log']) {
      const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
      console.log(`${t}:`, cols.rows.map(r=>r.column_name).join(', '));
    }
    console.log('\n— combat_sessions sample row');
    const s = await c.query(`SELECT * FROM combat_sessions LIMIT 1`);
    if (s.rowCount>0) console.log(s.rows[0]);
    console.log('\n— combat_sessions row count');
    const n = await c.query(`SELECT count(*)::int AS n FROM combat_sessions`);
    console.log(n.rows[0]);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
