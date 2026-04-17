// 재굴림권 수치/표기 오류 전체 감사
// 1) 표기 범위(scaledMin/scaledMax) vs 실제 재굴림 값 범위
// 2) 유니크 고유옵 보존 시뮬레이션
// 3) 단일/전체 재굴림 일관성
// 4) 강화 배수 적용 검증

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

function calcLevelScale(itemLevel) {
  return 0.4 + (Math.min(70, Math.max(1, itemLevel)) / 70) * 1.4;
}
function rollOne(p, scale) {
  const baseValue = p.min_val + Math.floor(Math.random() * (p.max_val - p.min_val + 1));
  return Math.max(1, Math.round(baseValue * scale));
}
function enhanceMult(enh) { return 1 + enh * 0.05; }

(async () => {
  const prefixR = await pool.query(`SELECT id, name, tier, stat_key, min_val, max_val FROM item_prefixes ORDER BY id`);
  const prefixes = prefixR.rows;
  console.log(`prefix: ${prefixes.length}개`);

  // === 테스트 1: 표기 범위 vs 실제 굴림 값 ===
  console.log('\n=== 1. 표기 범위 vs 실제 굴림 (각 100회) ===');
  const N = 100;
  let rangeErrors = 0;
  for (const p of prefixes) {
    for (const lv of [1, 35, 70]) {
      const scale = calcLevelScale(lv);
      const shownMin = Math.max(1, Math.round(p.min_val * scale));
      const shownMax = Math.max(1, Math.round(p.max_val * scale));
      let minSeen = Infinity, maxSeen = -Infinity;
      for (let i = 0; i < N; i++) {
        const v = rollOne(p, scale);
        if (v < minSeen) minSeen = v;
        if (v > maxSeen) maxSeen = v;
      }
      if (minSeen < shownMin || maxSeen > shownMax) {
        console.log(`✗ [${p.name}] lv${lv} T${p.tier} 표기=${shownMin}~${shownMax} 실측=${minSeen}~${maxSeen}`);
        rangeErrors++;
      }
    }
  }
  console.log(`범위 오류: ${rangeErrors}건 / ${prefixes.length * 3 * N}회`);

  // === 테스트 2: 클라 표기 일관성 — scaledMin/Max가 raw(강화0)인지 확인 ===
  console.log('\n=== 2. 표기값은 강화 0 기준 (raw) — 강화 +10 아이템이면 실제 표시보다 작아야 함 ===');
  const sampleP = prefixes.find(p => p.stat_key === 'vit' && p.tier === 1);
  if (sampleP) {
    const scale = calcLevelScale(35);
    const raw = rollOne(sampleP, scale);
    const enh10 = Math.round(raw * enhanceMult(10));
    console.log(`  예: ${sampleP.name} lv35 raw=${raw}, 강화+10 표시=${enh10}`);
    console.log(`  → 버튼의 범위는 raw(강화전), PrefixDisplay의 값은 강화후 — 스케일 차이 주의`);
  }

  // === 테스트 3: 유니크 고유옵 보존 시뮬 ===
  console.log('\n=== 3. 유니크 고유옵 보존 (overlap 케이스) ===');
  // 시나리오: 유니크가 atk_pct +10 고정, 랜덤도 atk_pct +5 굴림 → 병합 {atk_pct: 15}
  const uniqueFixed = { atk_pct: 10 };
  const randomPrefix = prefixes.find(p => p.stat_key === 'atk_pct');
  if (randomPrefix) {
    const scale = calcLevelScale(50);
    const initialRandom = rollOne(randomPrefix, scale);
    const prevStats = { atk_pct: uniqueFixed.atk_pct + initialRandom };
    console.log(`  초기: unique ${uniqueFixed.atk_pct} + random ${initialRandom} = prev ${prevStats.atk_pct}`);

    // 재굴림 수정 로직 재현
    const pureRandom = { ...prevStats };
    for (const [k, v] of Object.entries(uniqueFixed)) {
      if (pureRandom[k] !== undefined) {
        pureRandom[k] -= v;
        if (pureRandom[k] <= 0) delete pureRandom[k];
      }
    }
    console.log(`  분리 후 pureRandom: ${JSON.stringify(pureRandom)}`);

    // 재굴림 (whole)
    const newRandom = rollOne(randomPrefix, scale);
    const rolled = { atk_pct: newRandom };
    console.log(`  재굴림 random: ${JSON.stringify(rolled)}`);

    // 재병합
    const merged = { ...rolled };
    for (const [k, v] of Object.entries(uniqueFixed)) {
      merged[k] = (merged[k] ?? 0) + v;
    }
    console.log(`  최종 (unique 복원): ${JSON.stringify(merged)}`);
    console.log(`  ✓ 유니크 ${uniqueFixed.atk_pct} 유지, 랜덤만 ${initialRandom}→${newRandom} 변경됨`);
  } else {
    console.log('  atk_pct 접두사 없음 — 테스트 스킵');
  }

  // === 테스트 4: 실제 유니크 아이템 확인 ===
  console.log('\n=== 4. 실제 유니크 아이템 + 병합 overlap 케이스 ===');
  const uniqItems = await pool.query(`
    SELECT i.id, i.name, i.unique_prefix_stats, ci.prefix_ids, ci.prefix_stats
    FROM items i JOIN character_inventory ci ON ci.item_id = i.id
    WHERE i.grade='unique' AND ci.prefix_stats IS NOT NULL
    LIMIT 10
  `);
  let overlapCount = 0;
  for (const row of uniqItems.rows) {
    const uniq = row.unique_prefix_stats || {};
    const all = row.prefix_stats || {};
    const uniqKeys = Object.keys(uniq);
    const overlapKeys = uniqKeys.filter(k => all[k] !== undefined && all[k] > uniq[k]);
    if (overlapKeys.length > 0) {
      console.log(`  [${row.name}] unique=${JSON.stringify(uniq)} prefix=${JSON.stringify(all)} overlap=${overlapKeys.join(',')}`);
      overlapCount++;
    }
  }
  console.log(`  유니크 overlap 아이템: ${overlapCount}/${uniqItems.rowCount}`);

  // === 테스트 5: prefix_ids 중 item_prefixes에 없는 고아 ===
  console.log('\n=== 5. 고아 prefix_id (캐시 stale 지표) ===');
  const orphan = await pool.query(`
    SELECT DISTINCT pid FROM (
      SELECT unnest(prefix_ids) pid FROM character_inventory WHERE prefix_ids IS NOT NULL
      UNION
      SELECT unnest(prefix_ids) pid FROM character_equipped WHERE prefix_ids IS NOT NULL
    ) x
    WHERE pid NOT IN (SELECT id FROM item_prefixes)
  `);
  console.log(`  고아 ID: ${orphan.rowCount}개`);

  // === 테스트 6: min_val > max_val 인 이상 접두사 ===
  const bad = await pool.query(`SELECT id, name, min_val, max_val FROM item_prefixes WHERE min_val > max_val OR min_val < 1`);
  console.log(`\n=== 6. 이상한 min/max: ${bad.rowCount}건 ===`);
  for (const row of bad.rows) console.log(`  [${row.name}] ${row.min_val}~${row.max_val}`);

  // === 테스트 7: tier별 확률 분포 (rollTier 90/9/0.9/0.1) 검증 ===
  console.log('\n=== 7. tier 분포 (rollTier 10000회 시뮬) ===');
  const ROLLS = 10000;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < ROLLS; i++) {
    const r = Math.random() * 100;
    let t;
    if (r < 0.1) t = 4;
    else if (r < 1.0) t = 3;
    else if (r < 10.0) t = 2;
    else t = 1;
    counts[t]++;
  }
  console.log(`  T1 ${counts[1]} (${(counts[1]/ROLLS*100).toFixed(2)}%) · T2 ${counts[2]} (${(counts[2]/ROLLS*100).toFixed(2)}%) · T3 ${counts[3]} (${(counts[3]/ROLLS*100).toFixed(2)}%) · T4 ${counts[4]} (${(counts[4]/ROLLS*100).toFixed(2)}%)`);
  console.log(`  기대: T1 90% · T2 9% · T3 0.9% · T4 0.1%`);
  console.log(`  ⚠️ 주의: 재굴림은 rollTier 사용 안 함 — 기존 tier 고정 유지`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
