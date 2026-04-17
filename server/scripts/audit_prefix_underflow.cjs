// 언더 수치(tier 하한 미달) 및 tier 정의 외 값 감사
// - 각 접두사 stat_key 합 < scaledMin → 언더
// - value == 0 or null → 비정상

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}

(async () => {
  const pr = await pool.query(`SELECT id, stat_key, tier, min_val, max_val FROM item_prefixes`);
  const prefixMap = new Map(pr.rows.map(r => [r.id, r]));

  // 페이징 — Railway 연결 리셋 방지
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
  const invRows = await fetchChunks(
    `SELECT 'inv' kind, ci.character_id, ci.slot_index::text slot_key, i.name item_name, i.required_level,
            i.grade, i.unique_prefix_stats, ci.prefix_ids, ci.prefix_stats
     FROM character_inventory ci JOIN items i ON i.id = ci.item_id
     WHERE ci.prefix_ids IS NOT NULL AND array_length(ci.prefix_ids, 1) > 0
     ORDER BY ci.character_id, ci.slot_index`, []
  );
  const eqRows = await fetchChunks(
    `SELECT 'eq' kind, ce.character_id, ce.slot::text slot_key, i.name item_name, i.required_level,
            i.grade, i.unique_prefix_stats, ce.prefix_ids, ce.prefix_stats
     FROM character_equipped ce JOIN items i ON i.id = ce.item_id
     WHERE ce.prefix_ids IS NOT NULL AND array_length(ce.prefix_ids, 1) > 0
     ORDER BY ce.character_id, ce.slot`, []
  );
  const items = { rows: [...invRows, ...eqRows], rowCount: invRows.length + eqRows.length };
  console.log(`스캔: 인벤 ${invRows.length} + 장착 ${eqRows.length} = ${items.rowCount}개`);

  let underCount = 0, orphanKeyCount = 0, zeroCount = 0;
  const underSamples = [];
  const orphanSamples = [];

  for (const row of items.rows) {
    const prefixIds = row.prefix_ids || [];
    const stats = row.prefix_stats || {};
    const uniqueFixed = row.grade === 'unique' ? (row.unique_prefix_stats || {}) : {};
    const lv = row.required_level || 1;
    const scale = calcLevelScale(lv);

    const allowedMinByKey = {};
    const prefixKeys = new Set();
    for (const pid of prefixIds) {
      const p = prefixMap.get(pid);
      if (!p) continue;
      const sm = Math.max(1, Math.round(p.min_val * scale));
      allowedMinByKey[p.stat_key] = (allowedMinByKey[p.stat_key] || 0) + sm;
      prefixKeys.add(p.stat_key);
    }
    for (const [k, v] of Object.entries(uniqueFixed)) {
      allowedMinByKey[k] = (allowedMinByKey[k] || 0) + v;
      prefixKeys.add(k);
    }

    for (const [k, v] of Object.entries(stats)) {
      // 0 또는 음수 값
      if (v <= 0) {
        zeroCount++;
        continue;
      }
      // prefixIds/unique에 없는 고아 key (상한도 하한도 정의 없음)
      if (!prefixKeys.has(k)) {
        orphanKeyCount++;
        if (orphanSamples.length < 10) {
          orphanSamples.push({ ...row, key: k, value: v });
        }
        continue;
      }
      // 언더 체크
      const min = allowedMinByKey[k];
      if (min !== undefined && v < min) {
        underCount++;
        if (underSamples.length < 15) {
          underSamples.push({
            kind: row.kind, char: row.character_id, slot: row.slot_key, item: row.item_name,
            lv, grade: row.grade, key: k, value: v, min, shortage: min - v,
            unique: uniqueFixed[k] || 0, prefixIds,
          });
        }
      }
    }
  }

  console.log(`\n=== 감사 결과 ===`);
  console.log(`  언더 (min 미달): ${underCount}건`);
  console.log(`  0 또는 음수 값: ${zeroCount}건`);
  console.log(`  고아 stat_key (prefix/unique에 정의 없음): ${orphanKeyCount}건`);

  if (underSamples.length > 0) {
    console.log(`\n[언더 샘플]`);
    for (const s of underSamples) {
      console.log(`  [${s.kind} char${s.char} slot${s.slot}] ${s.item} (lv${s.lv} ${s.grade}) ${s.key}=${s.value} (min ${s.min}, 부족 -${s.shortage}) unique=${s.unique} pids=${JSON.stringify(s.prefixIds)}`);
    }
  }
  if (orphanSamples.length > 0) {
    console.log(`\n[고아 key 샘플]`);
    for (const s of orphanSamples) {
      console.log(`  [${s.kind} char${s.character_id} slot${s.slot_key}] ${s.item_name} ${s.key}=${s.value} pids=${JSON.stringify(s.prefix_ids)}`);
    }
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
