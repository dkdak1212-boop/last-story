// 으누(584) 황혼의 장화 모두 삭제 (장착+가방) → 새 +9 가방 지급
// 접두사: spd 50 / dodge 22 / exp_bonus_pct 10 (수치에 맞는 tier 자동 매칭)
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const CID = 584;
const ITEM_ID = 459;
const QUALITY = 31;
const ENH = 9;
const TARGET = { spd: 50, dodge: 22, exp_bonus_pct: 10 };

function pickTier(stat, value, prefixes, scale) {
  const cands = prefixes.filter(p => p.stat_key === stat);
  for (const p of cands) {
    const min = Math.round(p.min_val * scale);
    const max = Math.round(p.max_val * scale);
    if (value >= min && value <= max) return p;
  }
  return cands.reduce((b, p) =>
    Math.abs(value - p.max_val * scale) < Math.abs(value - b.max_val * scale) ? p : b);
}

(async () => {
  const it = await pool.query(`SELECT required_level FROM items WHERE id = $1`, [ITEM_ID]);
  const lv = it.rows[0].required_level;
  const scale = 0.4 + (Math.min(70, Math.max(1, lv)) / 70) * 1.4;

  const prefixes = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes`);
  const matched = {};
  for (const [stat, val] of Object.entries(TARGET)) {
    const p = pickTier(stat, val, prefixes.rows, scale);
    matched[stat] = p;
    console.log(`  ${stat}=${val} → id=${p.id} ${p.name} T${p.tier} (정상 ${(p.min_val*scale).toFixed(1)}~${(p.max_val*scale).toFixed(1)})`);
  }
  const prefixIds = Object.values(matched).map(p => p.id);

  // 1) 장착 황혼의 장화 삭제
  const eqDel = await pool.query(`DELETE FROM character_equipped WHERE character_id = $1 AND item_id = $2 RETURNING slot, prefix_stats`, [CID, ITEM_ID]);
  console.log(`\n장착 삭제: ${eqDel.rowCount}건`, eqDel.rows);

  // 2) 가방 황혼의 장화 모두 삭제
  const invDel = await pool.query(`DELETE FROM character_inventory WHERE character_id = $1 AND item_id = $2 RETURNING slot_index, prefix_stats`, [CID, ITEM_ID]);
  console.log(`가방 삭제: ${invDel.rowCount}건`, invDel.rows);

  // 3) 빈 슬롯 찾아 새 INSERT
  const usedR = await pool.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1`, [CID]);
  const used = new Set(usedR.rows.map(r => r.slot_index));
  let freeSlot = 0;
  while (used.has(freeSlot)) freeSlot++;

  await pool.query(
    `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
     VALUES ($1, $2, $3, 1, $4, $5::int[], $6::jsonb, $7)`,
    [CID, ITEM_ID, freeSlot, ENH, prefixIds, JSON.stringify(TARGET), QUALITY]
  );
  console.log(`\n슬롯 ${freeSlot}에 지급 완료`);

  const v = await pool.query(`SELECT slot_index, enhance_level, prefix_ids, prefix_stats, quality FROM character_inventory WHERE character_id = $1 AND slot_index = $2`, [CID, freeSlot]);
  console.log('결과:', v.rows[0]);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
