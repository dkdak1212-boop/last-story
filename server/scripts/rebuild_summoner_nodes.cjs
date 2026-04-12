const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 기존 소환사 노드 삭제
  await pool.query(`DELETE FROM character_nodes WHERE node_id IN (SELECT id FROM node_definitions WHERE class_exclusive = 'summoner')`);
  await pool.query(`DELETE FROM node_definitions WHERE class_exclusive = 'summoner'`);
  console.log('기존 소환사 노드 삭제');

  // 시퀀스 리셋
  await pool.query(`SELECT setval(pg_get_serial_sequence('node_definitions', 'id'), (SELECT MAX(id) FROM node_definitions))`);

  const nodes = [];
  const E = (effects) => JSON.stringify(effects);
  const S = (stat, val) => ({ type: 'stat', stat, value: val });
  const P = (key, val) => ({ type: 'passive', key, value: val });

  // ═══ SMALL (27개) — y: -12 ~ -16 ═══
  // 지능 9개
  for (let i = 0; i < 9; i++) {
    nodes.push({ name: `소환사 지능 ${i+1}`, desc: '지능 +5', effects: E([S('int', 5)]),
      x: i % 5, y: -12 - Math.floor(i / 5) });
  }
  // 소환수 강화 6개
  for (let i = 0; i < 6; i++) {
    nodes.push({ name: `소환수 강화 ${i+1}`, desc: '소환수 데미지 +6%', effects: E([P('summon_amp', 6)]),
      x: 5 + (i % 3), y: -12 - Math.floor(i / 3) });
  }
  // 소환 지속 4개
  for (let i = 0; i < 4; i++) {
    nodes.push({ name: `소환 지속 ${i+1}`, desc: '소환수 지속시간 +1행동', effects: E([P('summon_duration', 1)]),
      x: 8 + (i % 2), y: -12 - Math.floor(i / 2) });
  }
  // 체력 5개
  for (let i = 0; i < 5; i++) {
    nodes.push({ name: `소환사 체력 ${i+1}`, desc: '체력 +5', effects: E([S('vit', 5)]),
      x: i, y: -15 });
  }
  // 치명타 3개
  for (let i = 0; i < 3; i++) {
    nodes.push({ name: `소환사 치명 ${i+1}`, desc: '치명타 +1%', effects: E([S('cri', 1)]),
      x: 5 + i, y: -15 });
  }

  // ═══ MEDIUM (12개) — y: -17 ~ -19 ═══
  const mediums = [
    { name: '소환사 INT 증강 I', desc: '지능 +12', effects: E([S('int', 12)]), x: 0, y: -17 },
    { name: '소환사 INT 증강 II', desc: '지능 +12', effects: E([S('int', 12)]), x: 2, y: -17 },
    { name: '소환사 VIT 증강 I', desc: '체력 +12', effects: E([S('vit', 12)]), x: 4, y: -17 },
    { name: '소환사 VIT 증강 II', desc: '체력 +12', effects: E([S('vit', 12)]), x: 6, y: -17 },
    { name: '다중 계약', desc: '최대 소환수 +1 (3→4마리)', effects: E([P('summon_max_extra', 1)]), x: 1, y: -18 },
    { name: '소환수 도트 강화', desc: '소환수 도트 데미지 +30%', effects: E([P('summon_dot_amp', 30)]), x: 3, y: -18 },
    { name: '소환수 폭발 강화', desc: '희생 데미지 +50%', effects: E([P('summon_sacrifice_amp', 50)]), x: 5, y: -18 },
    { name: '소환사 SPD 증강', desc: '속도 +12', effects: E([S('spd', 12)]), x: 7, y: -18 },
    { name: '소환사 CRI 증강', desc: '치명타 +8%', effects: E([S('cri', 8)]), x: 0, y: -19 },
    { name: '소환수 회복 강화', desc: '소환수 HP 회복 2배', effects: E([P('summon_heal_amp', 100)]), x: 2, y: -19 },
    { name: '소환수 속도 강화', desc: '소환수 공격 시 20% 속도 증가', effects: E([P('summon_speed_amp', 20)]), x: 4, y: -19 },
    { name: '만능 소환사', desc: '지능 +8, 속도 +6', effects: E([S('int', 8), S('spd', 6)]), x: 6, y: -19 },
  ];
  nodes.push(...mediums);

  // ═══ LARGE (3개) — y: -20 ═══
  const larges = [
    { name: '소환왕', desc: '소환수 데미지 +40%, 소환 쿨다운 -1행동', effects: E([P('summon_amp', 40), P('summon_cd_reduce', 1)]), x: 1, y: -20 },
    { name: '영혼의 지배자', desc: '소환수 처치 시 HP 10% 회복, 피해 감소 30%', effects: E([P('summon_lifesteal', 10), P('summon_tankiness', 30)]), x: 4, y: -20 },
    { name: '계약의 대가', desc: '소환수 데미지 +50%', effects: E([P('summon_amp', 50)]), x: 7, y: -20 },
  ];
  nodes.push(...larges);

  // ═══ HUGE (2개) — y: -22 ═══
  const huges = [
    { name: '만물의 군주', desc: '소환수 데미지 +80%, 20% 확률 2회 타격', effects: E([P('summon_amp', 80), P('summon_double_hit', 20)]), x: 2, y: -22 },
    { name: '영원의 계약자', desc: '소환수 지속시간 무한, 데미지 +30%', effects: E([P('summon_infinite', 1), P('summon_amp', 30)]), x: 6, y: -22 },
  ];
  nodes.push(...huges);

  // DB INSERT
  for (const n of nodes) {
    const tier = huges.includes(n) ? 'huge' : larges.includes(n) ? 'large' : mediums.includes(n) ? 'medium' : 'small';
    const cost = tier === 'huge' ? 8 : tier === 'large' ? 4 : tier === 'medium' ? 2 : 1;
    await pool.query(
      `INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y)
       VALUES ($1, $2, 'core', $3, $4, 'summoner', $5::jsonb, null, $6, $7)`,
      [n.name, n.desc, tier, cost, n.effects, n.x, n.y]
    );
  }

  // 검증
  const verify = await pool.query(`
    SELECT tier, COUNT(*) cnt FROM node_definitions WHERE class_exclusive = 'summoner' GROUP BY tier ORDER BY tier
  `);
  console.log('\n=== 소환사 노드 결과 ===');
  for (const v of verify.rows) console.log(`  ${v.tier}: ${v.cnt}개`);

  const total = await pool.query(`SELECT COUNT(*) cnt FROM node_definitions WHERE class_exclusive = 'summoner'`);
  console.log(`  총: ${total.rows[0].cnt}개`);

  // 다른 직업 비교
  const others = await pool.query(`
    SELECT class_exclusive, COUNT(*) cnt FROM node_definitions
    WHERE class_exclusive IS NOT NULL GROUP BY class_exclusive ORDER BY class_exclusive
  `);
  console.log('\n=== 직업별 노드 수 ===');
  for (const o of others.rows) console.log(`  ${o.class_exclusive}: ${o.cnt}개`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
