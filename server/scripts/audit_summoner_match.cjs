// 소환사 노드 트리 효과 키 ↔ 전투 엔진 처리 ↔ 스킬 원소 매치 감사

const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 1. 소환사 노드의 모든 unique effect key 수집
  const nodeR = await pool.query(
    `SELECT id, name, tier, effects FROM node_definitions WHERE class_exclusive='summoner'`
  );
  const effectKeyCount = new Map();
  for (const row of nodeR.rows) {
    const effects = row.effects || [];
    for (const eff of effects) {
      if (eff.type === 'passive' && eff.key) {
        effectKeyCount.set(eff.key, (effectKeyCount.get(eff.key) || 0) + 1);
      }
    }
  }
  console.log(`=== 노드 트리 효과 key 분포 (unique ${effectKeyCount.size}종) ===`);
  const sorted = [...effectKeyCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, c] of sorted) console.log(`  ${k}: ${c}개`);

  // 2. 엔진 processSummons 에서 참조하는 key 파싱
  const engineSrc = fs.readFileSync('src/combat/engine.ts', 'utf8');
  const getPassiveKeys = new Set();
  const re = /getPassive\(s,\s*['"`]([^'"`]+)['"`]\)/g;
  let m;
  while ((m = re.exec(engineSrc)) !== null) getPassiveKeys.add(m[1]);
  // 템플릿 literal 패턴 `summon_${el}_dmg` 등 처리
  const templatedKeys = new Set();
  if (/summon_\$\{el\}_dmg/.test(engineSrc)) {
    for (const el of ['fire','frost','lightning','earth','holy','dark']) {
      templatedKeys.add(`summon_${el}_dmg`);
      templatedKeys.add(`summon_${el}_pen`);
      templatedKeys.add(`summon_${el}_crit`);
      templatedKeys.add(`summon_${el}_crit_dmg`);
    }
  }
  const allEngineKeys = new Set([...getPassiveKeys, ...templatedKeys]);
  console.log(`\n=== 엔진이 참조하는 key (${allEngineKeys.size}종) ===`);

  // 3. 노드 key 중 엔진이 처리하지 않는 것 (orphan)
  const orphans = [];
  for (const k of effectKeyCount.keys()) {
    if (!allEngineKeys.has(k)) orphans.push(k);
  }
  console.log(`\n=== 엔진 미처리 노드 key (orphan) ===`);
  if (orphans.length === 0) console.log('  ✓ 없음');
  else {
    for (const k of orphans.sort()) console.log(`  ${k} (${effectKeyCount.get(k)}개 노드)`);
  }

  // 4. 엔진에 있지만 노드에 없는 key (unused engine)
  const unused = [];
  for (const k of allEngineKeys) {
    if (!effectKeyCount.has(k) && k.startsWith('summon_') || k.startsWith('aura_') || k === 'element_synergy') {
      if (!effectKeyCount.has(k)) unused.push(k);
    }
  }
  console.log(`\n=== 엔진에만 정의된 key (노드에 없음) ===`);
  if (unused.length === 0) console.log('  ✓ 없음');
  else for (const k of unused.sort()) console.log(`  ${k}`);

  // 5. 스킬 원소 매칭
  const skillR = await pool.query(
    `SELECT name, element, required_level FROM skills WHERE class_name='summoner' ORDER BY required_level`
  );
  const elemCount = { fire: 0, frost: 0, lightning: 0, earth: 0, holy: 0, dark: 0, none: 0 };
  console.log(`\n=== 소환사 스킬 원소 분포 ===`);
  for (const s of skillR.rows) {
    const e = s.element || 'none';
    elemCount[e] = (elemCount[e] || 0) + 1;
  }
  for (const [e, c] of Object.entries(elemCount)) console.log(`  ${e}: ${c}개`);

  // 6. 원소 커버리지 비교 (노드에 있는 원소 키 × 스킬 원소)
  console.log(`\n=== 원소별 커버리지 ===`);
  for (const el of ['fire','frost','lightning','earth','holy','dark']) {
    const nodeKeys = [...effectKeyCount.keys()].filter(k => k.includes(`_${el}_`)).length;
    const skillCount = elemCount[el] || 0;
    const warn = skillCount === 0 ? ' ⚠️ 스킬 없음' : '';
    console.log(`  ${el}: 노드 ${nodeKeys}종 / 스킬 ${skillCount}개${warn}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
