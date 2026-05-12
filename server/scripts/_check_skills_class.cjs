const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT t.relname as tbl, c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE c.contype = 'c' AND t.relname IN ('skills','node_definitions','character_skills')`);
    console.log('skills/node_definitions/character_skills CHECK 제약:');
    for (const row of r.rows) {
      console.log(`  ${row.tbl}.${row.conname}: ${row.def.slice(0, 150)}`);
    }
    // 시도된 archer 캐릭 있는지 확인
    const arch = await c.query(`SELECT id, name, class_name, level FROM characters WHERE class_name = 'archer' LIMIT 5`);
    console.log(`\n현재 archer 캐릭: ${arch.rowCount}`);
    for (const row of arch.rows) console.log(`  #${row.id} ${row.name} L${row.level}`);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
