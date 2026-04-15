// 소환사 엔드게임 스킬 5개 + 구슬 무기 14개 추가
// 새 스킬은 element 태그 포함 → 기존 노드 트리 원소 보너스 자동 적용

const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ═══ 1. 소환사 스킬 5개 (lv80, 85, 90, 95, 100) ═══
    // 모두 element 태그로 노드 트리 원소 보너스 자동 적용
    const skills = [
      {
        name: '얼음 여왕 소환', lv: 80, kind: 'damage',
        effect_type: 'summon', mult: 2.5, flat: 0, val: 250, dur: 6, cd: 10,
        element: 'frost',
        desc: '강력한 얼음 여왕을 소환 (MATK x250%, 6행동). 빙결 원소 노드 적용.',
      },
      {
        name: '뇌신 소환', lv: 85, kind: 'damage',
        effect_type: 'summon', mult: 2.8, flat: 0, val: 280, dur: 6, cd: 11,
        element: 'lightning',
        desc: '번개 정령왕을 소환 (MATK x280%, 6행동). 번개 원소 노드 적용.',
      },
      {
        name: '대지 거신 소환', lv: 90, kind: 'damage',
        effect_type: 'summon_tank', mult: 2.0, flat: 0, val: 200, dur: 10, cd: 11,
        element: 'earth',
        desc: '거대한 대지 거신을 소환 (MATK x200%, 10행동, 받는 데미지 20% 감소). 대지 원소 노드 적용.',
      },
      {
        name: '천상의 수호자', lv: 95, kind: 'damage',
        effect_type: 'summon_heal', mult: 2.5, flat: 0, val: 250, dur: 10, cd: 12,
        element: 'holy',
        desc: '빛의 수호자를 소환 (MATK x250%, 10행동, 매 행동 HP 5% 회복). 신성 원소 노드 적용.',
      },
      {
        name: '시공의 지배자', lv: 100, kind: 'damage',
        effect_type: 'summon_multi', mult: 2.0, flat: 0, val: 200, dur: 8, cd: 15,
        element: 'dark',
        desc: '시공의 지배자를 소환 (MATK x200% x3회 연타, 8행동). 최강 암흑 소환수. 암흑 원소 노드 적용.',
      },
    ];

    let skillInserted = 0;
    for (const s of skills) {
      // 동일 이름 스킬 중복 방지
      const exists = await client.query(`SELECT id FROM skills WHERE name=$1 AND class_name='summoner'`, [s.name]);
      if (exists.rowCount > 0) {
        console.log(`  스킬 [${s.name}] 이미 존재 — 스킵`);
        continue;
      }
      await client.query(
        `INSERT INTO skills (class_name, name, description, required_level, damage_mult, kind, cooldown_actions, flat_damage, effect_type, effect_value, effect_duration, icon, element)
         VALUES ('summoner', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '', $11)`,
        [s.name, s.desc, s.lv, s.mult, s.kind, s.cd, s.flat, s.effect_type, s.val, s.dur, s.element]
      );
      skillInserted++;
    }
    console.log(`스킬 추가: ${skillInserted}/5`);

    // ═══ 2. 구슬 무기 (common 11 + legendary 3) ═══
    // 기본 matk 값은 mage 지팡이와 동일
    const orbsCommon = [
      { name: '견습 구슬',       lv: 1,   matk: 10,  price: 125 },
      { name: '훈련용 구슬',     lv: 10,  matk: 24,  price: 300 },
      { name: '일반 구슬',       lv: 20,  matk: 44,  price: 550 },
      { name: '정교한 구슬',     lv: 30,  matk: 70,  price: 875 },
      { name: '정련된 구슬',     lv: 40,  matk: 104, price: 1300 },
      { name: '단단한 구슬',     lv: 50,  matk: 150, price: 1875 },
      { name: '강철 구슬',       lv: 60,  matk: 210, price: 2625 },
      { name: '정예 구슬',       lv: 70,  matk: 290, price: 3625 },
      { name: '영웅 구슬',       lv: 80,  matk: 390, price: 4875 },
      { name: '전설 구슬',       lv: 90,  matk: 520, price: 6500 },
      { name: '신화 구슬',       lv: 100, matk: 680, price: 8500 },
    ];
    // 세트 legendary — 발라카스/카르나스/아트라스 세트에 합류
    const orbsLegendary = [
      { name: '발라카스의 구슬',  lv: 70, matk: 522, price: 100000, set: 1 }, // set_id 확인 필요
      { name: '카르나스의 구슬',  lv: 80, matk: 702, price: 150000, set: 2 },
      { name: '아트라스의 구슬',  lv: 90, matk: 936, price: 250000, set: 3 },
    ];

    // set_id 조회
    const setR = await client.query(`SELECT id, name FROM item_sets ORDER BY id`);
    const setMap = {};
    for (const row of setR.rows) {
      if (row.name.includes('발라카스')) setMap.balakas = row.id;
      else if (row.name.includes('카르나스')) setMap.karnas = row.id;
      else if (row.name.includes('아트라스')) setMap.atlas = row.id;
    }
    console.log('set IDs:', JSON.stringify(setMap));

    let itemInserted = 0;
    for (const o of orbsCommon) {
      const exists = await client.query(`SELECT id FROM items WHERE name=$1`, [o.name]);
      if (exists.rowCount > 0) { console.log(`  [${o.name}] 이미 존재 — 스킵`); continue; }
      await client.query(
        `INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level, class_restriction)
         VALUES ($1, 'weapon', 'common', 'weapon', $2::jsonb, $3, 1, $4, $5, 'summoner')`,
        [o.name, JSON.stringify({ matk: o.matk }), `${o.name} — 소환사 전용 구슬`, o.price, o.lv]
      );
      itemInserted++;
    }
    console.log(`common 구슬 추가: ${itemInserted}/${orbsCommon.length}`);

    // legendary 세트 구슬
    let legInserted = 0;
    const legStats = {
      70: { hp: 300, int: 15, matk: 522 },
      80: { hp: 400, int: 20, matk: 702 },
      90: { hp: 500, int: 25, matk: 936 },
    };
    for (const o of orbsLegendary) {
      const exists = await client.query(`SELECT id FROM items WHERE name=$1`, [o.name]);
      if (exists.rowCount > 0) { console.log(`  [${o.name}] 이미 존재 — 스킵`); continue; }
      const setKey = o.lv === 70 ? 'balakas' : o.lv === 80 ? 'karnas' : 'atlas';
      const setId = setMap[setKey] || null;
      const stats = legStats[o.lv];
      await client.query(
        `INSERT INTO items (name, type, grade, slot, stats, description, stack_size, sell_price, required_level, class_restriction, set_id)
         VALUES ($1, 'weapon', 'legendary', 'weapon', $2::jsonb, $3, 1, $4, $5, 'summoner', $6)`,
        [o.name, JSON.stringify(stats), `${o.name} — 소환사 전용 전설 구슬`, o.price, o.lv, setId]
      );
      legInserted++;
    }
    console.log(`legendary 구슬 추가: ${legInserted}/${orbsLegendary.length}`);

    await client.query('COMMIT');
    console.log('\n✓ 모든 변경 커밋');

    // 검증
    const verify = await pool.query(`
      SELECT required_level, name, grade
      FROM items WHERE class_restriction='summoner' AND slot='weapon' AND name LIKE '%구슬%'
      ORDER BY required_level, grade
    `);
    console.log(`\n=== 구슬 무기 목록 (${verify.rowCount}개) ===`);
    for (const r of verify.rows) console.log(` lv${r.required_level} | ${r.grade} | ${r.name}`);

    const newSkills = await pool.query(`SELECT name, required_level, element, effect_type FROM skills WHERE class_name='summoner' AND required_level >= 80 ORDER BY required_level`);
    console.log(`\n=== 신규 엔드게임 스킬 (${newSkills.rowCount}개) ===`);
    for (const r of newSkills.rows) console.log(` lv${r.required_level} | ${r.name} (${r.element}) | ${r.effect_type}`);

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
