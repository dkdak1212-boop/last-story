// 전사/마법사/성직자/도적 각 초월 노드 3개씩 추가 (총 12개)

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

const S = (stat, value) => ({ type: 'stat', stat, value });
const P = (key, value) => ({ type: 'passive', key, value });
const E = (arr) => JSON.stringify(arr);

const NODES = [
  // === WARRIOR ===
  { cls: 'warrior', name: '군주의 격노',   x: 2, y: -22, desc: '힘 +25, 분노 소모 -50%, 치명타 데미지 +20%',
    effects: E([S('str', 25), P('rage_reduce', 50), P('crit_damage', 20)]) },
  { cls: 'warrior', name: '불굴의 살해자', x: 8, y: -22, desc: '힘 +20, 체력 +15, 방어 관통 +25%, 치명타 데미지 +20%',
    effects: E([S('str', 20), S('vit', 15), P('armor_pierce', 25), P('crit_damage', 20)]) },
  { cls: 'warrior', name: '전장의 심판',   x: 5, y: -24, desc: '체력 +25, 힘 +15, 반사 데미지 +30%, 스킬 쿨다운 -1행동',
    effects: E([S('vit', 25), S('str', 15), P('reflect_amp', 30), P('mana_flow', 1)]) },

  // === MAGE ===
  { cls: 'mage', name: '원소의 주재자', x: 13, y: -22, desc: '지능 +30, 도트 데미지 +30%, 스킬 쿨다운 -1행동',
    effects: E([S('int', 30), P('dot_amp', 30), P('mana_flow', 1)]) },
  { cls: 'mage', name: '시간의 왜곡자', x: 18, y: -22, desc: '지능 +25, 동결 지속 +2행동, 게이지 제어 +60%',
    effects: E([S('int', 25), P('freeze_extend', 2), P('gauge_control_amp', 60)]) },
  { cls: 'mage', name: '별의 파괴자',   x: 15, y: -24, desc: '지능 +20, 치명타 확률 +5%, 치명타 데미지 +30%, 마법 증폭 +25%',
    effects: E([S('int', 20), S('cri', 5), P('crit_damage', 30), P('spell_amp', 25)]) },

  // === CLERIC ===
  { cls: 'cleric', name: '성스러운 왕관',   x: 23, y: -22, desc: '지능 +25, 체력 +15, 심판 증폭 +30%, 실드 증폭 +30%',
    effects: E([S('int', 25), S('vit', 15), P('judge_amp', 30), P('shield_amp', 30)]) },
  { cls: 'cleric', name: '광채의 화신',     x: 28, y: -22, desc: '지능 +30, 회복량 +40%, 치명타 흡혈 +25%',
    effects: E([S('int', 30), P('heal_amp', 40), P('crit_lifesteal', 25)]) },
  { cls: 'cleric', name: '심판의 대천사',   x: 25, y: -24, desc: '체력 +30, 심판 증폭 +40%, 스킬 쿨다운 -1행동',
    effects: E([S('vit', 30), P('judge_amp', 40), P('mana_flow', 1)]) },

  // === ROGUE ===
  { cls: 'rogue', name: '암흑의 귀환자',   x: 33, y: -22, desc: '민첩 +30, 치명타 확률 +5%, 치명타 데미지 +25%',
    effects: E([S('dex', 30), S('cri', 5), P('crit_damage', 25)]) },
  { cls: 'rogue', name: '독 군주',         x: 38, y: -22, desc: '민첩 +20, 지능 +15, 독 데미지 +50%, 독 폭발 +20%',
    effects: E([S('dex', 20), S('int', 15), P('poison_amp', 50), P('poison_burst_amp', 20)]) },
  { cls: 'rogue', name: '암살자의 진수',   x: 35, y: -24, desc: '민첩 +25, 치명타 확률 +5%, 연계 행동 증폭 +30%, 치명타 흡혈 +20%',
    effects: E([S('dex', 25), S('cri', 5), P('chain_action_amp', 30), P('crit_lifesteal', 20)]) },
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 시퀀스 안전 리셋
    await client.query(`SELECT setval(pg_get_serial_sequence('node_definitions','id'), COALESCE((SELECT MAX(id) FROM node_definitions), 1))`);

    // 직업별로 기존 large 노드 하나 선택해서 prereq 로 사용
    const prereqByClass = {};
    for (const cls of ['warrior', 'mage', 'cleric', 'rogue']) {
      const r = await client.query(
        `SELECT id FROM node_definitions WHERE class_exclusive=$1 AND tier='large' ORDER BY id LIMIT 1`,
        [cls]
      );
      prereqByClass[cls] = r.rows[0] ? [r.rows[0].id] : null;
    }
    console.log('prereq per class:', prereqByClass);

    let inserted = 0;
    for (const n of NODES) {
      const dup = await client.query(
        `SELECT id FROM node_definitions WHERE class_exclusive=$1 AND name=$2`,
        [n.cls, n.name]
      );
      if (dup.rowCount > 0) { console.log(`  [${n.name}] 이미 존재 — 스킵`); continue; }
      await client.query(
        `INSERT INTO node_definitions
         (name, description, zone, tier, cost, class_exclusive, effects, prerequisites, position_x, position_y)
         VALUES ($1, $2, 'core', 'huge', 8, $3, $4::jsonb, $5::int[], $6, $7)`,
        [n.name, n.desc, n.cls, n.effects, prereqByClass[n.cls], n.x, n.y]
      );
      inserted++;
      console.log(`  ✓ [${n.cls}] ${n.name}`);
    }
    await client.query('COMMIT');
    console.log(`\n추가: ${inserted}/${NODES.length}개`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // 검증
  const v = await pool.query(
    `SELECT class_exclusive, COUNT(*) cnt FROM node_definitions WHERE tier='huge' AND class_exclusive IN ('warrior','mage','cleric','rogue') GROUP BY class_exclusive ORDER BY class_exclusive`
  );
  console.log('\n=== 초월 노드 수 (직업별) ===');
  for (const r of v.rows) console.log(' ', r.class_exclusive, r.cnt);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
