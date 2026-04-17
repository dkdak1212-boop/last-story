// 으누(584) 황혼의 장화 +9 복원
// 기존 장착 장비 삭제 + 새 황혼의 장화 +9 가방에 지급
// 품질 31, 접두사: spd 74 / dodge 22 / exp_bonus_pct 13
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const CID = 584;
const ITEM_ID = 459; // 황혼의 장화
const QUALITY = 31;
const ENH = 9;

// 사용자 요구 수치
const TARGET = {
  spd: 74,
  dodge: 22,
  exp_bonus_pct: 13,
};

// 수치에 맞는 tier 자동 매칭 (level 75, scale 1.8)
function pickTier(stat, value, prefixes, scale) {
  // 가장 가까운 max값을 갖는 tier (또는 정확히 들어맞는 범위)
  const candidates = prefixes.filter(p => p.stat_key === stat);
  // tier별 [min, max] × scale
  for (const p of candidates) {
    const min = Math.round(p.min_val * scale);
    const max = Math.round(p.max_val * scale);
    if (value >= min && value <= max) return p;
  }
  // 범위 안 맞으면 max에 가장 가까운 것
  return candidates.reduce((best, p) => {
    const max = p.max_val * scale;
    return Math.abs(value - max) < Math.abs(value - best.max_val * scale) ? p : best;
  });
}

(async () => {
  // 1) 황혼의 장화 정보 확인
  const it = await pool.query(`SELECT id, name, required_level FROM items WHERE id = $1`, [ITEM_ID]);
  console.log('아이템:', it.rows[0]);
  const itemLv = it.rows[0].required_level;
  const scale = 0.4 + (Math.min(70, Math.max(1, itemLv)) / 70) * 1.4;
  console.log('levelScale:', scale);

  // 2) prefix 매칭
  const prefixes = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes`);
  const matched = {};
  for (const [stat, val] of Object.entries(TARGET)) {
    const p = pickTier(stat, val, prefixes.rows, scale);
    matched[stat] = p;
    console.log(`  ${stat}=${val} → id=${p.id} ${p.name} T${p.tier} (${p.min_val}~${p.max_val} × ${scale.toFixed(2)} = ${(p.min_val*scale).toFixed(1)}~${(p.max_val*scale).toFixed(1)})`);
  }
  const prefixIds = Object.values(matched).map(p => p.id);
  const prefixStats = { ...TARGET };

  // 3) 기존 장착 장화 삭제
  const before = await pool.query(`SELECT * FROM character_equipped WHERE character_id = $1 AND slot = 'boots'`, [CID]);
  console.log('\n삭제 전 장착 boots:', before.rows[0]);
  const del = await pool.query(`DELETE FROM character_equipped WHERE character_id = $1 AND slot = 'boots'`, [CID]);
  console.log(`DELETE rowCount: ${del.rowCount}`);

  // 4) 새 황혼의 장화 가방 빈 슬롯에 지급
  const usedSlotsR = await pool.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1 ORDER BY slot_index`, [CID]);
  const used = new Set(usedSlotsR.rows.map(r => r.slot_index));
  let freeSlot = 0;
  while (used.has(freeSlot)) freeSlot++;
  console.log(`새 빈 슬롯: ${freeSlot}`);

  await pool.query(
    `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
     VALUES ($1, $2, $3, 1, $4, $5::int[], $6::jsonb, $7)`,
    [CID, ITEM_ID, freeSlot, ENH, prefixIds, JSON.stringify(prefixStats), QUALITY]
  );
  console.log('새 장화 지급 완료');

  // 5) 검증
  const verify = await pool.query(
    `SELECT slot_index, item_id, enhance_level, prefix_ids, prefix_stats, quality
     FROM character_inventory WHERE character_id = $1 AND item_id = $2 ORDER BY slot_index DESC LIMIT 1`,
    [CID, ITEM_ID]
  );
  console.log('지급된 장화:', verify.rows[0]);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
