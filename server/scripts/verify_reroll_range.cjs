// 재굴림 시뮬레이션: 각 tier의 대표 접두사를 각 itemLevel에서 N회 재굴림 후
// 값이 [scaledMin, scaledMax] 범위 내에 있는지 검증

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}
function rollOne(minVal, maxVal, scale) {
  const baseValue = minVal + Math.floor(Math.random() * (maxVal - minVal + 1));
  return Math.max(1, Math.round(baseValue * scale));
}

(async () => {
  // tier별 접두사 1개씩 샘플링
  const r = await pool.query(`
    SELECT DISTINCT ON (tier) id, name, tier, stat_key, min_val, max_val
    FROM item_prefixes ORDER BY tier, id
  `);
  const samples = r.rows;
  console.log(`샘플 접두사 ${samples.length}개 (tier별 1개)`);

  const itemLevels = [1, 35, 50, 70];
  const N = 1000;
  let allOk = true;

  for (const p of samples) {
    for (const lv of itemLevels) {
      const scale = calcLevelScale(lv);
      const scaledMin = Math.max(1, Math.round(p.min_val * scale));
      const scaledMax = Math.max(1, Math.round(p.max_val * scale));
      let minSeen = Infinity, maxSeen = -Infinity, outOfRange = 0;
      const hist = {};
      for (let i = 0; i < N; i++) {
        const v = rollOne(p.min_val, p.max_val, scale);
        if (v < minSeen) minSeen = v;
        if (v > maxSeen) maxSeen = v;
        if (v < scaledMin || v > scaledMax) outOfRange++;
        hist[v] = (hist[v] || 0) + 1;
      }
      const ok = outOfRange === 0 && minSeen >= scaledMin && maxSeen <= scaledMax;
      if (!ok) allOk = false;
      const status = ok ? '✓' : '✗';
      console.log(`${status} T${p.tier} [${p.name}] lv${lv} | 공식범위=${scaledMin}~${scaledMax} | 실측=${minSeen}~${maxSeen} | 이탈=${outOfRange}/${N}`);
    }
  }

  console.log(`\n전체 결과: ${allOk ? '✓ 모든 tier/레벨에서 범위 내 재굴림 정상' : '✗ 범위 이탈 발생'}`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
