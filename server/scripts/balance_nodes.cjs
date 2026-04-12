const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

(async () => {
  // 1. 전사 war_god 18 → 40 (총합)
  // 기존 war_god 노드들의 value 비례 상향
  const wgR = await pool.query(`
    SELECT id, name, effects FROM node_definitions
    WHERE class_exclusive = 'warrior' AND effects::text LIKE '%war_god%'
  `);
  for (const row of wgR.rows) {
    const effects = row.effects.map(e => {
      if (e.key === 'war_god') return { ...e, value: Math.round(e.value * (40 / 18)) };
      return e;
    });
    await pool.query('UPDATE node_definitions SET effects = $1::jsonb WHERE id = $2', [JSON.stringify(effects), row.id]);
    console.log(`전사 war_god 상향: ${row.name} → ${JSON.stringify(effects)}`);
  }

  // 2. 전사에 armor_pierce 노드 추가 — 기존 undying_fury 노드에 armor_pierce 추가
  const ufR = await pool.query(`
    SELECT id, name, effects FROM node_definitions
    WHERE class_exclusive = 'warrior' AND effects::text LIKE '%undying_fury%'
  `);
  for (const row of ufR.rows) {
    const effects = [...row.effects, { type: 'passive', key: 'armor_pierce', value: 20 }];
    const desc = row.effects.map(e => `${e.key}+${e.value}`).join(', ') + ', 방어관통+20%';
    await pool.query('UPDATE node_definitions SET effects = $1::jsonb, description = $2 WHERE id = $3',
      [JSON.stringify(effects), desc, row.id]);
    console.log(`전사 undying_fury에 armor_pierce+20 추가: ${row.name}`);
  }

  // 3. 마법사 spell_amp 23 → 45 (총합)
  const saR = await pool.query(`
    SELECT id, name, effects FROM node_definitions
    WHERE class_exclusive = 'mage' AND effects::text LIKE '%spell_amp%'
  `);
  for (const row of saR.rows) {
    const effects = row.effects.map(e => {
      if (e.key === 'spell_amp') return { ...e, value: Math.round(e.value * (45 / 23)) };
      return e;
    });
    await pool.query('UPDATE node_definitions SET effects = $1::jsonb WHERE id = $2', [JSON.stringify(effects), row.id]);
    console.log(`마법사 spell_amp 상향: ${row.name} → ${JSON.stringify(effects)}`);
  }

  // 4. 도적 poison_burst_amp 90 → 50
  const pbR = await pool.query(`
    SELECT id, name, effects FROM node_definitions
    WHERE class_exclusive = 'rogue' AND effects::text LIKE '%poison_burst_amp%'
  `);
  for (const row of pbR.rows) {
    const effects = row.effects.map(e => {
      if (e.key === 'poison_burst_amp') return { ...e, value: Math.round(e.value * (50 / 90)) };
      return e;
    });
    await pool.query('UPDATE node_definitions SET effects = $1::jsonb WHERE id = $2', [JSON.stringify(effects), row.id]);
    console.log(`도적 poison_burst_amp 하향: ${row.name} → ${JSON.stringify(effects)}`);
  }

  // 검증
  console.log('\n=== 변경 후 직업별 패시브 합 ===');
  const verR = await pool.query(`
    SELECT nd.class_exclusive AS cls, e->>'key' AS key, SUM((e->>'value')::numeric) AS total
    FROM node_definitions nd, jsonb_array_elements(nd.effects) AS e
    WHERE e->>'type' = 'passive' AND nd.class_exclusive IS NOT NULL
    GROUP BY nd.class_exclusive, e->>'key'
    HAVING SUM((e->>'value')::numeric) > 0
    ORDER BY nd.class_exclusive, total DESC
  `);
  let cur = '';
  for (const r of verR.rows) {
    if (r.cls !== cur) { cur = r.cls; console.log(`\n[${cur}]`); }
    console.log(`  ${r.key}: +${r.total}`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
