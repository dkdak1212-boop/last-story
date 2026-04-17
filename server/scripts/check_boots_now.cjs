const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  const eq = await pool.query(`SELECT slot, item_id, enhance_level, prefix_ids, prefix_stats, quality FROM character_equipped WHERE character_id = 584 AND slot='boots'`);
  console.log('장착 boots:', eq.rows);
  const inv = await pool.query(`SELECT slot_index, item_id, enhance_level, prefix_ids, prefix_stats, quality FROM character_inventory WHERE character_id = 584 AND item_id = 459`);
  console.log('가방 황혼의 장화:', inv.rows);
  await pool.end();
})();
