const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const sql = fs.readFileSync('../db/migrations/082_extract_unidentified_craft.sql', 'utf8');
    // execute as one block
    await pool.query(sql);
    // record in _migrations
    await pool.query(`INSERT INTO _migrations (name) VALUES ('082_extract_unidentified_craft.sql') ON CONFLICT DO NOTHING`);
    console.log('OK migration 082 applied');
    const items = await pool.query(`SELECT id, name FROM items WHERE id IN (910, 911) ORDER BY id`);
    console.log('new items:', items.rows);
    const recs = await pool.query(`SELECT id, name, material_qty, result_type FROM craft_recipes WHERE id IN (14, 15)`);
    console.log('new recipes:', recs.rows);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  await pool.end();
})();
