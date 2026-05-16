// 전사 전용 노드 추가 — 광전사 (north_warrior_berserk) + 수호자 (north_warrior_guard).
// 각 갈래 17 노드 = 직업 34 노드. 비용 작은 1 / 중간 2 / 큰 3 / 키스톤 4.
// 기존 core 47 와 별도. 같은 node_points 풀 사용.

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const CLASS_EXCLUSIVE = 'warrior';

// 갈래 1: 광전사 (north_warrior_berserk) — 위치 좌상단 영역 ~ x: -10..-3, y: -16..-10
const BERSERK_ZONE = 'north_warrior_berserk';
const BERSERK_NODES = [
  // T1 작은 7개
  { name: '격노의 근력 1', tier: 'small', cost: 1, effects: [{ stat: 'str', type: 'stat', value: 4 }], x: -10, y: -16 },
  { name: '격노의 근력 2', tier: 'small', cost: 1, effects: [{ stat: 'str', type: 'stat', value: 4 }], x: -9, y: -16 },
  { name: '격노의 근력 3', tier: 'small', cost: 1, effects: [{ stat: 'str', type: 'stat', value: 4 }], x: -8, y: -16 },
  { name: '격노의 일격 1', tier: 'small', cost: 1, effects: [{ key: 'paragon_atk_pct', type: 'passive', value: 2 }], x: -10, y: -15 },
  { name: '격노의 일격 2', tier: 'small', cost: 1, effects: [{ key: 'paragon_atk_pct', type: 'passive', value: 2 }], x: -9, y: -15 },
  { name: '격노의 예감 1', tier: 'small', cost: 1, effects: [{ stat: 'cri', type: 'stat', value: 3 }], x: -8, y: -15 },
  { name: '격노의 예감 2', tier: 'small', cost: 1, effects: [{ stat: 'cri', type: 'stat', value: 3 }], x: -7, y: -15 },
  // T2 중간 5개
  { name: '출혈 강화 1', tier: 'medium', cost: 2, effects: [{ key: 'bleed_amp', type: 'passive', value: 15 }], x: -10, y: -14 },
  { name: '출혈 강화 2', tier: 'medium', cost: 2, effects: [{ key: 'bleed_amp', type: 'passive', value: 15 }], x: -9, y: -14 },
  { name: '깊은 상처', tier: 'medium', cost: 2, effects: [{ key: 'dot_duration_bonus', type: 'passive', value: 1 }], x: -8, y: -14 },
  { name: '광기의 충동', tier: 'medium', cost: 2, effects: [{ key: 'proc_next_skill_amp_pct', type: 'passive', value: 10 }], x: -7, y: -14 },
  { name: '광전사의 본능', tier: 'medium', cost: 2, effects: [{ key: 'paragon_atk_pct', type: 'passive', value: 5 }], x: -6, y: -14 },
  // T2 키스톤
  { name: '분노의 파동', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_furor_pulse', type: 'passive', value: 1 }], x: -8, y: -13 },
  // T3 큰 3개
  { name: '광폭한 일격', tier: 'large', cost: 3, effects: [{ stat: 'cri', type: 'stat', value: 5 }], x: -10, y: -12 },
  { name: '피의 갈증', tier: 'large', cost: 3, effects: [{ key: 'kill_hp_recover_pct', type: 'passive', value: 5 }], x: -9, y: -12 },
  { name: '야성의 분노', tier: 'large', cost: 3, effects: [{ key: 'paragon_atk_pct', type: 'passive', value: 4 }], x: -8, y: -12 },
  // T3 키스톤
  { name: '폭발하는 분노', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_explosive_rage', type: 'passive', value: 1 }], x: -8, y: -11 },
];

// 갈래 2: 수호자 (north_warrior_guard) — 위치 우상단 영역 ~ x: 3..10, y: -16..-10
const GUARD_ZONE = 'north_warrior_guard';
const GUARD_NODES = [
  // T1 작은 7개
  { name: '강철의 살결 1', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 50 }], x: 3, y: -16 },
  { name: '강철의 살결 2', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 50 }], x: 4, y: -16 },
  { name: '강철의 살결 3', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 50 }], x: 5, y: -16 },
  { name: '굳건한 의지 1', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 80 }], x: 6, y: -16 },
  { name: '굳건한 의지 2', tier: 'small', cost: 1, effects: [{ key: 'hp_flat', type: 'passive', value: 80 }], x: 7, y: -16 },
  { name: '강건한 체력 1', tier: 'small', cost: 1, effects: [{ stat: 'vit', type: 'stat', value: 5 }], x: 3, y: -15 },
  { name: '강건한 체력 2', tier: 'small', cost: 1, effects: [{ stat: 'vit', type: 'stat', value: 5 }], x: 4, y: -15 },
  // T2 중간 5개
  { name: '견고한 방어 1', tier: 'medium', cost: 2, effects: [{ stat: 'vit', type: 'stat', value: 10 }], x: 5, y: -15 },
  { name: '견고한 방어 2', tier: 'medium', cost: 2, effects: [{ stat: 'vit', type: 'stat', value: 12 }], x: 6, y: -15 },
  // 도발 메커니즘이 게임에 없어 '도발의 의지'(방어 강화)로 변경. 비슷한 컨셉으로 활력 +15 부여.
  { name: '도발의 의지', tier: 'medium', cost: 2, effects: [{ stat: 'vit', type: 'stat', value: 15 }], x: 7, y: -15 },
  { name: '흔들림 없는 자세', tier: 'medium', cost: 2, effects: [{ key: 'incoming_dmg_pct_down', type: 'passive', value: 5 }], x: 8, y: -15 },
  { name: '수호의 본능', tier: 'medium', cost: 2, effects: [{ key: 'paragon_def_pct', type: 'passive', value: 10 }], x: 9, y: -15 },
  // T2 키스톤
  { name: '강철의 의지', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_iron_resolve', type: 'passive', value: 1 }], x: 6, y: -14 },
  // T3 큰 3개
  { name: '반격', tier: 'large', cost: 3, effects: [{ key: 'counter_chance_pct', type: 'passive', value: 50 }], x: 4, y: -13 },
  { name: '방벽 강화', tier: 'large', cost: 3, effects: [{ key: 'shield_amp', type: 'passive', value: 20 }], x: 5, y: -13 },
  { name: '불굴의 정신', tier: 'large', cost: 3, effects: [{ key: 'incoming_dmg_pct_down', type: 'passive', value: 8 }], x: 6, y: -13 },
  // T3 키스톤
  { name: '응징의 방벽', tier: 'keystone', cost: 4, effects: [{ key: 'paragon_vengeful_bulwark', type: 'passive', value: 1 }], x: 6, y: -12 },
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
    console.log('전사 전용 노드 추가 시작 — 광전사 17 + 수호자 17 = 34 노드');
    await insertBranch(client, BERSERK_ZONE, BERSERK_NODES, '광전사');
    await insertBranch(client, GUARD_ZONE, GUARD_NODES, '수호자');
    await client.query('COMMIT');
    console.log('전사 전용 노드 추가 완료');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('실패:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
