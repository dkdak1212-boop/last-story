// 소환사 전용 노드트리 (200개) — zone='소환사 전용', class_exclusive='summoner'
// 기존 core 트리는 한 줄도 건드리지 않음. 같은 node_points 풀 사용.
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const ZONE = '소환사 전용';

// ── 효과 풀 ──
// 50% 스탯, 45% 소환수 패시브, 5% 키스톤
const STAT_KEYS = ['str', 'dex', 'int', 'vit', 'spd', 'cri'];
const STAT_LABEL = { str: '힘', dex: '민첩', int: '지능', vit: '체력', spd: '스피드', cri: '치명타' };

// 소환수 강화 패시브 (key, label, small/medium/large 값)
const SUMMON_PASSIVES = [
  { key: 'summon_amp',         label: '소환수 데미지', s: 5,  m: 12, l: 25 },
  { key: 'summon_dot_amp',     label: '소환수 도트', s: 8, m: 18, l: 35 },
  { key: 'summon_speed_amp',   label: '소환수 스피드', s: 4, m: 10, l: 20 },
  { key: 'summon_tankiness',   label: '소환수 방어', s: 5, m: 12, l: 25 },
  { key: 'summon_heal_amp',    label: '소환수 회복', s: 10, m: 25, l: 50 },
  { key: 'summon_lifesteal',   label: '소환수 흡혈', s: 2, m: 5, l: 10 },
  { key: 'summon_sacrifice_amp', label: '폭발 강화', s: 8, m: 20, l: 40 },
  { key: 'summon_cd_reduce',   label: '소환 쿨감', s: 1, m: 1, l: 1 },
  { key: 'summon_max_extra',   label: '추가 소환', s: 1, m: 1, l: 1 },
];

// ── 좌표/배치 ──
// 넓직하게: x [-9..9], y [-12..12]. 4분면으로 50개씩 배치.
// 각 분면: 1 huge + 4 large + ~12 medium + ~33 small = 50

function makeNode(id, name, desc, tier, cost, effects, x, y) {
  return { id, name, description: desc, zone: ZONE, tier, cost, class_exclusive: 'summoner', effects, position_x: x, position_y: y };
}

function rng(seed) { // 결정론적 — 재실행 시 동일
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
}
const rand = rng(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// 분면별 위치 생성기
function quadrantPositions(originX, originY, dirX, dirY, large, medium, small) {
  // origin 근처에 huge, 그 주변 4개 large, 그 주변 medium, 외곽 small
  const positions = { huge: [], large: [], medium: [], small: [] };
  positions.huge.push([originX, originY]);
  // large: 4개를 huge 주변 ±2 거리
  positions.large.push([originX + 2*dirX, originY]);
  positions.large.push([originX, originY + 2*dirY]);
  positions.large.push([originX + 2*dirX, originY + 2*dirY]);
  positions.large.push([originX + 4*dirX, originY + dirY]);
  // medium: 12개. 거리 1~3 그리드에서 large/huge 안 겹치는 칸
  const usedSet = new Set();
  positions.large.concat(positions.huge).forEach(([x,y]) => usedSet.add(`${x},${y}`));
  const tryAdd = (target, x, y) => {
    if (usedSet.has(`${x},${y}`)) return false;
    target.push([x, y]); usedSet.add(`${x},${y}`); return true;
  };
  // medium 영역: 거리 1~3
  for (let dy = 0; dy <= 4 && positions.medium.length < medium; dy++) {
    for (let dx = 0; dx <= 4 && positions.medium.length < medium; dx++) {
      if (dx + dy === 0) continue;
      tryAdd(positions.medium, originX + dx*dirX, originY + dy*dirY);
    }
  }
  // small: 외곽 (거리 3~6)
  for (let dy = 0; dy <= 7 && positions.small.length < small; dy++) {
    for (let dx = 0; dx <= 7 && positions.small.length < small; dx++) {
      if (dx + dy < 2) continue; // 가까운 건 제외
      tryAdd(positions.small, originX + dx*dirX, originY + dy*dirY);
    }
  }
  return positions;
}

(async () => {
  // 기존 max id 확인
  const maxR = await pool.query(`SELECT COALESCE(MAX(id), 0) AS m FROM node_definitions`);
  let nextId = maxR.rows[0].m + 1;
  console.log(`시작 id: ${nextId}`);

  // 기존 zone='소환사 전용' 노드 있으면 (재실행) — 삭제 후 다시 만들기
  const existing = await pool.query(`SELECT id FROM node_definitions WHERE zone = $1`, [ZONE]);
  if (existing.rowCount > 0) {
    console.log(`기존 ${ZONE} 노드 ${existing.rowCount}개 발견 — 삭제`);
    await pool.query(`DELETE FROM character_nodes WHERE node_id = ANY($1::int[])`, [existing.rows.map(r => r.id)]);
    await pool.query(`DELETE FROM node_definitions WHERE zone = $1`, [ZONE]);
    // 다시 max id
    const m2 = await pool.query(`SELECT COALESCE(MAX(id), 0) AS m FROM node_definitions`);
    nextId = m2.rows[0].m + 1;
  }

  // 4분면 정의: (originX, originY, dirX, dirY)
  const quads = [
    { ox: -3, oy: -8, dx: -1, dy: -1 }, // 좌상
    { ox:  3, oy: -8, dx:  1, dy: -1 }, // 우상
    { ox: -3, oy:  8, dx: -1, dy:  1 }, // 좌하
    { ox:  3, oy:  8, dx:  1, dy:  1 }, // 우하
  ];

  const allNodes = [];
  let smallTotal = 0, mediumTotal = 0, largeTotal = 0, hugeTotal = 0;

  for (let qi = 0; qi < quads.length; qi++) {
    const q = quads[qi];
    // 50개씩: 1 huge + 4 large + 12 medium + 33 small
    const pos = quadrantPositions(q.ox, q.oy, q.dx, q.dy, 4, 12, 33);

    // ── huge (분면당 1개) — 키스톤 ──
    const hugeEffects = [
      { type: 'passive', key: 'summon_amp', value: 60 + qi * 10 },
      { type: 'passive', key: 'summon_max_extra', value: 1 },
    ];
    const [hx, hy] = pos.huge[0];
    const hugeNames = ['만물의 군주 II', '영혼 폭군', '계약의 황제', '소환 신화'];
    allNodes.push(makeNode(nextId++, hugeNames[qi], `소환수 데미지 +${60+qi*10}%, 추가 소환 +1`,
      'huge', 5, hugeEffects, hx, hy));
    hugeTotal++;

    // ── large (분면당 4개) — 강력 효과 ──
    const largeOptions = [
      { effs: [{ type: 'passive', key: 'summon_amp', value: 35 }, { type: 'passive', key: 'summon_lifesteal', value: 10 }], name: '맹수의 의지', desc: '소환수 데미지 +35%, 흡혈 +10%' },
      { effs: [{ type: 'passive', key: 'summon_dot_amp', value: 50 }], name: '맹독의 군주', desc: '소환수 도트 +50%' },
      { effs: [{ type: 'passive', key: 'summon_speed_amp', value: 30 }, { type: 'passive', key: 'summon_amp', value: 20 }], name: '질풍 소환', desc: '소환수 스피드 +30%, 데미지 +20%' },
      { effs: [{ type: 'passive', key: 'summon_tankiness', value: 50 }, { type: 'passive', key: 'summon_heal_amp', value: 50 }], name: '불멸의 권속', desc: '소환수 방어 +50%, 회복 +50%' },
      { effs: [{ type: 'passive', key: 'summon_sacrifice_amp', value: 60 }], name: '희생의 화염', desc: '폭발 강화 +60%' },
      { effs: [{ type: 'passive', key: 'summon_cd_reduce', value: 1 }, { type: 'passive', key: 'summon_amp', value: 25 }], name: '신속 계약', desc: '소환 쿨감 -1, 데미지 +25%' },
    ];
    for (let i = 0; i < pos.large.length; i++) {
      const [x, y] = pos.large[i];
      const opt = largeOptions[(qi * 4 + i) % largeOptions.length];
      allNodes.push(makeNode(nextId++, `${opt.name} ${qi+1}-${i+1}`, opt.desc, 'large', 3, opt.effs, x, y));
      largeTotal++;
    }

    // ── medium (분면당 12개) — 스탯 또는 패시브 ──
    for (let i = 0; i < pos.medium.length; i++) {
      const [x, y] = pos.medium[i];
      // 절반은 스탯, 절반은 패시브
      if (i % 2 === 0) {
        const stat = STAT_KEYS[(qi*12 + i) % STAT_KEYS.length];
        const val = (stat === 'cri') ? 4 : 12;
        allNodes.push(makeNode(nextId++,
          `${STAT_LABEL[stat]} 강화 ${qi+1}-${Math.floor(i/2)+1}`,
          `${STAT_LABEL[stat]} +${val}`,
          'medium', 2, [{ type: 'stat', stat, value: val }], x, y));
      } else {
        const p = SUMMON_PASSIVES[(qi*6 + Math.floor(i/2)) % SUMMON_PASSIVES.length];
        allNodes.push(makeNode(nextId++,
          `${p.label} M ${qi+1}-${Math.floor(i/2)+1}`,
          `${p.label} +${p.m}`,
          'medium', 2, [{ type: 'passive', key: p.key, value: p.m }], x, y));
      }
      mediumTotal++;
    }

    // ── small (분면당 33개) — 스탯 위주 ──
    for (let i = 0; i < pos.small.length; i++) {
      const [x, y] = pos.small[i];
      // 70% 스탯, 30% 약한 패시브
      if (i % 10 < 7) {
        const stat = STAT_KEYS[(qi*33 + i) % STAT_KEYS.length];
        const val = (stat === 'cri') ? 1 : 5;
        allNodes.push(makeNode(nextId++,
          `${STAT_LABEL[stat]} 작은 강화 ${qi+1}-${i+1}`,
          `${STAT_LABEL[stat]} +${val}`,
          'small', 1, [{ type: 'stat', stat, value: val }], x, y));
      } else {
        const p = SUMMON_PASSIVES[(qi*8 + i) % SUMMON_PASSIVES.length];
        allNodes.push(makeNode(nextId++,
          `${p.label} S ${qi+1}-${i+1}`,
          `${p.label} +${p.s}`,
          'small', 1, [{ type: 'passive', key: p.key, value: p.s }], x, y));
      }
      smallTotal++;
    }
  }

  console.log(`\n분포: small=${smallTotal} medium=${mediumTotal} large=${largeTotal} huge=${hugeTotal} (총 ${allNodes.length})`);

  // INSERT 일괄
  for (const n of allNodes) {
    await pool.query(
      `INSERT INTO node_definitions (id, name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '{}', $9, $10)`,
      [n.id, n.name, n.description, n.zone, n.tier, n.cost, n.class_exclusive, JSON.stringify(n.effects), n.position_x, n.position_y]
    );
  }
  console.log(`INSERT 완료: ${allNodes.length}개`);

  // 좌표 충돌 점검
  const dup = await pool.query(`
    SELECT position_x, position_y, COUNT(*)::int AS c FROM node_definitions
    WHERE zone = $1 GROUP BY position_x, position_y HAVING COUNT(*) > 1
  `, [ZONE]);
  if (dup.rowCount > 0) console.warn('⚠️ 좌표 중복:', dup.rows);
  else console.log('좌표 중복 없음');

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
