const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const sql = fs.readFileSync('../db/migrations/083_split_unidentified_rift_recipes.sql', 'utf8');
    await pool.query(sql);
    await pool.query(`INSERT INTO _migrations (name) VALUES ('083_split_unidentified_rift_recipes.sql') ON CONFLICT DO NOTHING`);
    console.log('OK migration 083 applied');
    const recs = await pool.query(`SELECT id, name, material_item_id, material_qty, result_item_ids FROM craft_recipes WHERE id BETWEEN 14 AND 17 ORDER BY id`);
    console.log('recipes 14-17:');
    recs.rows.forEach(r => console.log(`  [${r.id}] ${r.name} — material ${r.material_item_id}×${r.material_qty} → ${r.result_item_ids}`));
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
  await pool.end();
})();
