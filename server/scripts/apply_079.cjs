const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync(__dirname + '/../../db/migrations/079_enhance_30_pity.sql', 'utf8');
const c = new Client({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway' });
(async () => {
  await c.connect();
  await c.query(sql);
  const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name IN ('character_inventory', 'character_equipped') AND column_name = 'enhance_pity' ORDER BY table_name`);
  console.log('enhance_pity 컬럼 존재 테이블:', r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
