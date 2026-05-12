const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    // 다른 테이블의 class_name CHECK 확인
    const r = await c.query(`
      SELECT t.relname as tbl, c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%warrior%'
        AND pg_get_constraintdef(c.oid) ILIKE '%summoner%'
    `);
    console.log('warrior+summoner 포함된 CHECK constraints:');
    for (const row of r.rows) {
      const hasArcher = row.def.includes('archer');
      console.log(`  ${hasArcher ? '✓' : '✗'} ${row.tbl}.${row.conname}: ${row.def.slice(0, 200)}`);
    }
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
