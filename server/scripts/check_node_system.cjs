const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });
(async () => {
  // 존 종류 + 노드 수
  const z = await pool.query(`
    SELECT zone, tier, COUNT(*)::int AS n FROM node_definitions GROUP BY zone, tier ORDER BY zone, tier
  `);
  console.log('존별 노드 수:');
  z.rows.forEach(r => console.log(`  ${r.zone} / ${r.tier}: ${r.n}`));

  // 클래스별 노드 수
  const c = await pool.query(`
    SELECT class_exclusive, COUNT(*)::int AS n FROM node_definitions GROUP BY class_exclusive ORDER BY class_exclusive
  `);
  console.log('\nclass_exclusive별:');
  c.rows.forEach(r => console.log(`  ${r.class_exclusive || '(none)'}: ${r.n}`));

  // 소환사 관련 노드 (있다면)
  const sum = await pool.query(`SELECT id, name, zone, tier, effects, position_x, position_y FROM node_definitions WHERE class_exclusive = 'summoner' OR effects::text LIKE '%summon%' ORDER BY zone, position_y, position_x LIMIT 30`);
  console.log('\n소환사 관련 노드 (최대 30):');
  sum.rows.forEach(r => console.log(`  id=${r.id} ${r.name} zone=${r.zone} t=${r.tier} pos=(${r.position_x},${r.position_y}) effects=${JSON.stringify(r.effects).slice(0,120)}`));

  // node_definitions 컬럼
  const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'node_definitions' ORDER BY ordinal_position`);
  console.log('\nnode_definitions 컬럼:', cols.rows.map(r => `${r.column_name}:${r.data_type}`).join(', '));

  // 소환사 패시브 키 종류 (effects 안에서 type 추출)
  const sample = await pool.query(`SELECT effects FROM node_definitions WHERE effects IS NOT NULL LIMIT 100`);
  const types = new Set();
  sample.rows.forEach(r => {
    (r.effects || []).forEach(e => types.add(e.type + (e.stat ? `(${e.stat})` : '') + (e.passive_key ? `(${e.passive_key})` : '')));
  });
  console.log('\neffect 타입 샘플:', [...types].sort().join(', '));

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
