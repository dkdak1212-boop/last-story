const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:kkdZoXIuKmAadyDcyOVzhPlJpiitIBhG@maglev.proxy.rlwy.net:53059/railway', max: 1 });

(async () => {
  // 노드 스크롤 +8 아이템 ID 확인
  const item = await pool.query(`SELECT id, name FROM items WHERE name LIKE '%노드 스크롤%+8%' OR name LIKE '%노드스크롤%8%'`);
  if (item.rowCount === 0) {
    // 찢어진 스크롤로 만드는 결과물 확인
    const craft = await pool.query(`SELECT result_item_ids FROM craft_recipes WHERE name LIKE '%노드%'`);
    console.log('craft result:', craft.rows);
    const altItem = await pool.query(`SELECT id, name FROM items WHERE id = 321`);
    console.log('item 321:', altItem.rows);
  } else {
    console.log('노드 스크롤:', item.rows);
  }

  const SCROLL_ID = 321;
  const NAMES = ['키리야', '니아'];

  for (const name of NAMES) {
    const charR = await pool.query(`SELECT id, name FROM characters WHERE name = $1`, [name]);
    if (charR.rowCount === 0) { console.log(`${name}: 캐릭터 없음`); continue; }
    const charId = charR.rows[0].id;

    // 빈 슬롯 찾기
    const usedR = await pool.query(`SELECT slot_index FROM character_inventory WHERE character_id = $1`, [charId]);
    const used = new Set(usedR.rows.map(r => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < 300; i++) if (!used.has(i)) { freeSlot = i; break; }
    if (freeSlot < 0) { console.log(`${name}: 인벤토리 가득`); continue; }

    await pool.query(
      `INSERT INTO character_inventory (character_id, item_id, slot_index, quantity) VALUES ($1, $2, $3, 1)`,
      [charId, SCROLL_ID, freeSlot]
    );
    console.log(`${name} (id=${charId}): 노드 스크롤 +8 지급 완료 (슬롯 ${freeSlot})`);
  }

  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
