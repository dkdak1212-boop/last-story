// DB의 prefix_stats가 raw(강화전) 저장인지 scaled(강화후) 저장인지 확인
// 강화 레벨 > 3 인 아이템 샘플링해서 현재 값 vs raw-max 비교
// 만약 prefix_stats가 scaled라면 값이 raw-max의 1.5배 이상 나와야 함

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}

(async () => {
  const pr = await pool.query(`SELECT id, stat_key, min_val, max_val FROM item_prefixes`);
  const prefixMap = new Map(pr.rows.map(r => [r.id, r]));

  // 강화 > 3 인 장비
  const rows = await pool.query(`
    SELECT ci.character_id, ci.slot_index, ci.enhance_level, i.required_level, i.grade, i.unique_prefix_stats,
           ci.prefix_ids, ci.prefix_stats, i.name
    FROM character_inventory ci JOIN items i ON i.id = ci.item_id
    WHERE ci.enhance_level > 3 AND array_length(ci.prefix_ids, 1) > 0
    UNION ALL
    SELECT ce.character_id, -1 slot_index, ce.enhance_level, i.required_level, i.grade, i.unique_prefix_stats,
           ce.prefix_ids, ce.prefix_stats, i.name
    FROM character_equipped ce JOIN items i ON i.id = ce.item_id
    WHERE ce.enhance_level > 3 AND array_length(ce.prefix_ids, 1) > 0
    LIMIT 200
  `);
  console.log(`샘플 ${rows.rowCount}개 (강화 +3 초과 장비)`);

  // 통계: 저장값/raw-max 비율
  const buckets = { '<=1.0 raw 같음': 0, '1.0~1.2': 0, '1.2~1.5': 0, '1.5~2.0': 0, '>2.0': 0 };
  const samples = [];

  for (const row of rows.rows) {
    const scale = calcLevelScale(row.required_level || 1);
    const prefixIds = row.prefix_ids || [];
    const stats = row.prefix_stats || {};
    const uniqueFixed = row.grade === 'unique' ? (row.unique_prefix_stats || {}) : {};

    const maxByKey = {};
    for (const pid of prefixIds) {
      const p = prefixMap.get(pid);
      if (!p) continue;
      const sm = Math.max(1, Math.round(p.max_val * scale));
      maxByKey[p.stat_key] = (maxByKey[p.stat_key] || 0) + sm;
    }
    for (const [k, v] of Object.entries(uniqueFixed)) maxByKey[k] = (maxByKey[k] || 0) + v;

    for (const [k, v] of Object.entries(stats)) {
      const max = maxByKey[k];
      if (!max) continue;
      const ratio = v / max;
      if (ratio <= 1.0) buckets['<=1.0 raw 같음']++;
      else if (ratio <= 1.2) buckets['1.0~1.2']++;
      else if (ratio <= 1.5) buckets['1.2~1.5']++;
      else if (ratio <= 2.0) buckets['1.5~2.0']++;
      else buckets['>2.0']++;

      if (ratio > 1.0 && samples.length < 10) {
        samples.push({ item: row.name, enh: row.enhance_level, lv: row.required_level, key: k, value: v, max, ratio: ratio.toFixed(2) });
      }
    }
  }

  console.log('\n=== value / raw-max 비율 분포 ===');
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v}건`);

  console.log('\n=== raw 초과 샘플 ===');
  if (samples.length > 0) {
    for (const s of samples) console.log(`  [${s.item} +${s.enh}, lv${s.lv}] ${s.key}=${s.value} (max raw ${s.max}, ratio ${s.ratio})`);
  } else {
    console.log('  없음 — prefix_stats는 raw(강화전) 저장이 정상');
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
