// 현재 DB 아이템들의 prefix_stats 중 max 초과(오버) 값 감사
// 공식: scaledMax = round(p.max_val * levelScale(itemLevel))
//       최종 허용 = scaledMax * (1 + enhance * 0.05) + uniqueFixed[key]
// (raw 저장이라 enhance 배수는 display 측. raw 자체는 scaledMax 초과하면 안 됨)

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}

(async () => {
  // 모든 접두사 로드
  const pr = await pool.query(`SELECT id, stat_key, min_val, max_val FROM item_prefixes`);
  const prefixMap = new Map(pr.rows.map(r => [r.id, r]));

  // 인벤 + 장착 모두 스캔
  const items = await pool.query(`
    SELECT 'inv' kind, ci.character_id, ci.slot_index::text slot_key, i.name item_name, i.required_level,
           i.grade, i.unique_prefix_stats, ci.prefix_ids, ci.prefix_stats
    FROM character_inventory ci JOIN items i ON i.id = ci.item_id
    WHERE ci.prefix_ids IS NOT NULL AND array_length(ci.prefix_ids, 1) > 0
    UNION ALL
    SELECT 'eq' kind, ce.character_id, ce.slot::text slot_key, i.name item_name, i.required_level,
           i.grade, i.unique_prefix_stats, ce.prefix_ids, ce.prefix_stats
    FROM character_equipped ce JOIN items i ON i.id = ce.item_id
    WHERE ce.prefix_ids IS NOT NULL AND array_length(ce.prefix_ids, 1) > 0
  `);
  console.log(`스캔 대상: ${items.rowCount}개`);

  let overflowCount = 0;
  const samples = [];

  for (const row of items.rows) {
    const prefixIds = row.prefix_ids || [];
    const stats = row.prefix_stats || {};
    const uniqueFixed = (row.grade === 'unique' ? (row.unique_prefix_stats || {}) : {});
    const itemLv = row.required_level || 1;
    const scale = calcLevelScale(itemLv);

    // 각 stat_key 별 허용 max 계산
    // stat_key 별 scaledMax 합산 (다중 접두사가 같은 stat_key를 공유할 때)
    const allowedMaxByKey = {};
    for (const pid of prefixIds) {
      const p = prefixMap.get(pid);
      if (!p) continue;
      const sm = Math.max(1, Math.round(p.max_val * scale));
      allowedMaxByKey[p.stat_key] = (allowedMaxByKey[p.stat_key] || 0) + sm;
    }
    // 유니크 고정분 추가
    for (const [k, v] of Object.entries(uniqueFixed)) {
      allowedMaxByKey[k] = (allowedMaxByKey[k] || 0) + v;
    }

    for (const [k, v] of Object.entries(stats)) {
      const allowed = allowedMaxByKey[k];
      if (allowed === undefined) {
        // stat_key가 prefixIds/uniqueFixed 양쪽에 없는 orphan stat — overflow 아님 하지만 이상
        continue;
      }
      if (v > allowed) {
        overflowCount++;
        if (samples.length < 20) {
          samples.push({
            kind: row.kind, char: row.character_id, slot: row.slot_key, item: row.item_name,
            lv: itemLv, grade: row.grade, key: k, value: v, allowed, excess: v - allowed,
            unique: uniqueFixed[k] || 0, prefixIds,
          });
        }
      }
    }
  }

  console.log(`\n=== 오버 수치 ${overflowCount}건 ===`);
  if (samples.length > 0) {
    for (const s of samples) {
      console.log(`  [${s.kind} char${s.char} slot${s.slot}] ${s.item} (lv${s.lv} ${s.grade}) ${s.key}=${s.value} (max ${s.allowed}, 초과 +${s.excess}) unique=${s.unique} pids=${JSON.stringify(s.prefixIds)}`);
    }
    if (overflowCount > samples.length) console.log(`  ... 외 ${overflowCount - samples.length}건`);
  } else {
    console.log('  ✓ 오버 없음');
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
