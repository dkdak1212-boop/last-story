/**
 * 도적 분기형 노드 (north_rogue) — D4 파라곤 스타일
 * 시작점 1개 → 3갈래 분기 (암살자/칼바람/독술사), 각 8노드 = 총 25개
 * hidden=true (어드민 테스트용)
 * 다른 직업 절대 안 건드림
 */
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const ZONE = 'north_rogue';
const CLASS = 'rogue';

(async () => {
  console.log('=== 도적 분기형 노드 생성 ===');

  // 기존 north_rogue 도적 노드만 삭제
  const existing = await pool.query(
    'SELECT id FROM node_definitions WHERE zone = $1 AND class_exclusive = $2', [ZONE, CLASS]
  );
  if (existing.rowCount > 0) {
    const ids = existing.rows.map(r => r.id);
    await pool.query('DELETE FROM character_nodes WHERE node_id = ANY($1::int[])', [ids]);
    await pool.query('DELETE FROM node_definitions WHERE id = ANY($1::int[])', [ids]);
    console.log(`기존 north_rogue 도적 노드 ${ids.length}개 삭제`);
  }

  const maxR = await pool.query('SELECT COALESCE(MAX(id), 0) AS m FROM node_definitions');
  let nextId = maxR.rows[0].m + 1;
  const startId = nextId;
  const allNodes = [];

  function addNode(name, desc, tier, cost, effects, x, y, prereqIndices = []) {
    const id = nextId++;
    const idx = allNodes.length;
    allNodes.push({ id, name, desc, tier, cost, effects, x, y, prereqIndices });
    return idx;
  }

  // ════════════════════════════════════════
  // 루트
  // ════════════════════════════════════════
  const root = addNode('도적의 길', 'DEX +12, SPD +8', 'small', 1,
    [{ type: 'stat', stat: 'dex', value: 12 }, { type: 'stat', stat: 'spd', value: 8 }],
    0, 0);

  // ════════════════════════════════════════
  // 분기 A: 암살자의 길 (왼쪽 위) — 치명타/즉사/첫타
  // ════════════════════════════════════════
  const a1 = addNode('암살 입문', 'CRI +6, STR +8', 'small', 1,
    [{ type: 'stat', stat: 'cri', value: 6 }, { type: 'stat', stat: 'str', value: 8 }],
    -3, -2, [root]);
  const a2 = addNode('급소 파악', '치명타 데미지 +10%', 'small', 1,
    [{ type: 'passive', key: 'crit_damage', value: 10 }],
    -4, -4, [a1]);
  const a3 = addNode('은밀한 접근', '방어 관통 +10%', 'medium', 2,
    [{ type: 'passive', key: 'armor_pierce', value: 10 }],
    -5, -6, [a2]);
  const a4 = addNode('그림자 일격', '첫 스킬 데미지 +25%', 'medium', 2,
    [{ type: 'passive', key: 'shadow_strike', value: 25 }],
    -6, -8, [a3]);
  const a5 = addNode('처형자의 눈', 'CRI +10, 치명타 데미지 +15%', 'large', 3,
    [{ type: 'stat', stat: 'cri', value: 10 }, { type: 'passive', key: 'crit_damage', value: 15 }],
    -7, -10, [a4]);
  const a6 = addNode('사형 선고', '방어 관통 +12%, 치명타 흡혈 +4%', 'medium', 2,
    [{ type: 'passive', key: 'armor_pierce', value: 12 }, { type: 'passive', key: 'crit_lifesteal', value: 4 }],
    -7, -12, [a5]);
  const a7 = addNode('절대 관통', '방어 관통 +15%, 치명타 데미지 +18%', 'large', 3,
    [{ type: 'passive', key: 'armor_pierce', value: 15 }, { type: 'passive', key: 'crit_damage', value: 18 }],
    -6, -14, [a6]);
  const a8 = addNode('그림자 처형', '치명타 시 적 HP 15% 이하 30% 즉사\n첫 스킬 데미지 +35%', 'huge', 5,
    [{ type: 'passive', key: 'assassin_execute', value: 30 }, { type: 'passive', key: 'shadow_strike', value: 35 }],
    -5, -17, [a7]);

  // ════════════════════════════════════════
  // 분기 B: 칼바람의 길 (오른쪽 위) — 속도/다중타/추가타
  // ════════════════════════════════════════
  const b1 = addNode('칼바람 입문', 'SPD +14', 'small', 1,
    [{ type: 'stat', stat: 'spd', value: 14 }],
    3, -2, [root]);
  const b2 = addNode('이도류 수련', '추가 타격 확률 +6%', 'small', 1,
    [{ type: 'passive', key: 'extra_hit', value: 6 }],
    4, -4, [b1]);
  const b3 = addNode('칼날 난무', '칼날 추가타 확률 +10%', 'medium', 2,
    [{ type: 'passive', key: 'blade_flurry', value: 10 }],
    5, -6, [b2]);
  const b4 = addNode('질풍 가속', 'SPD +25, 연쇄 행동 +10%', 'medium', 2,
    [{ type: 'stat', stat: 'spd', value: 25 }, { type: 'passive', key: 'chain_action_amp', value: 10 }],
    6, -8, [b3]);
  const b5 = addNode('검풍 폭발', 'multi_hit 누적 +15%, 추가 타격 +8%', 'large', 3,
    [{ type: 'passive', key: 'blade_storm_amp', value: 15 }, { type: 'passive', key: 'extra_hit', value: 8 }],
    7, -10, [b4]);
  const b6 = addNode('폭풍 가속', 'SPD→데미지 변환 40%, SPD +18', 'medium', 2,
    [{ type: 'passive', key: 'speed_to_dmg', value: 40 }, { type: 'stat', stat: 'spd', value: 18 }],
    7, -12, [b5]);
  const b7 = addNode('만검난무', '칼날 추가타 +18%, 연쇄 행동 +15%', 'large', 3,
    [{ type: 'passive', key: 'blade_flurry', value: 18 }, { type: 'passive', key: 'chain_action_amp', value: 15 }],
    6, -14, [b6]);
  const b8 = addNode('칼날 폭풍', '칼날 추가타 +25%\n추가 타격 +12%\n킬 시 쿨다운 -3', 'huge', 5,
    [{ type: 'passive', key: 'blade_flurry', value: 25 }, { type: 'passive', key: 'extra_hit', value: 12 }, { type: 'passive', key: 'lethal_tempo', value: 3 }],
    5, -17, [b7]);

  // ════════════════════════════════════════
  // 분기 C: 독술사의 길 (아래) — 독/연속킬/도트
  // ════════════════════════════════════════
  const c1 = addNode('독 숙련', '독 증폭 +10%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 10 }],
    0, 3, [root]);
  const c2 = addNode('맹독 연마', '독 증폭 +12%, 독 폭발 +6%', 'small', 1,
    [{ type: 'passive', key: 'poison_amp', value: 12 }, { type: 'passive', key: 'poison_burst_amp', value: 6 }],
    0, 5, [c1]);
  const c3 = addNode('독의 달인', '독 폭발 +12%, 도트 증폭 +10%', 'medium', 2,
    [{ type: 'passive', key: 'poison_burst_amp', value: 12 }, { type: 'passive', key: 'dot_amp', value: 10 }],
    0, 7, [c2]);
  const c4 = addNode('연쇄 살육', '연속킬 보너스 +10%, 킬 시 쿨다운 -1', 'medium', 2,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 10 }, { type: 'passive', key: 'lethal_tempo', value: 1 }],
    -1, 9, [c3]);
  const c5 = addNode('학살 본능', '연속킬 +15%, 치명타 데미지 +10%', 'large', 3,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 15 }, { type: 'passive', key: 'crit_damage', value: 10 }],
    1, 11, [c4]);
  const c6 = addNode('맹독의 군주', '독 증폭 +20%, 독 폭발 +15%', 'medium', 2,
    [{ type: 'passive', key: 'poison_amp', value: 20 }, { type: 'passive', key: 'poison_burst_amp', value: 15 }],
    -1, 13, [c5]);
  const c7 = addNode('전장의 지배자', '연속킬 +18%, STR +30', 'large', 3,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 18 }, { type: 'stat', stat: 'str', value: 30 }],
    1, 15, [c6]);
  const c8 = addNode('만검귀환', '연속킬 +20% (최대5중첩)\n킬 시 쿨다운 -3\n치명타 데미지 +22%', 'huge', 5,
    [{ type: 'passive', key: 'combo_kill_bonus', value: 20 }, { type: 'passive', key: 'lethal_tempo', value: 3 }, { type: 'passive', key: 'crit_damage', value: 22 }],
    0, 18, [c7]);

  // ════════════════════════════════════════
  // DB 삽입
  // ════════════════════════════════════════
  console.log(`총 노드: ${allNodes.length}개`);

  for (const n of allNodes) {
    const prereqs = n.prereqIndices.map(idx => allNodes[idx].id);
    await pool.query(
      `INSERT INTO node_definitions (id, name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, TRUE)`,
      [n.id, n.name, n.desc, ZONE, n.tier, n.cost, CLASS,
       JSON.stringify(n.effects), prereqs, n.x, n.y]
    );
  }

  console.log(`${allNodes.length}개 노드 삽입 (ID ${startId}~${nextId - 1})`);

  // 확인
  const check = await pool.query(
    'SELECT tier, COUNT(*) AS cnt FROM node_definitions WHERE zone = $1 AND class_exclusive = $2 GROUP BY tier ORDER BY tier',
    [ZONE, CLASS]
  );
  for (const r of check.rows) console.log(`  ${r.tier}: ${r.cnt}개`);

  // 다른 직업 안 건드렸는지 확인
  const others = await pool.query(
    "SELECT class_exclusive, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive != 'rogue' OR class_exclusive IS NULL GROUP BY class_exclusive"
  );
  console.log('다른 직업 (변경 없어야 함):');
  for (const r of others.rows) console.log(`  ${r.class_exclusive || 'null'}: ${r.cnt}개`);

  // 분기별 총 코스트
  const branchA = [a1,a2,a3,a4,a5,a6,a7,a8].map(i => allNodes[i].cost).reduce((a,b)=>a+b,0);
  const branchB = [b1,b2,b3,b4,b5,b6,b7,b8].map(i => allNodes[i].cost).reduce((a,b)=>a+b,0);
  const branchC = [c1,c2,c3,c4,c5,c6,c7,c8].map(i => allNodes[i].cost).reduce((a,b)=>a+b,0);
  console.log(`분기 코스트: 루트 1pt + 암살자 ${branchA}pt + 칼바람 ${branchB}pt + 독술사 ${branchC}pt`);
  console.log(`1분기 풀빌드: ${1 + branchA}pt / 2분기: ${1 + branchA + branchB}pt / 올투자: ${1 + branchA + branchB + branchC}pt`);

  await pool.end();
  console.log('=== 완료 ===');
})().catch(e => { console.error(e); process.exit(1); });
