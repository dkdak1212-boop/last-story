// 마법사 전용 노드 추가 — 일타 폭딜 (north_mage_burst) + 지속 도트 (north_mage_dot).
// 각 갈래 17 노드 = 직업 34 노드.

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const CLASS_EXCLUSIVE = 'mage';

// 갈래 1: 일타 폭딜 (north_mage_burst)
const BURST_ZONE = 'north_mage_burst';
const BURST_NODES = [
  // T1 작은 7개
  { name: '정련된 지능 1', tier: 'small', cost: 1, effects: [{ stat: 'int', type: 'stat', value: 5 }], x: -10, y: -16 },
  { name: '정련된 지능 2', tier: 'small', cost: 1, effects: [{ stat: 'int', type: 'stat', value: 5 }], x: -9, y: -16 },
  { name: '정련된 지능 3', tier: 'small', cost: 1, effects: [{ stat: 'int', type: 'stat', value: 5 }], x: -8, y: -16 },
  { name: '마력의 응축 1', tier: 'small', cost: 1, effects: [{ key: 'paragon_matk_pct', type: 'passive', value: 2 }], x: -10, y: -15 },
  { name: '마력의 응축 2', tier: 'small', cost: 1, effects: [{ key: 'paragon_matk_pct', type: 'passive', value: 2 }], x: -9, y: -15 },
  { name: '한 발의 정수 1', tier: 'small', cost: 1, effects: [{ stat: 'cri', type: 'stat', value: 3 }], x: -8, y: -15 },
  { name: '한 발의 정수 2', tier: 'small', cost: 1, effects: [{ stat: 'cri', type: 'stat', value: 3 }], x: -7, y: -15 },
  // T2 중간 5개
  { name: '폭격의 증폭 1', tier: 'medium', cost: 2, effects: [{ key: 'spell_amp', type: 'passive', value: 10 }], x: -10, y: -14 },
  { name: '폭격의 증폭 2', tier: 'medium', cost: 2, effects: [{ key: 'spell_amp', type: 'passive', value: 10 }], x: -9, y: -14 },
  { name: '정확한 시전', tier: 'medium', cost: 2, effects: [{ stat: 'dex', type: 'stat', value: 20 }], x: -8, y: -14 },
  { name: '치명적 마법', tier: 'medium', cost: 2, effects: [{ key: 'crit_damage', type: 'passive', value: 15 }], x: -7, y: -14 },
  { name: '충전된 일격', tier: 'medium', cost: 2, effects: [{ key: 'charged_strike', type: 'passive', value: 1 }], x: -6, y: -14 },
  // T2 키스톤
  { name: '일점 폭발', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_one_shot', type: 'passive', value: 1 }], x: -8, y: -13 },
  // T3 큰 3개
  { name: '압도적 권능', tier: 'large', cost: 3, effects: [{ key: 'paragon_matk_pct', type: 'passive', value: 4 }], x: -10, y: -12 },
  { name: '회심의 일격', tier: 'large', cost: 3, effects: [{ stat: 'cri', type: 'stat', value: 8 }], x: -9, y: -12 },
  { name: '영혼의 권능', tier: 'large', cost: 3, effects: [{ stat: 'int', type: 'stat', value: 12 }], x: -8, y: -12 },
  // T3 키스톤
  { name: '종결의 일격', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_finishing_blow', type: 'passive', value: 1 }], x: -8, y: -11 },
];

// 갈래 2: 지속 도트 (north_mage_dot)
const DOT_ZONE = 'north_mage_dot';
const DOT_NODES = [
  // T1 작은 7개
  { name: '부패의 마법 1', tier: 'small', cost: 1, effects: [{ stat: 'int', type: 'stat', value: 5 }], x: 3, y: -16 },
  { name: '부패의 마법 2', tier: 'small', cost: 1, effects: [{ stat: 'int', type: 'stat', value: 5 }], x: 4, y: -16 },
  { name: '부패의 마법 3', tier: 'small', cost: 1, effects: [{ stat: 'int', type: 'stat', value: 5 }], x: 5, y: -16 },
  { name: '끈질긴 시전 1', tier: 'small', cost: 1, effects: [{ key: 'paragon_matk_pct', type: 'passive', value: 2 }], x: 6, y: -16 },
  { name: '끈질긴 시전 2', tier: 'small', cost: 1, effects: [{ key: 'paragon_matk_pct', type: 'passive', value: 2 }], x: 7, y: -16 },
  { name: '침식의 권능 1', tier: 'small', cost: 1, effects: [{ key: 'dot_amp', type: 'passive', value: 50 }], x: 3, y: -15 },
  { name: '침식의 권능 2', tier: 'small', cost: 1, effects: [{ key: 'dot_amp', type: 'passive', value: 50 }], x: 4, y: -15 },
  // T2 중간 5개
  { name: '화염 강화 1', tier: 'medium', cost: 2, effects: [{ key: 'burn_amp', type: 'passive', value: 50 }], x: 5, y: -15 },
  { name: '마법 강화', tier: 'medium', cost: 2, effects: [{ key: 'spell_amp', type: 'passive', value: 20 }], x: 6, y: -15 },
  { name: '화염 강화 2', tier: 'medium', cost: 2, effects: [{ key: 'burn_amp', type: 'passive', value: 50 }], x: 7, y: -15 },
  { name: '깊이 새기는 저주', tier: 'medium', cost: 2, effects: [{ key: 'dot_duration_bonus', type: 'passive', value: 3 }], x: 8, y: -15 },
  { name: '침식의 가속', tier: 'medium', cost: 2, effects: [{ key: 'dot_amp', type: 'passive', value: 10 }], x: 9, y: -15 },
  // T2 키스톤
  { name: '도트 과부하', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_dot_overload', type: 'passive', value: 1 }], x: 6, y: -14 },
  // T3 큰 3개
  { name: '영원한 침식', tier: 'large', cost: 3, effects: [{ key: 'dot_amp', type: 'passive', value: 75 }], x: 4, y: -13 },
  { name: '침투하는 권능', tier: 'large', cost: 3, effects: [{ key: 'paragon_matk_pct', type: 'passive', value: 4 }], x: 5, y: -13 },
  { name: '부패의 영혼', tier: 'large', cost: 3, effects: [{ stat: 'int', type: 'stat', value: 15 }], x: 6, y: -13 },
  // T3 키스톤
  { name: '도트 폭발', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_dot_detonation', type: 'passive', value: 1 }], x: 6, y: -12 },
];

async function insertBranch(client, zone, nodes, branchLabel) {
  let inserted = 0;
  let skipped = 0;
  for (const n of nodes) {
    const exists = await client.query(
      `SELECT id FROM node_definitions WHERE class_exclusive = $1 AND zone = $2 AND name = $3`,
      [CLASS_EXCLUSIVE, zone, n.name]
    );
    if (exists.rowCount > 0) {
      skipped++;
      continue;
    }
    await client.query(
      `INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, position_x, position_y, prerequisites, hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, '{}', FALSE)`,
      [n.name, '', zone, n.tier, n.cost, CLASS_EXCLUSIVE, JSON.stringify(n.effects), n.x, n.y]
    );
    inserted++;
  }
  console.log(`  ${branchLabel} (${zone}): 신규 ${inserted} / 스킵 ${skipped} / 총 ${nodes.length}`);
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('마법사 전용 노드 추가 시작 — 일타 폭딜 17 + 지속 도트 17 = 34 노드');
    await insertBranch(client, BURST_ZONE, BURST_NODES, '일타 폭딜');
    await insertBranch(client, DOT_ZONE, DOT_NODES, '지속 도트');
    await client.query('COMMIT');
    console.log('마법사 전용 노드 추가 완료');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('실패:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
