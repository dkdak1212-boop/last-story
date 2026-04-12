const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 발라카스 (Lv.70) — 2셋: 힘/지/체+20 | 4셋: 힘/지/체+40, 속+50, ATK/MATK+100 | 6셋: 힘/지/체+70, 속+80, 치+10, ATK/MATK+200, HP+1000
  await pool.query(`UPDATE item_sets SET
    set_bonus_2 = $1::jsonb,
    set_bonus_4 = $2::jsonb,
    set_bonus_6 = $3::jsonb,
    description = $4
    WHERE id = 1`, [
    JSON.stringify({ str: 20, int: 20, vit: 20 }),
    JSON.stringify({ str: 40, int: 40, vit: 40, spd: 50, atk: 100, matk: 100 }),
    JSON.stringify({ str: 70, int: 70, vit: 70, spd: 80, cri: 10, atk: 200, matk: 200, hp: 1000 }),
    '2셋: 힘/지/체+20 | 4셋: 힘/지/체+40, 속+50, 공/마공+100 | 6셋: 힘/지/체+70, 속+80, 치+10, 공/마공+200, HP+1000'
  ]);
  console.log('발라카스 세트 보너스 상향');

  // 카르나스 (Lv.80) — 2셋: 힘/지/체+30 | 4셋: 힘/지/체+50, 속+60, ATK/MATK+150 | 6셋: 힘/지/체+80, 속+100, 치+15, ATK/MATK+300, HP+1500
  await pool.query(`UPDATE item_sets SET
    set_bonus_2 = $1::jsonb,
    set_bonus_4 = $2::jsonb,
    set_bonus_6 = $3::jsonb,
    description = $4
    WHERE id = 2`, [
    JSON.stringify({ str: 30, int: 30, vit: 30 }),
    JSON.stringify({ str: 50, int: 50, vit: 50, spd: 60, atk: 150, matk: 150 }),
    JSON.stringify({ str: 80, int: 80, vit: 80, spd: 100, cri: 15, atk: 300, matk: 300, hp: 1500 }),
    '2셋: 힘/지/체+30 | 4셋: 힘/지/체+50, 속+60, 공/마공+150 | 6셋: 힘/지/체+80, 속+100, 치+15, 공/마공+300, HP+1500'
  ]);
  console.log('카르나스 세트 보너스 상향');

  // 아트라스 (Lv.90) — 2셋: 힘/지/체+40 | 4셋: 힘/지/체+70, 속+80, ATK/MATK+200 | 6셋: 힘/지/체+100, 속+120, 치+20, ATK/MATK+400, HP+2000
  await pool.query(`UPDATE item_sets SET
    set_bonus_2 = $1::jsonb,
    set_bonus_4 = $2::jsonb,
    set_bonus_6 = $3::jsonb,
    description = $4
    WHERE id = 3`, [
    JSON.stringify({ str: 40, int: 40, vit: 40 }),
    JSON.stringify({ str: 70, int: 70, vit: 70, spd: 80, atk: 200, matk: 200 }),
    JSON.stringify({ str: 100, int: 100, vit: 100, spd: 120, cri: 20, atk: 400, matk: 400, hp: 2000 }),
    '2셋: 힘/지/체+40 | 4셋: 힘/지/체+70, 속+80, 공/마공+200 | 6셋: 힘/지/체+100, 속+120, 치+20, 공/마공+400, HP+2000'
  ]);
  console.log('아트라스 세트 보너스 상향');

  // 검증
  const v = await pool.query(`SELECT name, description FROM item_sets ORDER BY id`);
  for (const s of v.rows) console.log(`\n${s.name}: ${s.description}`);

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
