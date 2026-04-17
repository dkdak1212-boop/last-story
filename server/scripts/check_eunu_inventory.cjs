const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  const c = await pool.query(`SELECT id, name, class_name, level, user_id FROM characters WHERE name = '으누'`);
  console.log('캐릭터:', c.rows);
  if (c.rowCount === 0) { await pool.end(); return; }
  const cid = c.rows[0].id;

  // 인벤토리 + 장착 — 접두사 있는 것만
  const inv = await pool.query(
    `SELECT ci.id AS slot_id, ci.slot_index, i.name AS item_name, i.id AS item_id, ci.enhance_level,
            ci.prefix_ids, ci.prefix_stats, ci.quality
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1 AND ci.prefix_ids IS NOT NULL AND array_length(ci.prefix_ids,1) > 0
     ORDER BY ci.slot_index`,
    [cid]
  );
  console.log('\n[가방 — 접두사 있는 장비]');
  inv.rows.forEach(r => {
    console.log(`  slot${r.slot_index} ${r.item_name} +${r.enhance_level} | ids=${JSON.stringify(r.prefix_ids)} stats=${JSON.stringify(r.prefix_stats)}`);
  });

  const eq = await pool.query(
    `SELECT ce.slot, i.name AS item_name, i.id AS item_id, ce.enhance_level,
            ce.prefix_ids, ce.prefix_stats, ce.quality
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = $1 AND ce.prefix_ids IS NOT NULL AND array_length(ce.prefix_ids,1) > 0`,
    [cid]
  );
  console.log('\n[장착 — 접두사 있는 장비]');
  eq.rows.forEach(r => {
    console.log(`  ${r.slot} ${r.item_name} +${r.enhance_level} | ids=${JSON.stringify(r.prefix_ids)} stats=${JSON.stringify(r.prefix_stats)}`);
  });

  // 접두사 정의 조회 (롤 가능 범위 표시)
  const allIds = new Set();
  inv.rows.concat(eq.rows).forEach(r => (r.prefix_ids || []).forEach(id => allIds.add(id)));
  if (allIds.size > 0) {
    const p = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes WHERE id = ANY($1::int[])`, [[...allIds]]);
    console.log('\n[관련 접두사 정의]');
    p.rows.forEach(r => console.log(`  id=${r.id} ${r.name} T${r.tier} ${r.stat_key} ${r.min_val}~${r.max_val}`));
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
