const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const c = await pool.query(`SELECT id, name, class_name, level, user_id FROM characters WHERE id = 431`);
  console.log('캐릭터:', c.rows);

  const eq = await pool.query(
    `SELECT ce.slot, i.id AS item_id, i.name AS item_name, i.grade, ce.enhance_level,
            ce.prefix_ids, ce.prefix_stats, ce.quality
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.character_id = 431
     ORDER BY ce.slot`
  );
  console.log('\n[장착]');
  for (const r of eq.rows) {
    console.log(`  ${r.slot} (item ${r.item_id}) ${r.item_name} +${r.enhance_level} [${r.grade}] 품질${r.quality}`);
    console.log(`    prefix_ids: ${JSON.stringify(r.prefix_ids)}`);
    console.log(`    prefix_stats: ${JSON.stringify(r.prefix_stats)}`);
  }

  // 모든 prefix id 모아서 정의 조회
  const allIds = new Set();
  eq.rows.forEach(r => (r.prefix_ids || []).forEach(id => allIds.add(id)));
  if (allIds.size > 0) {
    const p = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes WHERE id = ANY($1::int[]) ORDER BY id`, [[...allIds]]);
    console.log('\n[접두사 정의]');
    p.rows.forEach(r => console.log(`  id=${r.id} ${r.name} T${r.tier} ${r.stat_key} (${r.min_val}~${r.max_val})`));
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
