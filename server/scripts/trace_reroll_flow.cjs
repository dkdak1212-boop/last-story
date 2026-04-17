// 강화된 아이템에 대해 재굴림 로직 end-to-end 추적
// /list 엔드포인트 응답 → 재굴림 → 응답 — 각 단계에서 raw vs scaled 확인

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
  // 강화 +5 이상 장비 하나 골라서 추적
  const itemR = await pool.query(`
    SELECT ci.character_id, ci.slot_index, ci.enhance_level, ci.prefix_ids, ci.prefix_stats,
           i.name, i.required_level, i.grade, i.unique_prefix_stats
    FROM character_inventory ci JOIN items i ON i.id = ci.item_id
    WHERE ci.enhance_level >= 5 AND array_length(ci.prefix_ids, 1) >= 1
    LIMIT 1
  `);
  if (itemR.rowCount === 0) { console.log('no sample'); await pool.end(); return; }
  const item = itemR.rows[0];
  console.log(`샘플: ${item.name} (lv${item.required_level}, 강화+${item.enhance_level})`);
  console.log(`  DB prefix_stats (raw): ${JSON.stringify(item.prefix_stats)}`);
  console.log(`  DB prefix_ids: ${JSON.stringify(item.prefix_ids)}`);
  const enhMult = 1 + item.enhance_level * 0.05;
  console.log(`  enhance mult: x${enhMult.toFixed(2)}`);
  console.log(`  /list에서 client가 받는 prefixStats (scaled): ${JSON.stringify(displayPrefixStats(item.prefix_stats, item.enhance_level))}`);

  // prefix 정의 로드
  const pr = await pool.query(`SELECT id, stat_key, min_val, max_val FROM item_prefixes WHERE id = ANY($1::int[])`, [item.prefix_ids]);
  const prefixes = pr.rows;
  console.log(`\n  각 접두사 정의:`);
  const scale = calcLevelScale(item.required_level);
  for (const p of prefixes) {
    const rMin = Math.max(1, Math.round(p.min_val * scale));
    const rMax = Math.max(1, Math.round(p.max_val * scale));
    const eMin = Math.max(1, Math.round(rMin * enhMult));
    const eMax = Math.max(1, Math.round(rMax * enhMult));
    console.log(`    [${p.stat_key}] 기본 ${p.min_val}~${p.max_val} / raw ${rMin}~${rMax} / 강화후 ${eMin}~${eMax}`);
  }

  // 재굴림 시뮬 (whole) — 서버 로직 복제
  console.log(`\n  === 재굴림 시뮬 (10회) ===`);
  for (let i = 0; i < 10; i++) {
    const bonusStats = {};
    for (const p of prefixes) {
      const base = p.min_val + Math.floor(Math.random() * (p.max_val - p.min_val + 1));
      const val = Math.max(1, Math.round(base * scale));
      bonusStats[p.stat_key] = (bonusStats[p.stat_key] || 0) + val;
    }
    const scaled = displayPrefixStats(bonusStats, item.enhance_level);
    console.log(`    #${i}: raw=${JSON.stringify(bonusStats)} → scaled=${JSON.stringify(scaled)}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
