// 실제 T1~T4 접두사를 각 item level에서 재굴림 시뮬
// 버튼 표기 범위 vs 실제 굴림 결과가 tier 경계와 어떻게 맞물리는지 확인

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}
function rollOne(p, scale) {
  const base = p.min_val + Math.floor(Math.random() * (p.max_val - p.min_val + 1));
  return Math.max(1, Math.round(base * scale));
}

(async () => {
  // vit T1~T4 선택
  const r = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes WHERE stat_key='vit' ORDER BY tier`);
  const vitTiers = r.rows;

  console.log('=== vit T1~T4 원본 ===');
  for (const p of vitTiers) console.log(`  T${p.tier} ${p.name}: raw ${p.min_val}~${p.max_val}`);

  for (const lv of [35, 50, 70]) {
    const scale = calcLevelScale(lv);
    console.log(`\n=== itemLv ${lv} (scale ${scale.toFixed(2)}) ===`);
    for (const p of vitTiers) {
      const rMin = Math.max(1, Math.round(p.min_val * scale));
      const rMax = Math.max(1, Math.round(p.max_val * scale));
      console.log(`  T${p.tier} ${p.name}: scaled ${rMin}~${rMax}`);
    }

    // 각 tier 1000회 굴려서 실제 분포 확인
    console.log(`  실측 (1000회 각):`);
    for (const p of vitTiers) {
      let min = Infinity, max = -Infinity;
      const hist = {};
      for (let i = 0; i < 1000; i++) {
        const v = rollOne(p, scale);
        if (v < min) min = v;
        if (v > max) max = v;
        hist[v] = (hist[v] || 0) + 1;
      }
      console.log(`    T${p.tier} 실측 ${min}~${max}`);
    }

    // 경계 비교: T1_max vs T2_min, T2_max vs T3_min, T3_max vs T4_min
    const sm = tier => Math.max(1, Math.round(vitTiers[tier-1].min_val * scale));
    const lm = tier => Math.max(1, Math.round(vitTiers[tier-1].max_val * scale));
    console.log(`  경계 겹침 확인:`);
    console.log(`    T1 max=${lm(1)} vs T2 min=${sm(2)} → ${lm(1) >= sm(2) ? '겹침' : 'gap'}`);
    console.log(`    T2 max=${lm(2)} vs T3 min=${sm(3)} → ${lm(2) >= sm(3) ? '겹침' : 'gap'}`);
    console.log(`    T3 max=${lm(3)} vs T4 min=${sm(4)} → ${lm(3) >= sm(4) ? '겹침' : 'gap'}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
