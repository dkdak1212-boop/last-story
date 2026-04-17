// 으누(584) 장착 황혼의 장화 삭제 + 새 황혼의 장화 +9 가방 지급
// 접두사: [T1] 회피 22 / [T2] 경험치 13 (사용자 명시 — 일반 굴림 캡 무시)
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const CID = 584;
const ITEM_ID = 459;
const QUALITY = 31;
const ENH = 9;

// 사용자 명시: T1 dodge id=29, T2 exp_bonus_pct id=66
const PREFIX_IDS = [29, 66];
const PREFIX_STATS = { dodge: 22, exp_bonus_pct: 13 };

(async () => {
  // 검증용: tier 확인
  const p = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes WHERE id = ANY($1::int[]) ORDER BY id`, [PREFIX_IDS]);
  console.log('적용 접두사:');
  p.rows.forEach(r => console.log(`  id=${r.id} ${r.name} T${r.tier} ${r.stat_key} (정상범위 ${r.min_val}~${r.max_val})`));

  // 1) 기존 장착 boots 삭제
  const before = await pool.query(`SELECT * FROM character_equipped WHERE character_id = $1 AND slot = 'boots'`, [CID]);
  console.log('\n삭제 전 장착 boots:', before.rows[0]);
  const del = await pool.query(`DELETE FROM character_equipped WHERE character_id = $1 AND slot = 'boots'`, [CID]);
  console.log(`DELETE rowCount: ${del.rowCount}`);

  // 2) 가방 빈 슬롯 찾기
  const usedR = await pool.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1 ORDER BY slot_index`, [CID]);
  const used = new Set(usedR.rows.map(r => r.slot_index));
  let freeSlot = 0;
  while (used.has(freeSlot)) freeSlot++;
  console.log(`가방 빈 슬롯: ${freeSlot}`);

  // 3) 새 황혼의 장화 INSERT
  await pool.query(
    `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
     VALUES ($1, $2, $3, 1, $4, $5::int[], $6::jsonb, $7)`,
    [CID, ITEM_ID, freeSlot, ENH, PREFIX_IDS, JSON.stringify(PREFIX_STATS), QUALITY]
  );
  console.log('새 황혼의 장화 +9 지급 완료');

  // 4) 검증
  const v = await pool.query(
    `SELECT slot_index, item_id, enhance_level, prefix_ids, prefix_stats, quality
     FROM character_inventory WHERE character_id = $1 AND slot_index = $2`,
    [CID, freeSlot]
  );
  console.log('지급된 장화:', v.rows[0]);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
