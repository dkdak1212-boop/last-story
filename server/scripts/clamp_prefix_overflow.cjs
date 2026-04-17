// DB 내 prefix_stats 오버 수치를 스캔해서 허용 max로 클램프
// - 각 (item, stat_key) 별 허용 max = sum(scaledMax of prefixIds for that key) + uniqueFixed[key]
// - 오버면 max 값으로 갱신

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}

(async () => {
  const pr = await pool.query(`SELECT id, stat_key, min_val, max_val FROM item_prefixes`);
  const prefixMap = new Map(pr.rows.map(r => [r.id, r]));

  async function processRows(rows, tableKind) {
    let clamped = 0;
    for (const row of rows) {
      const prefixIds = row.prefix_ids || [];
      const stats = row.prefix_stats || {};
      const uniqueFixed = (row.grade === 'unique' ? (row.unique_prefix_stats || {}) : {});
      const itemLv = row.required_level || 1;
      const scale = calcLevelScale(itemLv);

      const allowedMaxByKey = {};
      for (const pid of prefixIds) {
        const p = prefixMap.get(pid);
        if (!p) continue;
        const sm = Math.max(1, Math.round(p.max_val * scale));
        allowedMaxByKey[p.stat_key] = (allowedMaxByKey[p.stat_key] || 0) + sm;
      }
      for (const [k, v] of Object.entries(uniqueFixed)) {
        allowedMaxByKey[k] = (allowedMaxByKey[k] || 0) + v;
      }

      let dirty = false;
      const newStats = { ...stats };
      for (const [k, v] of Object.entries(stats)) {
        const allowed = allowedMaxByKey[k];
        if (allowed !== undefined && v > allowed) {
          newStats[k] = allowed;
          dirty = true;
        }
      }

      if (dirty) {
        clamped++;
        if (tableKind === 'inv') {
          await pool.query(
            `UPDATE character_inventory SET prefix_stats = $1::jsonb WHERE character_id=$2 AND slot_index=$3`,
            [JSON.stringify(newStats), row.character_id, row.slot_index]
          );
        } else {
          await pool.query(
            `UPDATE character_equipped SET prefix_stats = $1::jsonb WHERE character_id=$2 AND slot=$3`,
            [JSON.stringify(newStats), row.character_id, row.slot]
          );
        }
      }
    }
    return clamped;
  }

  console.log('인벤토리 스캔 중...');
  const invR = await pool.query(`
    SELECT ci.character_id, ci.slot_index, i.required_level, i.grade, i.unique_prefix_stats, ci.prefix_ids, ci.prefix_stats
    FROM character_inventory ci JOIN items i ON i.id = ci.item_id
    WHERE ci.prefix_ids IS NOT NULL AND array_length(ci.prefix_ids, 1) > 0
  `);
  const invCl = await processRows(invR.rows, 'inv');
  console.log(`  인벤 클램프: ${invCl}건`);

  console.log('장착 스캔 중...');
  const eqR = await pool.query(`
    SELECT ce.character_id, ce.slot, i.required_level, i.grade, i.unique_prefix_stats, ce.prefix_ids, ce.prefix_stats
    FROM character_equipped ce JOIN items i ON i.id = ce.item_id
    WHERE ce.prefix_ids IS NOT NULL AND array_length(ce.prefix_ids, 1) > 0
  `);
  const eqCl = await processRows(eqR.rows, 'eq');
  console.log(`  장착 클램프: ${eqCl}건`);

  console.log(`\n총 클램프: ${invCl + eqCl}건`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
