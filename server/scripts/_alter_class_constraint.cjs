const { Client } = require('pg');
const DB_URL = 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway';
async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try {
    await c.query(`ALTER TABLE characters DROP CONSTRAINT characters_class_name_check`);
    console.log('✓ 기존 check constraint 제거');
    await c.query(`ALTER TABLE characters ADD CONSTRAINT characters_class_name_check
      CHECK (class_name IN ('warrior','mage','cleric','rogue','summoner','archer'))`);
    console.log('✓ archer 포함 새 constraint 추가');
    // 검증
    const r = await c.query(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = 'characters' AND c.conname = 'characters_class_name_check'`);
    console.log('  현재 정의:', r.rows[0].def);
  } finally { await c.end(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
