// 성직자 전용 노드 추가 — 수호 (north_cleric_guard) + 광명 (north_cleric_radiant).
// 각 갈래 17 노드 = 직업 34 노드.
// 성직자는 HP×20 스킬 (신의 타격·천상 강림) 가 핵심 → INT/MATK 노드 제외, HP/VIT/CRI/속도/judge_amp 만.

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const CLASS_EXCLUSIVE = 'cleric';

// 갈래 1: 수호 (north_cleric_guard)
const GUARD_ZONE = 'north_cleric_guard';
const GUARD_NODES = [
  // T1 작은 7개
  { name: '신성한 살결 1', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 60 }], x: -10, y: -16 },
  { name: '신성한 살결 2', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 60 }], x: -9, y: -16 },
  { name: '신성한 살결 3', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 60 }], x: -8, y: -16 },
  { name: '굳건한 신앙 1', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 80 }], x: -7, y: -16 },
  { name: '굳건한 신앙 2', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 80 }], x: -6, y: -16 },
  { name: '강건한 의지 1', tier: 'small', cost: 1, effects: [{ stat: 'vit', type: 'stat', value: 6 }], x: -10, y: -15 },
  { name: '강건한 의지 2', tier: 'small', cost: 1, effects: [{ stat: 'vit', type: 'stat', value: 6 }], x: -9, y: -15 },
  // T2 중간 5개
  { name: '회복의 손길 1', tier: 'medium', cost: 2, effects: [{ key: 'heal_amp', type: 'passive', value: 15 }], x: -8, y: -15 },
  { name: '회복의 손길 2', tier: 'medium', cost: 2, effects: [{ key: 'heal_amp', type: 'passive', value: 15 }], x: -7, y: -15 },
  { name: '자가 치유', tier: 'medium', cost: 2, effects: [{ key: 'heal_amp', type: 'passive', value: 25 }], x: -6, y: -15 },
  { name: '신성한 보호', tier: 'medium', cost: 2, effects: [{ key: 'incoming_dmg_pct_down', type: 'passive', value: 10 }], x: -5, y: -15 },
  { name: '수호의 권능', tier: 'medium', cost: 2, effects: [{ stat: 'vit', type: 'stat', value: 15 }], x: -4, y: -15 },
  // T2 키스톤
  { name: '신성한 보호막', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_divine_aegis', type: 'passive', value: 1 }], x: -7, y: -14 },
  // T3 큰 3개
  { name: '방벽 강화', tier: 'large', cost: 3, effects: [{ key: 'shield_amp', type: 'passive', value: 30 }], x: -9, y: -13 },
  { name: '흔들림 없는 신앙', tier: 'large', cost: 3, effects: [{ key: 'incoming_dmg_pct_down', type: 'passive', value: 8 }], x: -8, y: -13 },
  { name: '영원한 회복', tier: 'large', cost: 3, effects: [{ key: 'heal_amp', type: 'passive', value: 30 }], x: -7, y: -13 },
  // T3 키스톤
  { name: '부서지지 않는 신앙', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_unbreakable_faith', type: 'passive', value: 1 }], x: -7, y: -12 },
];

// 갈래 2: 광명 (north_cleric_radiant)
const RADIANT_ZONE = 'north_cleric_radiant';
const RADIANT_NODES = [
  // T1 작은 7개
  { name: '광명의 의지 1', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 60 }], x: 3, y: -16 },
  { name: '광명의 의지 2', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 60 }], x: 4, y: -16 },
  { name: '광명의 의지 3', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 60 }], x: 5, y: -16 },
  { name: '빛의 가속 1', tier: 'small', cost: 1, effects: [{ stat: 'spd', type: 'stat', value: 10 }], x: 6, y: -16 },
  { name: '빛의 가속 2', tier: 'small', cost: 1, effects: [{ stat: 'spd', type: 'stat', value: 10 }], x: 7, y: -16 },
  { name: '신성한 결의 1', tier: 'small', cost: 1, effects: [{ stat: 'cri', type: 'stat', value: 3 }], x: 3, y: -15 },
  { name: '신성한 결의 2', tier: 'small', cost: 1, effects: [{ stat: 'cri', type: 'stat', value: 3 }], x: 4, y: -15 },
  // T2 중간 5개
  { name: '신성 권능 1', tier: 'medium', cost: 2, effects: [{ key: 'judge_amp', type: 'passive', value: 10 }], x: 5, y: -15 },
  { name: '신성 권능 2', tier: 'medium', cost: 2, effects: [{ key: 'judge_amp', type: 'passive', value: 10 }], x: 6, y: -15 },
  { name: '빠른 시전', tier: 'medium', cost: 2, effects: [{ stat: 'spd', type: 'stat', value: 100 }], x: 7, y: -15 },
  { name: '광명의 화살', tier: 'medium', cost: 2, effects: [{ key: 'paragon_hp_pct', type: 'passive', value: 10 }], x: 8, y: -15 },
  { name: '강건한 신성', tier: 'medium', cost: 2, effects: [{ key: 'hp_flat', type: 'passive', value: 100 }], x: 9, y: -15 },
  // T2 키스톤
  { name: '광휘의 폭발', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_radiant_burst', type: 'passive', value: 1 }], x: 6, y: -14 },
  // T3 큰 3개
  { name: '신성한 정수', tier: 'large', cost: 3, effects: [{ key: 'judge_amp', type: 'passive', value: 20 }], x: 4, y: -13 },
  { name: '회심의 신성', tier: 'large', cost: 3, effects: [{ stat: 'cri', type: 'stat', value: 8 }], x: 5, y: -13 },
  { name: '영원한 광명', tier: 'large', cost: 3, effects: [{ key: 'hp_flat', type: 'passive', value: 150 }], x: 6, y: -13 },
  // T3 키스톤
  { name: '새벽의 사자', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_dawn_breaker', type: 'passive', value: 1 }], x: 6, y: -12 },
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
    console.log('성직자 전용 노드 추가 시작 — 수호 17 + 광명 17 = 34 노드');
    await insertBranch(client, GUARD_ZONE, GUARD_NODES, '수호');
    await insertBranch(client, RADIANT_ZONE, RADIANT_NODES, '광명');
    await client.query('COMMIT');
    console.log('성직자 전용 노드 추가 완료');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('실패:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
