const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 1. 모든 접두사 stat_key 조회
  const prefixes = await pool.query(`SELECT DISTINCT stat_key FROM item_prefixes ORDER BY stat_key`);
  const prefixKeys = prefixes.rows.map(r => r.stat_key);
  console.log(`접두사 stat_key ${prefixKeys.length}종:`, prefixKeys);

  // 2. 유니크 아이템 고정 접두사 키 조회
  const uniques = await pool.query(`SELECT name, unique_prefix_stats FROM items WHERE unique_prefix_stats IS NOT NULL AND unique_prefix_stats != '{}'::jsonb`);
  const uniqueKeys = new Set();
  for (const u of uniques.rows) {
    for (const k of Object.keys(u.unique_prefix_stats)) uniqueKeys.add(k);
  }
  console.log(`유니크 고유 키 ${uniqueKeys.size}종:`, [...uniqueKeys].sort());

  // 3. 적용 경로 분류
  const allKeys = new Set([...prefixKeys, ...uniqueKeys]);

  // character.ts getEquippedItems에서 스탯으로 합산되는 키
  const statApplied = new Set(['str', 'dex', 'int', 'vit', 'spd', 'cri', 'hp', 'atk', 'matk', 'def', 'mdef']);
  // formulas.ts sumEquipmentStats에서 별도 처리
  const formulaApplied = new Set(['dodge', 'accuracy']);
  // engine.ts loadEquipPrefixes에서 전투 중 직접 참조
  const engineApplied = new Set([
    'def_reduce_pct', 'dot_amp_pct', 'hp_regen', 'lifesteal_pct',
    'gold_bonus_pct', 'exp_bonus_pct', 'crit_dmg_pct',
    'berserk_pct', 'guardian_pct', 'thorns_pct', 'gauge_on_crit_pct',
    'ambush_pct', 'predator_pct', 'first_strike_pct',
    'atk_pct', 'matk_pct', 'hp_pct',
    'slow_pct',
  ]);

  console.log('\n=== 적용 상태 ===');
  let missing = 0;
  for (const k of [...allKeys].sort()) {
    if (statApplied.has(k)) {
      console.log(`  ✅ ${k} — 스탯 합산 (character.ts → formulas.ts)`);
    } else if (formulaApplied.has(k)) {
      console.log(`  ✅ ${k} — formulas.ts 별도 처리`);
    } else if (engineApplied.has(k)) {
      console.log(`  ✅ ${k} — 전투 엔진 직접 참조 (loadEquipPrefixes)`);
    } else {
      console.log(`  ❌ ${k} — 적용 경로 없음!`);
      missing++;
    }
  }

  console.log(`\n총 ${allKeys.size}종 중 미적용: ${missing}종`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
