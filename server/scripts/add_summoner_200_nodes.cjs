const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const E = (effects) => JSON.stringify(effects);
const P = (key, value) => ({ type: 'passive', key, value });
const S = (stat, value) => ({ type: 'stat', stat, value });

// === 소환사 신규 200개 노드 ===
// tier: small 140 / medium 48 / large 10 / huge 2

const ELEMENTS = [
  { key: 'fire',      label: '화염' },
  { key: 'frost',     label: '빙결' },
  { key: 'lightning', label: '번개' },
  { key: 'earth',     label: '대지' },
  { key: 'holy',      label: '신성' },
  { key: 'dark',      label: '암흑' },
];

const smalls = [];
const mediums = [];
const larges = [];
const huges = [];

// ═══ SMALL (140개) ═══
// 원소별 소형 강화 — fire/frost 24개, 나머지 4원소 23개씩 = 24+24+23+23+23+23=140
function smallCountFor(idx) { return idx < 2 ? 24 : 23; }

const smallSuffixes = [
  { desc: '데미지 +3%',       fx: (k, v) => [P(`summon_${k}_dmg`, 3)] },
  { desc: '치명타 +1%',       fx: (k, v) => [P(`summon_${k}_crit`, 1)] },
  { desc: '속도 +3',          fx: (k, v) => [P(`summon_${k}_spd`, 3)] },
  { desc: 'HP +30',           fx: (k, v) => [P(`summon_${k}_hp`, 30)] },
  { desc: '관통 +2%',         fx: (k, v) => [P(`summon_${k}_pen`, 2)] },
  { desc: '치명 데미지 +3%',  fx: (k, v) => [P(`summon_${k}_crit_dmg`, 3)] },
  { desc: '저항 관통 +2%',    fx: (k, v) => [P(`summon_${k}_res_pen`, 2)] },
  { desc: '방어 +3',          fx: (k, v) => [P(`summon_${k}_def`, 3)] },
];

for (let e = 0; e < ELEMENTS.length; e++) {
  const el = ELEMENTS[e];
  const count = smallCountFor(e);
  for (let i = 0; i < count; i++) {
    const sfx = smallSuffixes[i % smallSuffixes.length];
    smalls.push({
      name: `${el.label} 소환 ${i + 1}`,
      desc: `${el.label} 소환수 ${sfx.desc}`,
      effects: E(sfx.fx(el.key, null)),
    });
  }
}

// ═══ MEDIUM (48개) ═══
// 원소 중급 24 (원소×4) + 타입 중급 16 (타입×4) + 오오라 중급 8
const elementMediumPatterns = [
  { suffix: '중급 I',  desc: (l) => `${l} 소환수 데미지 +15%`,   fx: (k) => [P(`summon_${k}_dmg`, 15)] },
  { suffix: '중급 II', desc: (l) => `${l} 소환수 관통 +10%`,     fx: (k) => [P(`summon_${k}_pen`, 10)] },
  { suffix: '중급 III',desc: (l) => `${l} 소환수 치명 +8%`,      fx: (k) => [P(`summon_${k}_crit`, 8)] },
  { suffix: '중급 IV', desc: (l) => `${l} 소환수 디버프 지속 +1행동`, fx: (k) => [P(`summon_${k}_debuff_dur`, 1)] },
];

for (const el of ELEMENTS) {
  for (const pat of elementMediumPatterns) {
    mediums.push({
      name: `${el.label} 전문 ${pat.suffix}`,
      desc: pat.desc(el.label),
      effects: E(pat.fx(el.key)),
    });
  }
}

const SUMMON_TYPES = [
  { key: 'tank',    label: '탱커' },
  { key: 'dps',     label: '딜러' },
  { key: 'support', label: '서포터' },
  { key: 'hybrid',  label: '하이브리드' },
];

const typeMediumPatterns = [
  { suffix: 'I',   desc: (l, k) => `${l} 소환수 HP +20%`,       fx: (k) => [P(`summon_${k}_hp`, 20)] },
  { suffix: 'II',  desc: (l, k) => `${l} 소환수 공격 +18%`,      fx: (k) => [P(`summon_${k}_atk`, 18)] },
  { suffix: 'III', desc: (l, k) => `${l} 소환수 속도 +15`,       fx: (k) => [P(`summon_${k}_spd`, 15)] },
  { suffix: 'IV',  desc: (l, k) => `${l} 소환수 쿨다운 -1행동`,  fx: (k) => [P(`summon_${k}_cdr`, 1)] },
];

for (const t of SUMMON_TYPES) {
  for (const pat of typeMediumPatterns) {
    mediums.push({
      name: `${t.label} 특화 ${pat.suffix}`,
      desc: pat.desc(t.label, t.key),
      effects: E(pat.fx(t.key)),
    });
  }
}

const auraMediums = [
  { name: '공격 오오라 M', desc: '소환수 공격 +10%',      fx: [P('aura_dmg', 10)] },
  { name: '방어 오오라 M', desc: '소환수 방어 +10%',      fx: [P('aura_def', 10)] },
  { name: '속도 오오라 M', desc: '소환수 속도 +12',       fx: [P('aura_speed', 12)] },
  { name: '치유 오오라 M', desc: '소환수 HP 회복 +20%',   fx: [P('aura_heal', 20)] },
  { name: '치명 오오라 M', desc: '소환수 치명 +8%',       fx: [P('aura_crit', 8)] },
  { name: '관통 오오라 M', desc: '소환수 관통 +15%',      fx: [P('aura_pen', 15)] },
  { name: '흡혈 오오라 M', desc: '소환수 흡혈 +10%',      fx: [P('aura_lifesteal', 10)] },
  { name: '반사 오오라 M', desc: '소환수 피해 반사 10%',  fx: [P('aura_reflect', 10)] },
];
for (const a of auraMediums) mediums.push({ name: a.name, desc: a.desc, effects: E(a.fx) });

// ═══ LARGE (10개) ═══
larges.push(
  { name: '화염 군주의 축복',   desc: '화염 소환수 데미지 +50%',           effects: E([P('summon_fire_dmg', 50)]) },
  { name: '빙결의 지배',         desc: '빙결 소환수 공격 시 20% 확률 2행동 감속', effects: E([P('summon_frost_slow', 20), P('summon_frost_slow_dur', 2)]) },
  { name: '번개의 현신',         desc: '번개 소환수 치명타 +30%',           effects: E([P('summon_lightning_crit', 30)]) },
  { name: '대지의 수호',         desc: '대지 소환수 방어 +80%',             effects: E([P('summon_earth_def', 80)]) },
  { name: '신성한 은총',         desc: '신성 소환수 HP 회복량 2배',         effects: E([P('summon_holy_heal', 100)]) },
  { name: '암흑의 계약',         desc: '암흑 소환수 흡혈 +40%',             effects: E([P('summon_dark_lifesteal', 40)]) },
  { name: '탱커 오오라의 진수',  desc: '탱커 소환수 HP +60%',              effects: E([P('summon_tank_hp', 60)]) },
  { name: '딜러 오오라의 진수',  desc: '딜러 소환수 공격 +45%',             effects: E([P('summon_dps_atk', 45)]) },
  { name: '서포터 오오라의 진수',desc: '서포터 소환수 쿨다운 -1, 속도 +30',  effects: E([P('summon_support_cdr', 1), P('summon_support_spd', 30)]) },
  { name: '원소의 조화',         desc: '서로 다른 원소 2종 이상 소환 시 전체 데미지 +35%', effects: E([P('element_synergy', 35)]) },
);

// ═══ HUGE (2개) ═══
huges.push(
  { name: '원소 군주',      desc: '모든 원소 소환수 데미지 +60%, 15% 확률 원소 폭발',
    effects: E([P('summon_all_element_dmg', 60), P('summon_element_burst', 15)]) },
  { name: '오오라의 왕',    desc: '모든 오오라 효과 2배, 소환수 쿨다운 -2행동',
    effects: E([P('aura_multiplier', 2), P('summon_all_cdr', 2)]) },
);

console.log(`생성 예정: small=${smalls.length} medium=${mediums.length} large=${larges.length} huge=${huges.length} / total=${smalls.length + mediums.length + larges.length + huges.length}`);

// ═══ 방사형 외곽 배치 (radius 17~27) ═══
// 기존 244개는 중심 반경 ±15 내에 있음. 신규 200개는 16~27 외곽 링.
// 사용된 (x,y) 기록하여 중복 방지

const used = new Set();

// 기존 노드 위치 pre-load
async function loadUsedPositions() {
  const r = await pool.query(`SELECT position_x, position_y FROM node_definitions`);
  for (const row of r.rows) used.add(`${row.position_x},${row.position_y}`);
}

function placeOnRing(radius, count) {
  const positions = [];
  let placed = 0;
  let attempts = 0;
  let offset = 0;
  while (placed < count && attempts < count * 50) {
    const theta = (2 * Math.PI * (placed + offset * 0.13)) / count;
    const r = radius + (attempts > count ? ((attempts % 3) - 1) : 0);
    const x = Math.round(r * Math.cos(theta));
    const y = Math.round(r * Math.sin(theta));
    const key = `${x},${y}`;
    if (!used.has(key)) {
      used.add(key);
      positions.push({ x, y });
      placed++;
      offset = 0;
    } else {
      offset++;
    }
    attempts++;
  }
  if (placed < count) {
    // fallback: 빈 자리 스캔
    for (let r = radius; r <= radius + 3 && placed < count; r++) {
      for (let x = -r; x <= r && placed < count; x++) {
        for (let y = -r; y <= r && placed < count; y++) {
          if (Math.abs(x) !== r && Math.abs(y) !== r) continue;
          const key = `${x},${y}`;
          if (!used.has(key)) {
            used.add(key);
            positions.push({ x, y });
            placed++;
          }
        }
      }
    }
  }
  return positions;
}

(async () => {
  await loadUsedPositions();
  console.log(`기존 점유 position: ${used.size}`);

  // ID 시퀀스 리셋 (과거 삽입/삭제로 드리프트 가능성)
  await pool.query(`SELECT setval(pg_get_serial_sequence('node_definitions','id'), COALESCE((SELECT MAX(id) FROM node_definitions), 1))`);

  // ring 할당:
  // r=17: small 50
  // r=19: small 50
  // r=21: small 40
  // r=23: medium 48
  // r=25: large 10
  // r=27: huge 2
  const smallPos = [
    ...placeOnRing(17, 50),
    ...placeOnRing(19, 50),
    ...placeOnRing(21, 40),
  ];
  const mediumPos = placeOnRing(23, 48);
  const largePos  = placeOnRing(25, 10);
  const hugePos   = placeOnRing(27, 2);

  console.log(`배치 확보: small=${smallPos.length} medium=${mediumPos.length} large=${largePos.length} huge=${hugePos.length}`);

  if (smallPos.length !== 140 || mediumPos.length !== 48 || largePos.length !== 10 || hugePos.length !== 2) {
    throw new Error('position 배치 실패');
  }

  async function insertNode(n, tier, cost, pos) {
    await pool.query(
      `INSERT INTO node_definitions (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y)
       VALUES ($1, $2, '소환사 전용', $3, $4, 'summoner', $5::jsonb, null, $6, $7)`,
      [n.name, n.desc, tier, cost, n.effects, pos.x, pos.y]
    );
  }

  for (let i = 0; i < smalls.length; i++)  await insertNode(smalls[i],  'small',  1, smallPos[i]);
  for (let i = 0; i < mediums.length; i++) await insertNode(mediums[i], 'medium', 2, mediumPos[i]);
  for (let i = 0; i < larges.length; i++)  await insertNode(larges[i],  'large',  4, largePos[i]);
  for (let i = 0; i < huges.length; i++)   await insertNode(huges[i],   'huge',   8, hugePos[i]);

  // 검증
  const verify = await pool.query(`
    SELECT tier, COUNT(*) cnt FROM node_definitions
    WHERE class_exclusive = 'summoner' GROUP BY tier ORDER BY tier
  `);
  console.log('\n=== 소환사 노드 총합 (기존+신규) ===');
  for (const v of verify.rows) console.log(`  ${v.tier}: ${v.cnt}`);
  const total = await pool.query(`SELECT COUNT(*) cnt FROM node_definitions WHERE class_exclusive='summoner'`);
  console.log(`  총: ${total.rows[0].cnt}`);

  // 중복 position 확인
  const dup = await pool.query(`
    SELECT position_x, position_y, COUNT(*) cnt FROM node_definitions
    WHERE class_exclusive='summoner'
    GROUP BY position_x, position_y HAVING COUNT(*) > 1
  `);
  if (dup.rowCount > 0) {
    console.log('⚠️ 중복 position:');
    for (const d of dup.rows) console.log(`  (${d.position_x},${d.position_y}) x${d.cnt}`);
  } else {
    console.log('✓ position 중복 없음');
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
