// 재충전(gauge_on_crit_pct) 접두사 수치 반감 + 기존 아이템 클램프

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}

(async () => {
  // 1. 현재 정의 출력
  const before = await pool.query(`SELECT id, name, tier, min_val, max_val FROM item_prefixes WHERE stat_key='gauge_on_crit_pct' ORDER BY tier`);
  console.log('=== 변경 전 ===');
  for (const r of before.rows) console.log(`  T${r.tier} [${r.name}] ${r.min_val}~${r.max_val}`);

  // 2. min/max 반감 (round)
  const updated = [];
  for (const r of before.rows) {
    const newMin = Math.max(1, Math.round(r.min_val / 2));
    const newMax = Math.max(newMin, Math.round(r.max_val / 2));
    await pool.query(`UPDATE item_prefixes SET min_val=$1, max_val=$2 WHERE id=$3`, [newMin, newMax, r.id]);
    updated.push({ ...r, newMin, newMax });
  }
  console.log('\n=== 변경 후 ===');
  for (const r of updated) console.log(`  T${r.tier} [${r.name}] ${r.min_val}~${r.max_val} → ${r.newMin}~${r.newMax}`);

  // 3. 기존 아이템 클램프 — 새 max 초과분 자르기
  const ids = before.rows.map(r => r.id);
  const newMaxById = new Map(updated.map(r => [r.id, r.newMax]));

  // 페이징 fetch
  async function fetchChunks(sql, params) {
    const all = [];
    const BATCH = 5000;
    let offset = 0;
    while (true) {
      const r = await pool.query(sql + ` OFFSET ${offset} LIMIT ${BATCH}`, params);
      all.push(...r.rows);
      if (r.rowCount < BATCH) break;
      offset += BATCH;
    }
    return all;
  }

  const inv = await fetchChunks(
    `SELECT ci.character_id, ci.slot_index, ci.prefix_ids, ci.prefix_stats, i.required_level
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.prefix_stats ? 'gauge_on_crit_pct'
     ORDER BY ci.character_id, ci.slot_index`, []
  );
  const eq = await fetchChunks(
    `SELECT ce.character_id, ce.slot, ce.prefix_ids, ce.prefix_stats, i.required_level
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.prefix_stats ? 'gauge_on_crit_pct'
     ORDER BY ce.character_id, ce.slot`, []
  );
  console.log(`\n클램프 대상: 인벤 ${inv.length} + 장착 ${eq.length}`);

  async function clampRows(rows, table, slotKey) {
    let n = 0;
    for (const row of rows) {
      const stats = row.prefix_stats || {};
      const v = stats.gauge_on_crit_pct;
      if (v == null) continue;
      const scale = calcLevelScale(row.required_level || 1);
      // 같은 stat_key를 가진 prefix_ids의 새 max 합산
      let sumNewMax = 0;
      for (const pid of (row.prefix_ids || [])) {
        const nm = newMaxById.get(pid);
        if (nm !== undefined) sumNewMax += Math.max(1, Math.round(nm * scale));
      }
      if (sumNewMax === 0) continue; // 해당 아이템에 재충전 prefix 없음
      if (v > sumNewMax) {
        stats.gauge_on_crit_pct = sumNewMax;
        await pool.query(
          `UPDATE ${table} SET prefix_stats=$1::jsonb WHERE character_id=$2 AND ${slotKey}=$3`,
          [JSON.stringify(stats), row.character_id, row[slotKey]]
        );
        n++;
      }
    }
    return n;
  }
  const cInv = await clampRows(inv, 'character_inventory', 'slot_index');
  const cEq = await clampRows(eq, 'character_equipped', 'slot');
  console.log(`클램프: 인벤 ${cInv}, 장착 ${cEq}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
