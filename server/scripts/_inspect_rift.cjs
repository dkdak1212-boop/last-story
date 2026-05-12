const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  try {
    const sets = await pool.query(`SELECT * FROM item_sets WHERE id = 4`);
    console.log('SET 4:', JSON.stringify(sets.rows[0], null, 2));
    const items = await pool.query(`SELECT id, name, slot, grade FROM items WHERE set_id = 4 ORDER BY slot, id`);
    console.log('SET 4 items:', items.rows);
    const maxIt = await pool.query(`SELECT MAX(id) AS m FROM items`);
    console.log('max item id:', maxIt.rows[0].m);
    const recipes = await pool.query(`SELECT id, name, material_item_id, material_qty, set_id FROM craft_recipes WHERE set_id = 4 ORDER BY id`);
    console.log('SET 4 recipes:', recipes.rows);
    // Check craft_recipes columns
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='craft_recipes' ORDER BY ordinal_position`);
    console.log('craft_recipes cols:', cols.rows.map(r => r.column_name).join(', '));
    // Check character_inventory cols
    const cic = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='character_inventory' ORDER BY ordinal_position`);
    console.log('character_inventory cols:', cic.rows.map(r => r.column_name).join(', '));
  } finally { await pool.end(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
