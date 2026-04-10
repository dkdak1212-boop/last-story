const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway',
  max: 1,
});

// 21개 필드 정의 — Lv 1-5, 5-10, ..., 100+
const FIELDS = [
  { idx: 1,  name: '초원',           reqLv: 1,   tier: 1,  itemLv: 1 },
  { idx: 2,  name: '숲 외곽',        reqLv: 5,   tier: 2,  itemLv: 1 },
  { idx: 3,  name: '깊은 숲',        reqLv: 10,  tier: 3,  itemLv: 10 },
  { idx: 4,  name: '버려진 광산',    reqLv: 15,  tier: 4,  itemLv: 10 },
  { idx: 5,  name: '저주받은 늪',    reqLv: 20,  tier: 5,  itemLv: 20 },
  { idx: 6,  name: '사막 입구',      reqLv: 25,  tier: 6,  itemLv: 20 },
  { idx: 7,  name: '사막 심부',      reqLv: 30,  tier: 7,  itemLv: 30 },
  { idx: 8,  name: '용암 동굴',      reqLv: 35,  tier: 8,  itemLv: 30 },
  { idx: 9,  name: '북쪽 빙원',      reqLv: 40,  tier: 9,  itemLv: 40 },
  { idx: 10, name: '고대 유적',      reqLv: 45,  tier: 10, itemLv: 40 },
  { idx: 11, name: '어둠의 문',      reqLv: 50,  tier: 11, itemLv: 50 },
  { idx: 12, name: '심연',           reqLv: 55,  tier: 12, itemLv: 50 },
  { idx: 13, name: '나가의 소굴',    reqLv: 60,  tier: 13, itemLv: 60 },
  { idx: 14, name: '하늘 절벽',      reqLv: 65,  tier: 14, itemLv: 60 },
  { idx: 15, name: '히드라의 둥지',  reqLv: 70,  tier: 15, itemLv: 70 },
  { idx: 16, name: '황혼의 성채',    reqLv: 75,  tier: 16, itemLv: 70 },
  { idx: 17, name: '타이탄의 왕좌',  reqLv: 80,  tier: 17, itemLv: 80 },
  { idx: 18, name: '신들의 무덤',    reqLv: 85,  tier: 18, itemLv: 80 },
  { idx: 19, name: '천공의 회랑',    reqLv: 90,  tier: 19, itemLv: 90 },
  { idx: 20, name: '시간의 끝',      reqLv: 95,  tier: 20, itemLv: 90 },
  { idx: 21, name: '무한의 차원',    reqLv: 100, tier: 21, itemLv: 100 },
];

// 각 필드당 2마리 = 42마리. 기존 36 + 신규 6
// 새 몬스터 정의 (Lv90+) — id는 자동 할당
const NEW_MONSTERS = [
  { name: '천공의 기사',  level: 92, hp: 380000 },
  { name: '차원의 전사',  level: 94, hp: 420000 },
  { name: '별의 사도',    level: 96, hp: 480000 },
  { name: '신화의 거인',  level: 98, hp: 540000 },
  { name: '시간의 군주',  level: 102, hp: 700000 },
  { name: '무한의 화신',  level: 105, hp: 900000 },
];

// 필드별 몬스터 매핑 (필드 → 몬스터 2마리 [name, levelOffset])
// 기존 36마리 + 신규 6마리 = 42 → 21필드 × 2
const FIELD_MONSTERS = [
  // Lv 1-5
  { fieldIdx: 1,  monsters: [{ name: '들쥐', lv: 2 }, { name: '고블린', lv: 4 }] },
  // Lv 5-10
  { fieldIdx: 2,  monsters: [{ name: '늑대', lv: 6 }, { name: '숲 거미', lv: 9 }] },
  // Lv 10-15
  { fieldIdx: 3,  monsters: [{ name: '오크 전사', lv: 12 }, { name: '동굴 박쥐', lv: 14 }] },
  // Lv 15-20
  { fieldIdx: 4,  monsters: [{ name: '광산 도적', lv: 17 }, { name: '늪 악어', lv: 19 }] },
  // Lv 20-25
  { fieldIdx: 5,  monsters: [{ name: '저주받은 유령', lv: 22 }, { name: '사막 전갈', lv: 24 }] },
  // Lv 25-30
  { fieldIdx: 6,  monsters: [{ name: '방랑 기사', lv: 27 }, { name: '모래 웜', lv: 29 }] },
  // Lv 30-35
  { fieldIdx: 7,  monsters: [{ name: '도굴꾼', lv: 32 }, { name: '용암 정령', lv: 34 }] },
  // Lv 35-40
  { fieldIdx: 8,  monsters: [{ name: '마그마 골렘', lv: 37 }, { name: '서리 늑대', lv: 39 }] },
  // Lv 40-45
  { fieldIdx: 9,  monsters: [{ name: '얼음 거인', lv: 42 }, { name: '유적 수호자', lv: 44 }] },
  // Lv 45-50
  { fieldIdx: 10, monsters: [{ name: '미라', lv: 47 }, { name: '악마 수하', lv: 49 }] },
  // Lv 50-55
  { fieldIdx: 11, monsters: [{ name: '심연의 그림자', lv: 52 }, { name: '나가 전사', lv: 54 }] },
  // Lv 55-60
  { fieldIdx: 12, monsters: [{ name: '트롤 광전사', lv: 57 }, { name: '그리폰', lv: 59 }] },
  // Lv 60-65
  { fieldIdx: 13, monsters: [{ name: '가고일', lv: 62 }, { name: '망자의 기사', lv: 64 }] },
  // Lv 65-70
  { fieldIdx: 14, monsters: [{ name: '오거 마법사', lv: 67 }, { name: '와이번', lv: 69 }] },
  // Lv 70-75
  { fieldIdx: 15, monsters: [{ name: '만티코어', lv: 72 }, { name: '고대 리치', lv: 74 }] },
  // Lv 75-80
  { fieldIdx: 16, monsters: [{ name: '어둠의 피닉스', lv: 77 }, { name: '보스: 숲의 왕', lv: 79 }] },
  // Lv 80-85
  { fieldIdx: 17, monsters: [{ name: '보스: 염제', lv: 82 }, { name: '보스: 어둠의 군주', lv: 84 }] },
  // Lv 85-90
  { fieldIdx: 18, monsters: [{ name: '보스: 히드라', lv: 87 }, { name: '보스: 타이탄', lv: 89 }] },
  // Lv 90-95
  { fieldIdx: 19, monsters: [{ name: '천공의 기사', lv: 92 }, { name: '차원의 전사', lv: 94 }] },
  // Lv 95-100
  { fieldIdx: 20, monsters: [{ name: '별의 사도', lv: 96 }, { name: '신화의 거인', lv: 98 }] },
  // Lv 100+
  { fieldIdx: 21, monsters: [{ name: '시간의 군주', lv: 102 }, { name: '무한의 화신', lv: 105 }] },
];

// 필드 tier별 드랍 확률 매핑 (저렙 → 고확률)
function getDropChance(tier) {
  // tier 1~3: 저렙존 (높은 확률)
  // tier 4~10: 중렙
  // tier 11~17: 고렙
  // tier 18~21: 최고렙
  if (tier <= 3) return { weapon: 0.12, armor: 0.12, accessory: 0.08 };
  if (tier <= 7) return { weapon: 0.08, armor: 0.08, accessory: 0.05 };
  if (tier <= 12) return { weapon: 0.05, armor: 0.05, accessory: 0.04 };
  if (tier <= 17) return { weapon: 0.03, armor: 0.03, accessory: 0.025 };
  return { weapon: 0.02, armor: 0.02, accessory: 0.015 };
}

// 몬스터 스탯 곡선 (레벨별)
function calcMonsterStats(level) {
  // Lv1: hp 90, atk 10
  // Lv100: hp 600000, atk 1500
  const hp = Math.round(90 * Math.pow(1.10, level - 1));
  const baseStat = Math.max(5, level * 1.5);
  return {
    str: Math.round(baseStat),
    dex: Math.round(baseStat * 0.7),
    int: Math.round(baseStat * 0.5),
    vit: Math.round(baseStat),
    spd: Math.min(800, 100 + level * 5),
    cri: Math.min(30, Math.floor(level / 5)),
  };
}

(async()=>{
  const client = await pool.connect();
  try {
    // 1. 새 아이템 ID 매핑 가져오기 (레벨별 → 아이템 IDs)
    const itemRows = await client.query(`
      SELECT id, type, slot, required_level FROM items
      WHERE type IN ('weapon','armor','accessory') AND grade = 'common'
        AND id NOT IN (293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319)
      ORDER BY required_level, type
    `);
    // itemsByLevel[lv] = { weapon: [], armor: [], accessory: [] }
    const itemsByLevel = {};
    for (const r of itemRows.rows) {
      const lv = r.required_level;
      if (!itemsByLevel[lv]) itemsByLevel[lv] = { weapon: [], armor: [], accessory: [] };
      itemsByLevel[lv][r.type].push(r.id);
    }
    console.log('아이템 레벨대:', Object.keys(itemsByLevel).join(', '));

    // 2. 기존 monster_drops/sessions 정리 — 안전하게 만들기 위해 character_inventory 등은 그대로
    // 3. 새 몬스터 6마리 추가
    console.log('\n[1/4] 새 몬스터 추가...');
    for (const m of NEW_MONSTERS) {
      // 이미 있으면 skip
      const exists = await client.query('SELECT id FROM monsters WHERE name = $1', [m.name]);
      if (exists.rowCount > 0) {
        console.log('  skip (이미 존재):', m.name);
        continue;
      }
      const stats = calcMonsterStats(m.level);
      const exp = Math.round(m.level * m.level * 5);
      const gold = Math.round(m.level * 30);
      await client.query(
        `INSERT INTO monsters (name, level, max_hp, exp_reward, gold_reward, stats, drop_table, avg_kill_time_sec)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, '[]'::jsonb, 10)`,
        [m.name, m.level, m.hp, exp, gold, JSON.stringify(stats)]
      );
      console.log('  추가:', m.name, 'Lv'+m.level);
    }

    // 4. 모든 몬스터 레벨/HP/스탯 재설정 (FIELD_MONSTERS 기반)
    console.log('\n[2/4] 몬스터 스탯 재계산...');
    for (const fm of FIELD_MONSTERS) {
      for (const mon of fm.monsters) {
        const stats = calcMonsterStats(mon.lv);
        const hp = Math.round(90 * Math.pow(1.10, mon.lv - 1));
        const exp = Math.round(mon.lv * mon.lv * 5);
        const gold = Math.round(mon.lv * 8);
        await client.query(
          `UPDATE monsters SET level = $1, max_hp = $2, exp_reward = $3, gold_reward = $4, stats = $5::jsonb
           WHERE name = $6`,
          [mon.lv, hp, exp, gold, JSON.stringify(stats), mon.name]
        );
      }
    }
    console.log('  완료');

    // 5. 각 몬스터의 drop_table 재설정
    console.log('\n[3/4] 드랍 테이블 재설정...');
    for (const fm of FIELD_MONSTERS) {
      const fieldDef = FIELDS[fm.fieldIdx - 1];
      const itemLv = fieldDef.itemLv;
      const items = itemsByLevel[itemLv];
      if (!items) { console.log('  no items for Lv', itemLv); continue; }
      const drops = [];
      const chances = getDropChance(fieldDef.tier);
      // 무기 (4직업 중 랜덤 1개씩 chance)
      for (const wid of items.weapon) drops.push({ itemId: wid, chance: chances.weapon, minQty: 1, maxQty: 1 });
      for (const aid of items.armor) drops.push({ itemId: aid, chance: chances.armor, minQty: 1, maxQty: 1 });
      for (const cid of items.accessory) drops.push({ itemId: cid, chance: chances.accessory, minQty: 1, maxQty: 1 });
      // 골드 드랍은 monster.gold_reward로 처리

      for (const mon of fm.monsters) {
        await client.query('UPDATE monsters SET drop_table = $1::jsonb WHERE name = $2',
          [JSON.stringify(drops), mon.name]);
      }
    }
    console.log('  완료');

    // 6. 필드 재설정
    console.log('\n[4/4] 필드 재설정...');
    // 기존 필드 ID 가져오기 (1-25 범위)
    const fieldRows = await client.query('SELECT id, name FROM fields ORDER BY id');
    const existingFields = fieldRows.rows;
    console.log('  기존 필드:', existingFields.length, '개');

    // 기존 필드 모두 삭제 후 재생성
    // 단, 외래키(combat_sessions.field_id 등) 정리 필요
    await client.query('DELETE FROM combat_sessions');
    await client.query('DELETE FROM fields');

    // 새 필드 21개 INSERT
    for (const f of FIELDS) {
      // 해당 필드의 몬스터 ID 조회
      const fm = FIELD_MONSTERS.find(x => x.fieldIdx === f.idx);
      const monsterIds = [];
      for (const mon of fm.monsters) {
        const mr = await client.query('SELECT id FROM monsters WHERE name = $1', [mon.name]);
        if (mr.rows[0]) monsterIds.push(mr.rows[0].id);
      }
      const desc = `Lv ${f.reqLv}~${f.idx === 21 ? '∞' : f.reqLv + 5} 사냥터`;
      await client.query(
        `INSERT INTO fields (id, name, required_level, monster_pool, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [f.idx, f.name, f.reqLv, monsterIds, desc]
      );
    }
    // 시퀀스 리셋
    await client.query(`SELECT setval('fields_id_seq', 21, true)`);
    console.log('  필드 21개 생성 완료');

    // 검증
    const v = await client.query('SELECT id, name, required_level, monster_pool FROM fields ORDER BY required_level');
    console.log('\n=== 최종 필드 ===');
    v.rows.forEach(f => console.log(`  ${f.id}. Lv${f.required_level} ${f.name} | 몬스터 ${f.monster_pool.length}마리`));

  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('FAIL:', e.message); console.error(e.stack); process.exit(1); });
