/**
 * 도적 계단식 선택형 노드 (north_rogue)
 * 10층, 각 층 3개 중 택1 = 총 30개 노드
 * hidden=true (어드민 테스트용)
 *
 * effects에 { type: 'tier_group', value: N } 추가하여 층 구분
 */
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

const ZONE = 'north_rogue';
const CLASS = 'rogue';

const TIERS = [
  {
    tier: 1, cost: 1, label: '기본',
    options: [
      { name: '강인한 체격', desc: 'STR +20, HP +50', effects: [{ type: 'stat', stat: 'str', value: 20 }, { type: 'stat', stat: 'hp', value: 50 }] },
      { name: '민첩한 신체', desc: 'DEX +20, SPD +8', effects: [{ type: 'stat', stat: 'dex', value: 20 }, { type: 'stat', stat: 'spd', value: 8 }] },
      { name: '날카로운 감각', desc: 'CRI +6, SPD +12', effects: [{ type: 'stat', stat: 'cri', value: 6 }, { type: 'stat', stat: 'spd', value: 12 }] },
    ],
  },
  {
    tier: 2, cost: 1, label: '공격 기초',
    options: [
      { name: '급소 공략', desc: '치명타 데미지 +10%', effects: [{ type: 'passive', key: 'crit_damage', value: 10 }] },
      { name: '이도류 수련', desc: '추가 타격 확률 +6%', effects: [{ type: 'passive', key: 'extra_hit', value: 6 }] },
      { name: '연속 베기', desc: '연쇄 행동 강화 +10%', effects: [{ type: 'passive', key: 'chain_action_amp', value: 10 }] },
    ],
  },
  {
    tier: 3, cost: 2, label: '특화 선택',
    options: [
      { name: '방어 분쇄', desc: '방어 관통 +10%', effects: [{ type: 'passive', key: 'armor_pierce', value: 10 }] },
      { name: '칼날 난무', desc: '칼날 추가타 확률 +10%', effects: [{ type: 'passive', key: 'blade_flurry', value: 10 }] },
      { name: '맹독 숙련', desc: '독 증폭 +15%', effects: [{ type: 'passive', key: 'poison_amp', value: 15 }] },
    ],
  },
  {
    tier: 4, cost: 2, label: '스탯 강화',
    options: [
      { name: '암살자의 근력', desc: 'STR +30, CRI +6', effects: [{ type: 'stat', stat: 'str', value: 30 }, { type: 'stat', stat: 'cri', value: 6 }] },
      { name: '질풍의 발놀림', desc: 'SPD +30, DEX +12', effects: [{ type: 'stat', stat: 'spd', value: 30 }, { type: 'stat', stat: 'dex', value: 12 }] },
      { name: '균형잡힌 전투술', desc: 'STR +18, SPD +18, CRI +4', effects: [{ type: 'stat', stat: 'str', value: 18 }, { type: 'stat', stat: 'spd', value: 18 }, { type: 'stat', stat: 'cri', value: 4 }] },
    ],
  },
  {
    tier: 5, cost: 3, label: '핵심 전투',
    options: [
      { name: '그림자 일격', desc: '첫 스킬 데미지 +30%', effects: [{ type: 'passive', key: 'shadow_strike', value: 30 }] },
      { name: '검풍 폭발', desc: 'multi_hit 타격당 누적 +15%', effects: [{ type: 'passive', key: 'blade_storm_amp', value: 15 }] },
      { name: '질풍 변환', desc: 'SPD → 데미지 변환 45%', effects: [{ type: 'passive', key: 'speed_to_dmg', value: 45 }] },
    ],
  },
  {
    tier: 6, cost: 2, label: '유틸리티',
    options: [
      { name: '피의 갈증', desc: '치명타 흡혈 +5%', effects: [{ type: 'passive', key: 'crit_lifesteal', value: 5 }] },
      { name: '킬 가속', desc: '킬 시 쿨다운 -2행동', effects: [{ type: 'passive', key: 'lethal_tempo', value: 2 }] },
      { name: '학살 본능', desc: '연속킬 보너스 +12%', effects: [{ type: 'passive', key: 'combo_kill_bonus', value: 12 }] },
    ],
  },
  {
    tier: 7, cost: 3, label: '상위 전투',
    options: [
      { name: '처형자의 눈', desc: '치명타 데미지 +18%, CRI +10', effects: [{ type: 'passive', key: 'crit_damage', value: 18 }, { type: 'stat', stat: 'cri', value: 10 }] },
      { name: '만검난무', desc: '추가 타격 +10%, 칼날 추가타 +12%', effects: [{ type: 'passive', key: 'extra_hit', value: 10 }, { type: 'passive', key: 'blade_flurry', value: 12 }] },
      { name: '폭풍의 화신', desc: '연쇄 행동 +15%, multi_hit 누적 +10%', effects: [{ type: 'passive', key: 'chain_action_amp', value: 15 }, { type: 'passive', key: 'blade_storm_amp', value: 10 }] },
    ],
  },
  {
    tier: 8, cost: 2, label: '극한 스탯',
    options: [
      { name: '살인 병기', desc: 'STR +40', effects: [{ type: 'stat', stat: 'str', value: 40 }] },
      { name: '폭풍 질주', desc: 'SPD +40', effects: [{ type: 'stat', stat: 'spd', value: 40 }] },
      { name: '전장의 지배자', desc: 'DEX +25, CRI +10', effects: [{ type: 'stat', stat: 'dex', value: 25 }, { type: 'stat', stat: 'cri', value: 10 }] },
    ],
  },
  {
    tier: 9, cost: 3, label: '상위 특화',
    options: [
      { name: '절대 관통', desc: '방어 관통 +15%, 치명타 데미지 +12%', effects: [{ type: 'passive', key: 'armor_pierce', value: 15 }, { type: 'passive', key: 'crit_damage', value: 12 }] },
      { name: '무한 칼날', desc: '칼날 추가타 +18%, 킬 시 쿨다운 -2', effects: [{ type: 'passive', key: 'blade_flurry', value: 18 }, { type: 'passive', key: 'lethal_tempo', value: 2 }] },
      { name: '맹독의 군주', desc: '독 증폭 +25%, 독 폭발 +18%', effects: [{ type: 'passive', key: 'poison_amp', value: 25 }, { type: 'passive', key: 'poison_burst_amp', value: 18 }] },
    ],
  },
  {
    tier: 10, cost: 5, label: '초월',
    options: [
      { name: '그림자 처형', desc: '치명타 시 적 HP 15% 이하 30% 즉사\n첫 스킬 데미지 +35%', effects: [{ type: 'passive', key: 'assassin_execute', value: 30 }, { type: 'passive', key: 'shadow_strike', value: 35 }] },
      { name: '칼날 폭풍', desc: '칼날 추가타 +25%\n추가 타격 +12%\n킬 시 쿨다운 -3', effects: [{ type: 'passive', key: 'blade_flurry', value: 25 }, { type: 'passive', key: 'extra_hit', value: 12 }, { type: 'passive', key: 'lethal_tempo', value: 3 }] },
      { name: '질풍노도', desc: 'SPD→데미지 55%\nSPD +35\n연쇄 행동 +20%', effects: [{ type: 'passive', key: 'speed_to_dmg', value: 55 }, { type: 'stat', stat: 'spd', value: 35 }, { type: 'passive', key: 'chain_action_amp', value: 20 }] },
    ],
  },
];

(async () => {
  console.log('=== 도적 계단식 노드 생성 ===');

  // 기존 north_rogue 도적 노드만 삭제 (다른 직업 절대 안 건드림)
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

  let inserted = 0;
  for (const t of TIERS) {
    for (let i = 0; i < t.options.length; i++) {
      const opt = t.options[i];
      const effects = [
        ...opt.effects,
        { type: 'tier_group', value: t.tier },
      ];
      const tier = t.tier === 10 ? 'huge' : t.cost >= 3 ? 'large' : t.cost >= 2 ? 'medium' : 'small';
      await pool.query(
        `INSERT INTO node_definitions (id, name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y, hidden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '{}', $9, $10, TRUE)`,
        [nextId, opt.name, opt.desc, ZONE, tier, t.cost, CLASS,
         JSON.stringify(effects), i - 1, -(t.tier)]  // x: -1,0,1 (좌/중/우), y: -tier
      );
      nextId++;
      inserted++;
    }
  }

  console.log(`${inserted}개 노드 삽입 (ID ${startId}~${nextId - 1})`);

  // 확인
  const check = await pool.query(
    'SELECT tier, COUNT(*) AS cnt FROM node_definitions WHERE zone = $1 AND class_exclusive = $2 GROUP BY tier ORDER BY tier',
    [ZONE, CLASS]
  );
  for (const r of check.rows) console.log(`  ${r.tier}: ${r.cnt}개`);

  // 다른 직업 안 건드렸는지 확인
  const otherCheck = await pool.query(
    "SELECT class_exclusive, COUNT(*) AS cnt FROM node_definitions WHERE class_exclusive != 'rogue' OR class_exclusive IS NULL GROUP BY class_exclusive"
  );
  console.log('다른 직업 노드 (변경 없어야 함):');
  for (const r of otherCheck.rows) console.log(`  ${r.class_exclusive || 'null'}: ${r.cnt}개`);

  await pool.end();
  console.log('=== 완료 ===');
})().catch(e => { console.error(e); process.exit(1); });
