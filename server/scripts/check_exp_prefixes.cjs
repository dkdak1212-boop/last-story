const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // exp_bonus_pct 모든 접두사
  const p = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes WHERE stat_key = 'exp_bonus_pct' ORDER BY tier`);
  console.log('exp_bonus_pct 접두사:', p.rows);

  // 황혼의 장화 아이템 정보
  const it = await pool.query(`SELECT id, name, type, slot, grade, required_level, stats FROM items WHERE name LIKE '%황혼의 장화%'`);
  console.log('\n황혼의 장화:', it.rows);

  // 으누의 장착 boots
  const eq = await pool.query(
    `SELECT ce.*, i.name AS item_name, i.required_level FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = 584 AND ce.slot = 'boots'`
  );
  console.log('\n장착 boots:', eq.rows);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
