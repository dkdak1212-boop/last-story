const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='items' ORDER BY ordinal_position`);
    console.log('items cols:', cols.rows.map(r=>r.column_name).join(', '));
    const items = await c.query(
      `SELECT id, name, description FROM items
        WHERE name ILIKE '%T3%접두사%' OR name ILIKE '%3옵%' OR name ILIKE '%품질%' OR name ILIKE '%추첨%' OR name ILIKE '%굴림%'
        ORDER BY id`
    );
    console.log('\n매칭:');
    for (const r of items.rows) {
      console.log(`  id=${r.id}  ${r.name}`);
      if (r.description) console.log(`    ${r.description.slice(0,160)}`);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
