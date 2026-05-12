const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'characters'`);
    for (const row of r.rows) console.log(`  ${row.conname}: ${row.def}`);
    // Test insert directly
    console.log('\nattempting test INSERT (rolled back):');
    await c.query('BEGIN');
    try {
      const ins = await c.query(`INSERT INTO characters (user_id, name, class_name, level, exp, gold, hp, max_hp, node_points, stats, location, last_online_at) VALUES (1, 'test_archer_xx', 'archer', 1, 0, 100, 200, 200, 0, '{"str":6,"dex":18,"int":5,"vit":14,"spd":200,"cri":25}', 'village', NOW()) RETURNING id`);
      console.log('  OK insert id=', ins.rows[0].id);
      await c.query('ROLLBACK');
    } catch (e) {
      await c.query('ROLLBACK');
      console.log('  FAIL:', e.message);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
