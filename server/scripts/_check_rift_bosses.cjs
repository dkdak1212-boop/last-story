const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='monsters' ORDER BY ordinal_position`);
    console.log('monsters cols:', cols.rows.map(r=>r.column_name).join(', '));
    const r = await c.query(`SELECT id, name, level, exp_reward, gold_reward FROM monsters WHERE name IN ('차원의 잔재','시공의 수호자','균열의 군주') OR name LIKE '%잔재%' OR name LIKE '%수호자%' OR name LIKE '%군주%' ORDER BY level, id`);
    console.log('\n매칭:');
    for (const row of r.rows) console.log(`  #${row.id} ${row.name} L${row.level} exp=${row.exp_reward} gold=${row.gold_reward}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
