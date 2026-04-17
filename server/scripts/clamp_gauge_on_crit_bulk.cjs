// 재충전(gauge_on_crit_pct) 클램프 — 일괄 SQL 업데이트
// 이미 item_prefixes min/max 반감된 상태 가정
// 아이템 prefix_ids 와 required_level 로 새 max 계산해서 jsonb_set

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 2 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}

(async () => {
  // 현재 재충전 prefix 정의 (이미 반감됨)
  const pr = await pool.query(`SELECT id, max_val FROM item_prefixes WHERE stat_key='gauge_on_crit_pct'`);
  const maxById = new Map(pr.rows.map(r => [r.id, r.max_val]));
  console.log('재충전 prefix 수:', pr.rowCount, '새 max:', [...maxById.values()]);

  // 후보 수집 (인벤 + 장착) — 페이징
  async function fetchChunks(sql) {
    const all = [];
    const BATCH = 5000;
    let offset = 0;
    while (true) {
      const r = await pool.query(sql + ` OFFSET ${offset} LIMIT ${BATCH}`);
      all.push(...r.rows);
      if (r.rowCount < BATCH) break;
      offset += BATCH;
    }
    return all;
  }

  const inv = await fetchChunks(`
    SELECT ci.character_id, ci.slot_index, ci.prefix_ids, ci.prefix_stats, i.required_level
    FROM character_inventory ci JOIN items i ON i.id = ci.item_id
    WHERE ci.prefix_stats ? 'gauge_on_crit_pct'
    ORDER BY ci.character_id, ci.slot_index
  `);
  const eq = await fetchChunks(`
    SELECT ce.character_id, ce.slot, ce.prefix_ids, ce.prefix_stats, i.required_level
    FROM character_equipped ce JOIN items i ON i.id = ce.item_id
    WHERE ce.prefix_stats ? 'gauge_on_crit_pct'
    ORDER BY ce.character_id, ce.slot
  `);
  console.log(`후보: 인벤 ${inv.length} + 장착 ${eq.length}`);

  // 클램프 필요 row 만 선별 후 배치 UPDATE
  // VALUES 다중 형태: UPDATE ... FROM (VALUES (...),(...)) t(id, newVal) WHERE ...

  function buildBatches(rows, kind) {
    const batch = []; // {charId, slotKey, newVal}
    for (const row of rows) {
      const stats = row.prefix_stats || {};
      const v = stats.gauge_on_crit_pct;
      if (v == null) continue;
      const scale = calcLevelScale(row.required_level || 1);
      let sumNewMax = 0;
      for (const pid of (row.prefix_ids || [])) {
        const nm = maxById.get(pid);
        if (nm !== undefined) sumNewMax += Math.max(1, Math.round(nm * scale));
      }
      if (sumNewMax === 0) continue;
      if (v > sumNewMax) {
        batch.push({
          charId: row.character_id,
          slotKey: kind === 'inv' ? row.slot_index : row.slot,
          newVal: sumNewMax,
        });
      }
    }
    return batch;
  }

  const invBatch = buildBatches(inv, 'inv');
  const eqBatch = buildBatches(eq, 'eq');
  console.log(`클램프 필요: 인벤 ${invBatch.length}, 장착 ${eqBatch.length}`);

  // 인벤 배치 UPDATE — 500개씩 VALUES 조합
  async function updateBatch(batch, table, slotCol, slotType) {
    const CHUNK = 500;
    let done = 0;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const chunk = batch.slice(i, i + CHUNK);
      const valuesSql = chunk.map((_, j) =>
        `($${j*3+1}::int, $${j*3+2}::${slotType}, $${j*3+3}::int)`
      ).join(',');
      const params = [];
      for (const b of chunk) { params.push(b.charId, b.slotKey, b.newVal); }
      const sql = `
        UPDATE ${table}
        SET prefix_stats = jsonb_set(prefix_stats, '{gauge_on_crit_pct}', to_jsonb(v.new_val), false)
        FROM (VALUES ${valuesSql}) AS v(char_id, slot_key, new_val)
        WHERE ${table}.character_id = v.char_id
          AND ${table}.${slotCol} = v.slot_key
      `;
      const r = await pool.query(sql, params);
      done += r.rowCount;
      console.log(`  ${table}: ${done}/${batch.length}`);
    }
    return done;
  }

  const invDone = await updateBatch(invBatch, 'character_inventory', 'slot_index', 'int');
  const eqDone = await updateBatch(eqBatch, 'character_equipped', 'slot', 'text');
  console.log(`\n완료: 인벤 ${invDone}, 장착 ${eqDone}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
