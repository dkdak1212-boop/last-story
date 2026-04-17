// 실제 강화된 아이템에 대해 '서버 reroll 전체 플로우' 그대로 재현
// → DB에 저장되는 raw 값과 클라이언트가 받는 scaled 값 둘 다 출력
// → 표기된 버튼 범위와 비교

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}
function displayPrefixStats(raw, enh) {
  const stats = { ...(raw || {}) };
  if (enh > 0) {
    const mult = 1 + enh * 0.05;
    for (const k of Object.keys(stats)) stats[k] = Math.round(stats[k] * mult);
  }
  return stats;
}

(async () => {
  // 강화 +10 이상 + vit 접두사 있는 아이템 찾기
  const itemR = await pool.query(`
    SELECT ci.character_id, ci.slot_index, ci.enhance_level, ci.prefix_ids, ci.prefix_stats,
           i.name, i.required_level, i.grade
    FROM character_inventory ci JOIN items i ON i.id = ci.item_id
    WHERE ci.enhance_level >= 10 AND i.required_level >= 30
      AND array_length(ci.prefix_ids, 1) >= 1
    LIMIT 1
  `);
  if (itemR.rowCount === 0) {
    console.log('샘플 없음');
    await pool.end();
    return;
  }
  const it = itemR.rows[0];
  console.log(`=== 샘플 ===`);
  console.log(`${it.name} (lv${it.required_level}, 강화+${it.enhance_level})`);
  console.log(`  DB raw prefix_stats: ${JSON.stringify(it.prefix_stats)}`);

  const pr = await pool.query(`SELECT id, stat_key, tier, min_val, max_val FROM item_prefixes WHERE id = ANY($1::int[])`, [it.prefix_ids]);
  const prefixes = pr.rows;
  const scale = calcLevelScale(it.required_level);

  console.log(`  접두사 정의 (scale ${scale.toFixed(2)}):`);
  for (const p of prefixes) {
    const rMin = Math.max(1, Math.round(p.min_val * scale));
    const rMax = Math.max(1, Math.round(p.max_val * scale));
    console.log(`    T${p.tier} [${p.stat_key}] raw ${p.min_val}~${p.max_val} → scaled ${rMin}~${rMax}`);
  }

  // 클라가 받는 버튼 표기 (raw 기준)
  console.log(`\n=== 버튼 표기 (raw, 강화 전 기준) ===`);
  for (const p of prefixes) {
    const rMin = Math.max(1, Math.round(p.min_val * scale));
    const rMax = Math.max(1, Math.round(p.max_val * scale));
    const currentRaw = it.prefix_stats?.[p.stat_key] ?? 0;
    console.log(`  T${p.tier} ${p.stat_key}: 범위 ${rMin}~${rMax}, 현재(raw) ${currentRaw}`);
  }

  console.log(`\n=== PrefixDisplay 표기 (scaled, 강화 후) ===`);
  const displayed = displayPrefixStats(it.prefix_stats, it.enhance_level);
  for (const [k, v] of Object.entries(displayed)) {
    const p = prefixes.find(x => x.stat_key === k);
    const tierStr = p ? `T${p.tier}` : '?';
    console.log(`  ${tierStr} ${k}: ${v}`);
  }

  // 재굴림 5회 시뮬
  console.log(`\n=== 전체 재굴림 5회 ===`);
  for (let i = 0; i < 5; i++) {
    const rolled = {};
    for (const p of prefixes) {
      const base = p.min_val + Math.floor(Math.random() * (p.max_val - p.min_val + 1));
      const val = Math.max(1, Math.round(base * scale));
      rolled[p.stat_key] = (rolled[p.stat_key] || 0) + val;
    }
    const scaled = displayPrefixStats(rolled, it.enhance_level);
    console.log(`  #${i}: raw=${JSON.stringify(rolled)} → 강화후=${JSON.stringify(scaled)}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
