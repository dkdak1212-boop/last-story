const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const CHAR_ID = 13; // 근느
const ITEM_ID = 701; // 야수의 송곳니 목걸이

(async () => {
  // T4 약점간파 접두사 ID 조회
  const prefR = await pool.query(`SELECT id, name, tier FROM item_prefixes WHERE stat_key = 'first_strike_pct' AND tier = 4`);
  if (prefR.rowCount === 0) { console.error('T4 약점간파 접두사 없음'); process.exit(1); }
  const t4Prefix = prefR.rows[0];
  console.log(`T4 접두사: ${t4Prefix.name} (id=${t4Prefix.id})`);

  // 유니크 고유 옵션 조회
  const itemR = await pool.query(`SELECT unique_prefix_stats FROM items WHERE id = $1`, [ITEM_ID]);
  const uniqueStats = itemR.rows[0]?.unique_prefix_stats || {};

  // T4 약점간파 값 (min~max 중 max)
  const t4ValR = await pool.query(`SELECT max_val FROM item_prefixes WHERE id = $1`, [t4Prefix.id]);
  const t4Val = t4ValR.rows[0]?.max_val || 20;

  // 합산 접두사 스탯: 유니크 고유 + T4 약점간파
  const prefixStats = { ...uniqueStats, first_strike_pct: (uniqueStats.first_strike_pct || 0) + t4Val };
  const prefixIds = [t4Prefix.id];
  const quality = Math.floor(Math.random() * 101);

  // 빈 슬롯 찾기
  const usedR = await pool.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1`, [CHAR_ID]);
  const used = new Set(usedR.rows.map(r => r.slot_index));
  let freeSlot = -1;
  for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
  if (freeSlot < 0) { console.error('인벤토리 가득'); process.exit(1); }

  // 인벤토리 추가 (드롭 로그 없이)
  await pool.query(
    `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity, enhance_level, prefix_ids, prefix_stats, quality)
     VALUES ($1, $2, $3, 1, 0, $4, $5::jsonb, $6)`,
    [CHAR_ID, ITEM_ID, freeSlot, prefixIds, JSON.stringify(prefixStats), quality]
  );

  console.log(`근느(id=${CHAR_ID})에게 지급 완료:`);
  console.log(`  야수의 송곳니 목걸이 (품질 ${quality}%)`);
  console.log(`  접두사: T4 ${t4Prefix.name} (first_strike_pct +${t4Val})`);
  console.log(`  합산 first_strike_pct: ${prefixStats.first_strike_pct}% (고유 ${uniqueStats.first_strike_pct || 0} + T4 ${t4Val})`);
  console.log(`  드롭 로그: 미등록`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
